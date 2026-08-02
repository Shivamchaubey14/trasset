/**
 * API client.
 *
 * Mirrors `frontend/js/api.js`, which already solved this for the web: attach
 * the JWT, unwrap the envelope, refresh once on 401 and replay, and normalise
 * every failure into one error type.
 *
 * Three things differ because this is a phone, not a browser:
 *
 * * **Every request has a timeout.** `fetch` has none, and on bad signal a
 *   request can hang for ever — the spinner that never resolves is the
 *   signature failure of a mobile app (SRS §12.6). A hang is reported as a
 *   network error so the caller can show an offline state instead.
 * * **`X-Client: mobile`** goes on every request, which is what earns the
 *   30-day refresh lifetime instead of the web's 7 (BE-1).
 * * **`Idempotency-Key` is supported per call** (BE-4), so the offline queue on
 *   can replay a mutation without applying it twice. It is never
 *   generated automatically: a fresh key on each attempt would defeat the whole
 *   mechanism, so the key must come from whoever owns the retry.
 */
import { apiConfig } from "./config";
import { ApiError, FieldErrors, SessionExpiredError } from "./errors";
import { tokens } from "./tokens";

/** Long enough for a slow connection, short enough to fail rather than hang. */
const DEFAULT_TIMEOUT_MS = 20_000;

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  params?: QueryParams;
  body?: unknown;
  /** Multipart upload; the platform sets the boundary. */
  formData?: FormData;
  /** Replay-safe mutations (BE-4). Supplied by the caller, never invented. */
  idempotencyKey?: string;
  /** Skip the Authorization header — sign-in, refresh, password reset. */
  skipAuth?: boolean;
  /** Never attempt a token refresh for this call. */
  skipRefresh?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Standard envelope (SRS §5.1). */
interface Envelope<T> {
  success: boolean;
  message: string;
  data: T;
  errors: FieldErrors | null;
}

/** Overridden by the auth layer so the app can return to sign-in. */
let onSessionExpired: () => void = () => {};

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

function buildUrl(path: string, params?: QueryParams): string {
  const base = /^https?:/.test(path) ? path : `${apiConfig().baseUrl}${path}`;
  if (!params) return base;

  const query = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  if (!query.length) return base;
  return base + (base.includes("?") ? "&" : "?") + query.join("&");
}

async function parseBody(response: Response): Promise<Envelope<unknown> | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Envelope<unknown>;
  } catch {
    return null;
  }
}

function toApiError(status: number, body: Envelope<unknown> | null): ApiError {
  if (body?.message) return new ApiError(status, body.message, body.errors);
  if (status >= 500) {
    return new ApiError(status, "The server ran into a problem. Please try again.");
  }
  return new ApiError(status, `Request failed (${status}).`);
}

