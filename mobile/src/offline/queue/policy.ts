/**
 * Every decision the queue makes, as pure functions.
 *
 * The engine that follows is mostly plumbing; the judgement is here, where it
 * can be exercised exhaustively without a server, a network or a device. The
 * three that matter:
 *
 *   * **what is worth retrying** — retrying a 400 forever is a queue that never
 *     empties, and giving up on a 503 is work silently lost;
 *   * **what order things go in** — two actions on one asset applied backwards
 *     leave it in a state the user never asked for;
 *   * **what happens after a refusal** — never a silent drop (FR-14.27).
 */
import type { QueuedMutation } from "./types";

/** First retry waits this long; each subsequent one doubles. */
export const BASE_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * After this many attempts an item stops being retried automatically.
 *
 * Not a drop — it becomes `failed` and waits for a person. An action retried
 * forever on a broken assumption is indistinguishable from one that is stuck,
 * and the user can see neither.
 */
export const MAX_ATTEMPTS = 8;

/**
 * Whether a failure is worth trying again.
 *
 * Status 0 is this client's "never reached the server" — the offline case, and
 * the one the whole queue exists for. 5xx is the server having a bad moment.
 * 408 and 429 are explicit invitations to try later.
 *
 * Everything else in the 4xx range is the server saying the request itself is
 * wrong, and it will keep saying so. **409 in particular is deliberately not
 * retryable**: it means the world moved — someone else took the asset — and
 * repeating the request cannot fix that. It needs a person, which is what the
 * conflict screen is for.
 */
export function isRetryable(statusCode: number): boolean {
  if (statusCode === 0) return true;
  if (statusCode === 408 || statusCode === 429) return true;
  return statusCode >= 500;
}

/**
 * How long to wait before attempt number `attempts + 1`.
 *
 * `jitter` is injected rather than drawn inside, so the schedule is
 * deterministic under test. Pass a value in [0, 1); production passes a random
 * one, which keeps a queue of several items from retrying in lockstep the
 * instant a flaky connection returns.
 */
export function backoffFor(attempts: number, jitter = 0): number {
  const exponential = BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1);
  const capped = Math.min(exponential, MAX_BACKOFF_MS);
  // Jitter only ever shortens, never extends beyond the cap.
  return Math.round(capped * (1 - 0.2 * Math.min(1, Math.max(0, jitter))));
}

/** Items in the order they must be sent: oldest first, always. */
export function drainOrder(items: readonly QueuedMutation[]): QueuedMutation[] {
  return [...items].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/**
 * The next item to send, or null if nothing is ready.
 *
 * Only one goes at a time. Sending concurrently would be faster and wrong: two
 * actions on the same asset would race, and the loser would apply to a state
 * that no longer exists.
 */
export function nextReady(
  items: readonly QueuedMutation[],
  now: number,
): QueuedMutation | null {
  for (const item of drainOrder(items)) {
    if (item.status !== "pending") continue;
    if (item.nextAttemptAt > now) continue;
    return item;
  }
  return null;
}

/** Actions the user is still waiting on — what the banner counts. */
export function pendingCount(items: readonly QueuedMutation[]): number {
  return items.filter((i) => i.status === "pending" || i.status === "sending").length;
}

/** Actions that need a person. The conflict screen's inbox. */
export function failedCount(items: readonly QueuedMutation[]): number {
  return items.filter((i) => i.status === "failed" || i.status === "blocked").length;
}

/** True when this subject has an action waiting, so a screen can mark it. */
export function isPendingFor(
  items: readonly QueuedMutation[],
  type: "asset" | "request",
  id: number,
): boolean {
  return items.some(
    (i) =>
      i.subject.type === type &&
      i.subject.id === id &&
      (i.status === "pending" || i.status === "sending"),
  );
}

/** Drop a completed item. Success is the only thing that removes work. */
export function onSuccess(
  items: readonly QueuedMutation[],
  id: string,
): QueuedMutation[] {
  return items.filter((i) => i.id !== id);
}

/**
 * Record a failure and decide what it means for everything behind it.
 *
 * A retryable failure just schedules a later attempt. A permanent one marks the
 * item `failed` **and blocks every later action on the same subject** — because
 * applying "assign to Priya" after "check in" was refused would put the asset
 * somewhere nobody asked for. Blocked items are held, never dropped: FR-14.27
 * is explicit that no failure may be silent, and the conflict screen is where
 * they surface.
 */
export function onFailure(
  items: readonly QueuedMutation[],
  id: string,
  statusCode: number,
  message: string,
  now: number,
  jitter = 0,
): QueuedMutation[] {
  const target = items.find((i) => i.id === id);
  if (!target) return [...items];

  const attempts = target.attempts + 1;
  const retryable = isRetryable(statusCode) && attempts < MAX_ATTEMPTS;

  const updated: QueuedMutation = {
    ...target,
    attempts,
    status: retryable ? "pending" : "failed",
    nextAttemptAt: retryable ? now + backoffFor(attempts, jitter) : target.nextAttemptAt,
    lastError: message,
    lastStatusCode: statusCode,
  };

  return items.map((item) => {
    if (item.id === id) return updated;

    // Only successors are blocked, and only for the same subject. An unrelated
    // asset's queued action has no reason to wait on this one.
    if (
      !retryable &&
      item.status === "pending" &&
      item.createdAt >= target.createdAt &&
      item.subject.type === target.subject.type &&
      item.subject.id === target.subject.id
    ) {
      return {
        ...item,
        status: "blocked" as const,
        lastError: "An earlier action on this item was refused.",
      };
    }

    return item;
  });
}

/**
 * Whether a retryable failure should stop this pass of the drain.
 *
 * It should. A network error almost always means the signal went, and grinding
 * through forty queued items to collect forty identical failures wastes battery
 * and inflates every item's attempt count — pushing them all towards
 * `MAX_ATTEMPTS` for one outage.
 */
export function shouldHaltDrain(statusCode: number): boolean {
  return statusCode === 0 || statusCode >= 500;
}
