/**
 * Reading the queue back off disk, defensively.
 *
 * This runs at launch, on a file that may have been written by a build that no
 * longer exists, or half-written by a process that was killed. It is pure so
 * every one of those cases can be exercised directly.
 *
 * Two rules it enforces, both of which matter more than they look:
 *
 * **Anything left `sending` becomes `pending` again.** A `sending` item is one
 * the app died in the middle of. It may have reached the server, it may not —
 * and nothing on this device can tell. Resending is the only option, and it is
 * *safe* purely because the idempotency key was minted at enqueue and is still
 * attached: the server recognises the replay and returns the original response
 * instead of acting twice. This one line is where the DoD is actually won.
 *
 * **Nothing is ever silently discarded.** Work the user believes they did must
 * not evaporate because a version number changed (FR-14.27). Unreadable items
 * surface as `failed` with an explanation rather than vanishing.
 */
import { QUEUE_VERSION, type QueuedMutation, type QueueStatus } from "./types";

const STATUSES: QueueStatus[] = ["pending", "sending", "failed", "blocked"];

function isItem(value: unknown): value is QueuedMutation {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<QueuedMutation>;
  return (
    typeof item.id === "string" &&
    typeof item.idempotencyKey === "string" &&
    typeof item.path === "string" &&
    typeof item.method === "string" &&
    typeof item.createdAt === "number" &&
    typeof item.subject === "object" &&
    item.subject !== null
  );
}

/** Put a loaded item into a state the engine can act on. */
function recover(item: QueuedMutation, note: string | null): QueuedMutation {
  const status: QueueStatus = STATUSES.includes(item.status) ? item.status : "pending";
  return {
    ...item,
    attempts: typeof item.attempts === "number" ? item.attempts : 0,
    nextAttemptAt: typeof item.nextAttemptAt === "number" ? item.nextAttemptAt : 0,
    // The crash-recovery rule. See the note at the top of this file.
    status: note ? "failed" : status === "sending" ? "pending" : status,
    lastError: note ?? item.lastError ?? null,
  };
}

export function encodeQueue(items: readonly QueuedMutation[]): string {
  return JSON.stringify({ version: QUEUE_VERSION, items });
}

export function decodeQueue(raw: string | null | undefined): QueuedMutation[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A truncated write — the process died mid-save. There is nothing here to
    // rescue, because a partial JSON document has no recoverable items.
    return [];
  }

  const envelope = parsed as { version?: unknown; items?: unknown };
  const items = Array.isArray(envelope.items) ? envelope.items : [];
  const known = envelope.version === QUEUE_VERSION;

  // A version we do not understand still gets its items surfaced, marked so a
  // person can decide. Dropping them would be the silent failure FR-14.27
  // forbids — these are actions someone believes they performed.
  const note = known
    ? null
    : "This action was queued by an older version of the app and cannot be sent automatically.";

  return items.filter(isItem).map((item) => recover(item, note));
}
