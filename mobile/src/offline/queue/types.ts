/**
 * What a queued write looks like.
 *
 * Deliberately a *description of a request* rather than a closure. A closure
 * cannot be written to disk, and the whole point of this queue is that it
 * survives the process being killed. Everything needed to replay the action
 * — method, path, body, and above all the idempotency key — is data.
 */

export type QueueStatus =
  /** Waiting its turn. */
  | "pending"
  /** In flight right now. */
  | "sending"
  /** The server refused it in a way that retrying cannot fix. */
  | "failed"
  /** An earlier action on the same subject failed, so this one is unsafe to
   *  apply out of order — held rather than dropped (FR-14.27). */
  | "blocked";

/** What the action is about, so the UI can point at it and ordering can group. */
export type QueueSubject = {
  type: "asset" | "request";
  id: number;
  /** Human label for the conflict screen — "TRA-2026-000019". */
  label?: string;
};

export type QueuedMutation = {
  /** Local identity. Distinct from the idempotency key so a debug log can
   *  mention one without leaking the other into the server's namespace. */
  id: string;

  /**
   * BE-4. Generated **once, when the action is queued** — never per attempt.
   *
   * This single field is what makes the DoD true. A key minted at send time
   * would be new on every retry, the server would see each attempt as a
   * different action, and a check-in that was sent twice because the app died
   * between the response and recording it would apply twice.
   */
  idempotencyKey: string;

  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;

  /** What the user thinks they did — used for the pending marker and the
   *  eventual conflict screen. */
  kind: string;
  subject: QueueSubject;

  createdAt: number;
  attempts: number;
  /** Earliest time this may be tried again; backoff writes it. */
  nextAttemptAt: number;
  status: QueueStatus;
  /** The server's own sentence, kept verbatim for the conflict screen. */
  lastError?: string | null;
  lastStatusCode?: number | null;
};

/** The persisted shape. Versioned so a format change cannot be misread. */
export type PersistedQueue = {
  version: 1;
  items: QueuedMutation[];
};

export const QUEUE_VERSION = 1 as const;
