/**
 * The drain loop.
 *
 * Storage and transport are injected rather than imported, for the same reason
 * the API layer takes its token store that way: it keeps this file free of
 * platform imports, so the loop that decides whether a user's work is lost can
 * be run for real — against a real server — without a device.
 *
 * The loop is deliberately serial. Sending concurrently would be faster and
 * wrong: two queued actions on one asset would race, and whichever lost would
 * apply to a state that no longer exists.
 */
import { ApiError } from "@/api";

import {
  nextReady,
  onFailure,
  onSuccess,
  pendingCount,
  shouldHaltDrain,
  wakeAll,
} from "./policy";
import type { QueuedMutation } from "./types";

export type QueueDeps = {
  load(): Promise<QueuedMutation[]>;
  save(items: readonly QueuedMutation[]): Promise<void>;
  /** Performs the request. Must throw `ApiError` on failure. */
  send(item: QueuedMutation): Promise<unknown>;
  now(): number;
  /** [0, 1); injected so backoff is deterministic under test. */
  jitter(): number;
  /** Called after every successful send, so caches can be refreshed. */
  onApplied?(item: QueuedMutation, result: unknown): void;
};

export type DrainReport = {
  sent: number;
  failed: number;
  halted: boolean;
  remaining: number;
};

export function createQueue(deps: QueueDeps) {
  let items: QueuedMutation[] = [];
  let loaded = false;
  let draining = false;
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) listener();
  }

  async function commit(next: QueuedMutation[]) {
    items = next;
    await deps.save(items);
    emit();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Snapshot. Callers must not mutate it. */
    getItems(): readonly QueuedMutation[] {
      return items;
    },

    getPendingCount(): number {
      return pendingCount(items);
    },

    /** Read the queue back off disk. Safe to call more than once. */
    async load(): Promise<readonly QueuedMutation[]> {
      if (loaded) return items;
      items = await deps.load();
      loaded = true;
      emit();
      return items;
    },

    /**
     * Add an action.
     *
     * Written to disk **before** this resolves, and therefore before any
     * attempt to send it. That ordering is the point: a crash between "sent"
     * and "recorded" is survivable, because the record already exists and
     * carries the idempotency key. A crash between "sent" and "written" would
     * not be.
     */
    async enqueue(item: QueuedMutation): Promise<void> {
      await commit([...items, item]);
    },

    /**
     * Send whatever is ready, oldest first, one at a time.
     *
     * Returns without doing anything if a drain is already running — two
     * concurrent drains would each pick up the same item and send it twice.
     * (The server would absorb that, thanks to the key, but doubling the
     * traffic on a bad connection is exactly the wrong response to one.)
     */
    async drain(): Promise<DrainReport> {
      if (draining) return { sent: 0, failed: 0, halted: true, remaining: pendingCount(items) };
      draining = true;

      const report: DrainReport = { sent: 0, failed: 0, halted: false, remaining: 0 };

      try {
        for (;;) {
          const item = nextReady(items, deps.now());
          if (!item) break;

          await commit(items.map((i) => (i.id === item.id ? { ...i, status: "sending" } : i)));

          try {
            const result = await deps.send(item);
            await commit(onSuccess(items, item.id));
            report.sent += 1;
            deps.onApplied?.(item, result);
          } catch (error) {
            const status = error instanceof ApiError ? error.status : 0;
            const message =
              error instanceof Error ? error.message : "The action could not be sent.";

            await commit(
              onFailure(items, item.id, status, message, deps.now(), deps.jitter()),
            );
            report.failed += 1;

            if (shouldHaltDrain(status)) {
              // The signal went, or the server is unwell. Grinding through the
              // rest would collect identical failures and push every item's
              // attempt count towards its limit for one outage.
              report.halted = true;
              break;
            }
          }
        }
      } finally {
        draining = false;
      }

      report.remaining = pendingCount(items);
      return report;
    },

    /**
     * Clear every pending backoff — called when the network comes back.
     *
     * Without this, an item that failed during an outage sits out its full
     * backoff after the signal returns, and anything queued behind it on the
     * same subject waits too.
     */
    async wake(): Promise<void> {
      await commit(wakeAll(items));
    },

    /** Put a failed or blocked item back in line — the conflict screen's retry. */
    async retry(id: string): Promise<void> {
      await commit(
        items.map((i) =>
          i.id === id
            ? { ...i, status: "pending" as const, attempts: 0, nextAttemptAt: 0, lastError: null }
            : i,
        ),
      );
    },

    /** Throw an action away. Only ever at the user's explicit instruction. */
    async discard(id: string): Promise<void> {
      await commit(items.filter((i) => i.id !== id));
    },

    /** Drop everything — used at sign-out, alongside the query cache. */
    async clear(): Promise<void> {
      await commit([]);
    },
  };
}

export type Queue = ReturnType<typeof createQueue>;