// ---------------------------------------------------------------------------
// Token refresh — single-flight, so N parallel 401s cause one refresh rather
// than N. Without this, a screen firing four queries at once on a stale token
// would burn four refreshes and, with rotation on (SEC-2), invalidate its own
// session in the process.
// ---------------------------------------------------------------------------
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = await tokens.getRefresh();
    if (!refresh) throw new SessionExpiredError();

    let response: Response;
    try {
      response = await fetch(`${apiConfig().baseUrl}/auth/refresh/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client": apiConfig().client,
        },
        body: JSON.stringify({ refresh }),
      });
    } catch {
      // Offline. Not an expired session — do not sign the user out for it,
      // or a tunnel ride would log everybody off.
      throw new ApiError(0, "Cannot reach Trasset. Check your connection.");
    }

    const body = await parseBody(response);
    const access = (body?.data as { access?: string; refresh?: string } | undefined)?.access;

    if (!response.ok || !access) throw new SessionExpiredError();

    // Rotation is on server-side (SEC-2), so the new refresh token must be
    // stored or the next refresh presents a blacklisted one.
    const rotated = (body?.data as { refresh?: string } | undefined)?.refresh;
    await tokens.set(access, rotated ?? refresh);
    return access;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function send<T>(options: RequestOptions, isRetry = false): Promise<T> {
  const {
    method = "GET",
    path,
    params,
    body,
    formData,
    idempotencyKey,
    skipAuth,
    skipRefresh,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
  } = options;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Client": apiConfig().client,
  };

  const access = tokens.getAccess();
  if (access && !skipAuth) headers.Authorization = `Bearer ${access}`;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let payload: BodyInit | undefined;
  if (formData) {
    // Content-Type is deliberately unset: the platform adds the multipart
    // boundary, and setting it by hand produces an unparseable request.
    payload = formData as unknown as BodyInit;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort());

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    throw new ApiError(
      0,
      aborted
        ? "That took too long. Check your connection and try again."
        : "Cannot reach Trasset. Check your connection.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) {
    const parsed = await parseBody(response);
    // 204 and other empty bodies unwrap to null rather than throwing.
    return (parsed ? (parsed.data as T) : (null as T)) as T;
  }

  // A 401 on an authenticated call means the access token aged out. Refresh
  // once and replay — but only once, or a genuinely revoked session loops.
  const canRetry =
    response.status === 401 && !isRetry && !skipAuth && !skipRefresh;

  if (canRetry) {
    try {
      await refreshAccessToken();
      return await send<T>(options, true);
    } catch (error) {
      if (error instanceof SessionExpiredError) onSessionExpired();
      throw error;
    }
  }

  if (response.status === 401 && !skipAuth) onSessionExpired();
  throw toApiError(response.status, await parseBody(response));
}

export const api = {
  request: send,

  get: <T>(path: string, params?: QueryParams, options?: Partial<RequestOptions>) =>
    send<T>({ ...options, method: "GET", path, params }),

  post: <T>(path: string, body?: unknown, options?: Partial<RequestOptions>) =>
    send<T>({ ...options, method: "POST", path, body }),

  patch: <T>(path: string, body?: unknown, options?: Partial<RequestOptions>) =>
    send<T>({ ...options, method: "PATCH", path, body }),

  put: <T>(path: string, body?: unknown, options?: Partial<RequestOptions>) =>
    send<T>({ ...options, method: "PUT", path, body }),

  delete: <T>(path: string, options?: Partial<RequestOptions>) =>
    send<T>({ ...options, method: "DELETE", path }),

  upload: <T>(path: string, formData: FormData, method: "POST" | "PATCH" = "POST") =>
    send<T>({ method, path, formData }),
};

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
export async function login(email: string, password: string) {
  const data = await send<{ access: string; refresh: string; user: unknown }>({
    method: "POST",
    path: "/auth/login/",
    body: { email, password },
    skipAuth: true,
    skipRefresh: true,
  });
  await tokens.set(data.access, data.refresh);
  return data;
}

export async function logout(pushToken?: string) {
  const refresh = await tokens.getRefresh();
  if (refresh) {
    try {
      // Blacklists the refresh token and deregisters this handset in one call
      // (BE-2), so a signed-out phone stops receiving push immediately.
      await send({
        method: "POST",
        path: "/auth/logout/",
        body: { refresh, ...(pushToken ? { push_token: pushToken } : {}) },
      });
    } catch {
      // Already invalid, or offline. Sign out locally regardless — refusing to
      // sign someone out because the network is down is indefensible.
    }
  }
  await tokens.clear();
}

/**
 * Restore a session at launch (FR-14.3).
 *
 * The access token is memory-only, so after a cold start there is only the
 * refresh token to trade in.
 */
export async function restoreSession(): Promise<boolean> {
  if (tokens.getAccess()) return true;
  if (!(await tokens.getRefresh())) return false;
  try {
    await refreshAccessToken();
    return true;
  } catch (error) {
    // Offline is not an expired session: keep the token and try again later.
    if (error instanceof ApiError && error.isNetworkError) return false;
    await tokens.clear();
    return false;
  }
}
