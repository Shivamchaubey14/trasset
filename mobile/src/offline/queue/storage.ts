/**
 * Where the queue lives between launches.
 *
 * AsyncStorage rather than SecureStore: a queued action is not a secret, and
 * SecureStore's per-item size limits are a poor fit for a growing list. The
 * platform half only — every decision about what the bytes mean is in
 * `serialise.ts`.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { decodeQueue, encodeQueue } from "./serialise";
import type { QueuedMutation } from "./types";

export const QUEUE_KEY = "trasset.mutation-queue";

export async function loadQueue(): Promise<QueuedMutation[]> {
  try {
    return decodeQueue(await AsyncStorage.getItem(QUEUE_KEY));
  } catch {
    // An unreadable store is indistinguishable from an empty one here, and
    // failing to start the app over it would be worse than starting empty.
    return [];
  }
}

/**
 * The last write that failed, if any.
 *
 * A full disk is rare and not hypothetical: a phone at 100% storage cannot
 * write, and a stock room is exactly where nobody is clearing photos. It must
 * not take the action down with it — the queue is still correct in memory and
 * can still be sent — but it must not be silent either, because durability is
 * the whole promise and it has just been broken (FR-14.27).
 */
let lastSaveError: string | null = null;

export function lastQueueSaveError(): string | null {
  return lastSaveError;
}

export async function saveQueue(items: readonly QueuedMutation[]): Promise<void> {
  // Written on every change rather than throttled. A queue is the one thing
  // that must be on disk *before* the request goes out — coalescing writes
  // would open exactly the window where a crash loses the record of an action
  // that the server has already performed.
  try {
    await AsyncStorage.setItem(QUEUE_KEY, encodeQueue(items));
    lastSaveError = null;
  } catch (error) {
    // Deliberately swallowed rather than rethrown. Throwing here would fail
    // the enqueue, which would roll back the optimistic update and discard an
    // action the user has already physically performed — trading a durability
    // problem for a data-loss one. The action stays in memory and will send;
    // only a crash before then would lose it, and that is what is reported.
    lastSaveError =
      error instanceof Error ? error.message : "Could not save to this phone's storage.";
  }
}

export async function clearQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    /* nothing useful to do; the queue is already gone from memory */
  }
}
