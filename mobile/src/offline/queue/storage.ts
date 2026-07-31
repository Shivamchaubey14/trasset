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

export async function saveQueue(items: readonly QueuedMutation[]): Promise<void> {
  // Written on every change rather than throttled. A queue is the one thing
  // that must be on disk *before* the request goes out — coalescing writes
  // would open exactly the window where a crash loses the record of an action
  // that the server has already performed.
  await AsyncStorage.setItem(QUEUE_KEY, encodeQueue(items));
}

export async function clearQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    /* nothing useful to do; the queue is already gone from memory */
  }
}
