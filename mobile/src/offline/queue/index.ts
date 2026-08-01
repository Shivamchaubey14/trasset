/**
 * The app's single queue, wired to real storage and the real API.
 *
 * One instance for the process. Two queues would each hold half the truth and
 * each write over the other's file.
 */
import * as Crypto from "expo-crypto";

import { api } from "@/api";

import { createQueue } from "./engine";
import { loadQueue, saveQueue } from "./storage";
import type { QueueSubject, QueuedMutation } from "./types";

export * from "./policy";
export * from "./types";
export { decodeQueue, encodeQueue } from "./serialise";
export { createQueue } from "./engine";
export type { DrainReport, QueueDeps } from "./engine";

export const queue = createQueue({
  load: loadQueue,
  save: saveQueue,
  send: (item) => {
    const options = { idempotencyKey: item.idempotencyKey };
    switch (item.method) {
      case "POST":
        return api.post(item.path, item.body, options);
      case "PATCH":
        return api.patch(item.path, item.body, options);
      case "DELETE":
        return api.delete(item.path, options);
    }
  },
  now: () => Date.now(),
  // Random in production so a queue of several items does not retry in
  // lockstep the instant a flaky connection returns.
  jitter: () => Math.random(),
});

/**
 * Build a queue entry.
 *
 * The idempotency key is minted **here**, once, at the moment the user commits
 * — not when the request is eventually sent. Every retry of this action, in
 * this process or in one three days later, carries this same key, which is what
 * lets the server recognise a repeat and apply it once.
 */
// Monotonic within a process. Across a restart `createdAt` separates the runs,
// so a counter that resets is sufficient and needs no storage of its own.
let sequence = 0;

export function queuedMutation(input: {
  method: QueuedMutation["method"];
  path: string;
  body?: unknown;
  kind: string;
  subject: QueueSubject;
}): QueuedMutation {
  return {
    id: Crypto.randomUUID(),
    idempotencyKey: Crypto.randomUUID(),
    method: input.method,
    path: input.path,
    body: input.body,
    kind: input.kind,
    subject: input.subject,
    createdAt: Date.now(),
    seq: (sequence += 1),
    attempts: 0,
    nextAttemptAt: 0,
    status: "pending",
    lastError: null,
    lastStatusCode: null,
  };
}
