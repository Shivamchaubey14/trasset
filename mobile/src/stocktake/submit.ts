/**
 * Sending a completed count, whether or not there is any signal.
 *
 * The count goes through the **mutation queue** rather than straight to the
 * API, which is what makes "completed entirely offline, submits on reconnect"
 * true rather than aspirational. The queue already survives a force-quit,
 * drains when the network returns, retries with backoff, and keeps a refusal
 * for a person instead of dropping it. None of that is worth building twice.
 *
 * It is **two** calls, in order:
 *
 *   1. `POST /stock-takes/{id}/scan/` — the whole batch, in one request.
 *   2. `POST /stock-takes/{id}/submit/` — close and reconcile.
 *
 * The order is not cosmetic. Submitting reconciles *what the server has*, so a
 * submit that overtook its own scans would write every asset off as missing and
 * close the session on that. The queue drains oldest-first and, for two actions
 * enqueued in the same millisecond, in enqueue order — which is precisely why
 * `QueuedMutation.seq` exists.
 *
 * Both calls carry idempotency keys and both are safe to replay: the scan
 * endpoint recognises an entry it already has, and `services.submit` returns
 * the existing reconciliation rather than reconciling twice.
 */
import { queue, queuedMutation } from "@/offline/queue";

import { type SessionState, counts, scanPayload } from "./session";

/**
 * Queue a finished count for delivery.
 *
 * Returns once both calls are on disk — before either has been attempted — so
 * a caller can clear the session knowing the work is durable.
 */
export async function queueSubmission(session: SessionState): Promise<void> {
  const subject = {
    type: "stocktake" as const,
    id: session.stockTakeId,
    label: session.locationName,
  };

  await queue.enqueue(
    queuedMutation({
      method: "POST",
      path: `/stock-takes/${session.stockTakeId}/scan/`,
      body: scanPayload(session),
      kind: "stocktake-scans",
      subject,
    }),
  );

  await queue.enqueue(
    queuedMutation({
      method: "POST",
      path: `/stock-takes/${session.stockTakeId}/submit/`,
      body: {},
      kind: "stocktake-submit",
      subject,
    }),
  );
}

/** What to tell the user at the moment they hand the count over. */
export function submissionSummary(session: SessionState, online: boolean): string {
  const tally = counts(session);
  const body = `${tally.found} found, ${tally.missing} missing, ${tally.unexpected} unexpected`;
  return online
    ? `Sending — ${body}.`
    : `Saved — ${body}. It will send when you are back online.`;
}
