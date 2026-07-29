/**
 * Environment configuration (Day 36).
 *
 * The API base URL differs per build profile, and — importantly for local work
 * — a phone cannot reach `127.0.0.1`, because that is the phone itself. On a
 * device the host machine's LAN address is required. Expo hands us the address
 * the packager is being served from, so the default is derived from that rather
 * than hard-coded and forgotten.
 *
 * MNFR-5: no secrets here. A mobile bundle is a public binary.
 */
import Constants from "expo-constants";

const DEFAULT_PORT = 8000;
const API_PATH = "/api/v1";

function hostFromPackager(): string | null {
  // e.g. "192.168.1.20:8081" — the machine running `expo start`.
  const raw = Constants.expoConfig?.hostUri ?? null;
  if (!raw) return null;
  const host = String(raw).split(":")[0];
  return host || null;
}

function resolveApiUrl(): string {
  const configured = Constants.expoConfig?.extra?.apiUrl as string | undefined;

  // A configured non-loopback URL wins — that is a real deployment.
  if (configured && !configured.includes("127.0.0.1") && !configured.includes("localhost")) {
    return configured;
  }

  const host = hostFromPackager();
  if (host) return `http://${host}:${DEFAULT_PORT}${API_PATH}`;

  return configured ?? `http://127.0.0.1:${DEFAULT_PORT}${API_PATH}`;
}

export const env = {
  apiUrl: resolveApiUrl(),
  /** Sent on every request so the server issues a 30-day refresh (BE-1). */
  client: "mobile" as const,
};
