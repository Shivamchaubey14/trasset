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
  // A 401 reaching the queue means the session expired: the client refreshes
  // and replays a 401 on its own, so anything that still arrives here has run
  // out of refresh token, not been judged. The *request* was never refused on
  // merit — signing back in makes it valid again — so failing it permanently
  // would discard work for the one reason the user can actually fix.
  if (statusCode === 401) return true;
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
  return [...items].sort(
    (a, b) =>
      a.createdAt - b.createdAt ||
      (a.seq ?? 0) - (b.seq ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * The next item to send, or null if nothing is ready.
 *
 * Only one goes at a time. Sending concurrently would be faster and wrong: two
 * actions on the same asset would race, and the loser would apply to a state
 * that no longer exists.
 *
 * **An item waits for anything queued before it on the same subject**, even
 * when that earlier item is only in backoff. Skipping a backed-off item and
 * taking the next one looks like progress and quietly reorders the work: a
 * stock take whose scan batch failed once and is waiting a second would have
 * its *submit* sent first, closing the session and reconciling a count the
 * server never received. Every asset would be written off as missing.
 *
 * Only the same subject blocks. An unrelated asset's action has no reason to
 * wait behind a stock take that is backing off.
 */
/**
 * Whether an item is still legitimately waiting out its backoff.
 *
 * A device clock is wrong more often than anyone expects — a manual change, a
 * timezone database update, a phone that was flat for a week. `nextAttemptAt`
 * is an absolute timestamp, so a clock that jumps **backwards** after one was
 * scheduled leaves an item apparently waiting for years. Nothing further can
 * ever be sent for that subject, and the user's work sits there for ever.
 *
 * A wait longer than the maximum backoff is not a wait this code could have
 * scheduled, so it is treated as the clock having moved rather than as an
 * instruction to keep waiting.
 */
export function waiting(item: QueuedMutation, now: number): boolean {
  const remaining = item.nextAttemptAt - now;
  if (remaining <= 0) return false;
  return remaining <= MAX_BACKOFF_MS;
}

export function nextReady(
  items: readonly QueuedMutation[],
  now: number,
): QueuedMutation | null {
  const ordered = drainOrder(items);
  const held = new Set<string>();

  for (const item of ordered) {
    const subject = `${item.subject.type}:${item.subject.id}`;

    // A failed or blocked predecessor already holds its successors via
    // `onFailure`; this covers the ones still legitimately waiting to retry.
    if (item.status === "sending" || (item.status === "pending" && waiting(item, now))) {
      held.add(subject);
      continue;
    }
    if (item.status !== "pending") continue;
    if (held.has(subject)) continue;

    return item;
  }
  return null;
}

/** Actions the user is still waiting on — what the banner counts. */
export function pendingCount(items: readonly QueuedMutation[]): number {
  return items.filter((i) => i.status === "pending" || i.status === "sending").length;
}

/**
 * Queue depth and health, for the about screen and a support call.
 *
 * "How many are stuck and since when" is the first question anyone asks about
 * a queue that is not emptying, and it is unanswerable from a screen that only
 * shows a count.
 */
export function queueStats(items: readonly QueuedMutation[], now: number = Date.now()) {
  const pending = items.filter((i) => i.status === "pending" || i.status === "sending");
  const stuck = items.filter((i) => i.status === "failed" || i.status === "blocked");
  const oldest = items.reduce<number | null>(
    (acc, i) => (acc === null || i.createdAt < acc ? i.createdAt : acc),
    null,
  );
  return {
    depth: items.length,
    pending: pending.length,
    failed: stuck.length,
    /** Total delivery attempts across everything held — a flap detector. */
    attempts: items.reduce((sum, i) => sum + i.attempts, 0),
    /** Age of the oldest thing still waiting, in ms. */
    oldestAgeMs: oldest === null ? 0 : Math.max(0, now - oldest),
    /** Distinct reasons, so one message does not stand in for five. */
    reasons: Array.from(
      new Set(items.map((i) => i.lastError).filter((e): e is string => Boolean(e))),
    ),
  };
}

/** Actions that need a person. The conflict screen's inbox. */
export function failedCount(items: readonly QueuedMutation[]): number {
  return items.filter((i) => i.status === "failed" || i.status === "blocked").length;
}

/** True when this subject has an action waiting, so a screen can mark it. */
export function isPendingFor(
  items: readonly QueuedMutation[],
  type: "asset" | "request" | "stocktake",
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
 * Cancel the waiting period on everything still pending.
 *
 * Backoff exists to avoid hammering a network that is not there. The moment
 * connectivity is observed to return, the reason for waiting is gone — and
 * waiting anyway means a user who has just walked back into signal watches a
 * count sit there for no reason. Attempt counts are deliberately left alone:
 * they are the record of how much trouble an item has been, and clearing them
 * would let a genuinely broken action retry for ever.
 */
export function wakeAll(items: readonly QueuedMutation[]): QueuedMutation[] {
  return items.map((item) =>
    item.status === "pending" && item.nextAttemptAt !== 0
      ? { ...item, nextAttemptAt: 0 }
      : item,
  );
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
  // 401 halts too, and for the same reason as an outage: every following item
  // carries the same dead session, so grinding on would collect one identical
  // failure per item and push them all towards the attempt limit for a single
  // sign-in.
  return statusCode === 0 || statusCode === 401 || statusCode >= 500;
}
