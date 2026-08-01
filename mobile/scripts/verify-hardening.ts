/**
 * Verification — the nasty cases.
 *
 * The DoD is *no path loses a user's work; every failure is visible and
 * recoverable*, which is two claims about every failure mode rather than one
 * claim about the happy path. Each case below is driven adversarially: the
 * failure is *caused*, not waited for.
 *
 *   1. signal lost mid-request
 *   2. a token expiring while work is queued
 *   3. clock skew, in both directions
 *   4. storage full
 *   5. the app killed mid-drain
 *
 * The two that produced real bugs are 2 and 3, and neither is visible from
 * reading the code: a 401 looked like any other 4xx, and an absolute
 * `nextAttemptAt` looks harmless until a clock moves under it.
 *
 *   cd mobile && npx tsx scripts/verify-hardening.ts
 */
import { ApiError, SessionExpiredError, api, configureApi, configureTokenStore, login, logout, tokens } from "../src/api";
import type { Asset, Page } from "../src/api";
import { createQueue } from "../src/offline/queue/engine";
import {
  MAX_BACKOFF_MS,
  isRetryable,
  nextReady,
  onFailure,
  pendingCount,
  queueStats,
  shouldHaltDrain,
  waiting,
} from "../src/offline/queue/policy";
import { decodeQueue, encodeQueue } from "../src/offline/queue/serialise";
import type { QueuedMutation } from "../src/offline/queue/types";

const BASE = "http://127.0.0.1:8000/api/v1";
const PASSWORD = "Trasset@2026";

const memoryStore = (() => {
  const values = new Map<string, string>();
  return {
    async getItemAsync(k: string) { return values.get(k) ?? null; },
    async setItemAsync(k: string, v: string) { values.set(k, v); },
    async deleteItemAsync(k: string) { values.delete(k); },
  };
})();

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ""}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const uuid = () => globalThis.crypto.randomUUID();
let seq = 0;

function item(over: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: uuid(),
    idempotencyKey: uuid(),
    method: "POST",
    path: "/assets/1/checkin/",
    body: {},
    kind: "checkin",
    subject: { type: "asset", id: 1 },
    createdAt: Date.now(),
    seq: (seq += 1),
    attempts: 0,
    nextAttemptAt: 0,
    status: "pending",
    lastError: null,
    lastStatusCode: null,
    ...over,
  };
}

async function main() {
  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);

  // =======================================================================
  console.log("\n1. Signal lost mid-request");

  const disk = (() => {
    let bytes: string | null = null;
    return {
      async load() { return decodeQueue(bytes); },
      async save(items: readonly QueuedMutation[]) { bytes = encodeQueue(items); },
      raw: () => bytes,
      corrupt: () => { bytes = '{"version":1,"items":[{"id":"hal'; },
    };
  })();

  let dropAfterSending = false;
  const q = createQueue({
    load: disk.load,
    save: disk.save,
    send: () => {
      if (dropAfterSending) {
        // The shape of a connection dying after the request left the phone:
        // the server may or may not have acted, and nothing here can tell.
        return Promise.reject(new ApiError(0, "Network request failed"));
      }
      return Promise.resolve({});
    },
    now: () => Date.now(),
    jitter: () => 0,
  });
  await q.load();

  dropAfterSending = true;
  await q.enqueue(item());
  const lost = await q.drain();

  check(
    "a request cut off mid-flight keeps the action",
    lost.sent === 0 && pendingCount(q.getItems()) === 1,
    "the phone cannot know whether the server acted, so it must keep it and resend",
  );
  check(
    "and the action is still on disk, with its key",
    (() => {
      const back = decodeQueue(disk.raw());
      return back.length === 1 && back[0].idempotencyKey === q.getItems()[0].idempotencyKey;
    })(),
    "the key is what makes the resend safe rather than a second action",
  );

  // =======================================================================
  console.log("\n2. A token expiring while work is queued");

  check(
    "a session expiry is retryable — the request was never judged",
    isRetryable(401),
    "the client refreshes and replays a 401 itself; one that reaches here means the refresh ran out",
  );
  check(
    "and it halts the drain rather than burning every item",
    shouldHaltDrain(401),
    "every following item carries the same dead session",
  );

  const expired = onFailure([item()], "x", 401, "Session expired", Date.now());
  const stalled = onFailure(
    [item({ id: "s" })],
    "s",
    401,
    "Your session has expired. Please sign in again.",
    Date.now(),
  );
  check(
    "queued work stalls rather than failing permanently",
    stalled[0].status === "pending",
    "signing back in is exactly the fix; discarding it would lose work for the one reason the user can repair",
  );
  check(
    "a genuine refusal still fails permanently",
    onFailure([item({ id: "c" })], "c", 409, "Already assigned.", Date.now())[0].status === "failed",
    "401 being retryable must not make 409 retryable",
  );
  void expired;

  // Through the real error type the client actually throws.
  const sessionError = new SessionExpiredError();
  check(
    "SessionExpiredError is recognised as retryable by its status",
    isRetryable(sessionError.status),
    `status ${sessionError.status}`,
  );

  // =======================================================================
  console.log("\n3. Clock skew, in both directions");

  const now = Date.now();
  check(
    "a normal backoff is respected",
    waiting(item({ nextAttemptAt: now + 5_000 }), now),
    "5 s to go",
  );
  check(
    "a clock that moved BACKWARDS does not strand work for years",
    !waiting(item({ nextAttemptAt: now + 400 * 24 * 3600_000 }), now),
    "a wait longer than the maximum backoff was never scheduled by this code",
  );
  check(
    "so the item becomes sendable again",
    nextReady([item({ nextAttemptAt: now + 400 * 24 * 3600_000 })], now) !== null,
    "otherwise nothing for that subject can ever be sent again",
  );
  check(
    "a clock that moved FORWARDS just sends early, which is harmless",
    !waiting(item({ nextAttemptAt: now - 1 }), now),
  );
  check(
    "the boundary is the maximum backoff itself",
    waiting(item({ nextAttemptAt: now + MAX_BACKOFF_MS - 1000 }), now) &&
      !waiting(item({ nextAttemptAt: now + MAX_BACKOFF_MS + 1000 }), now),
    `${MAX_BACKOFF_MS / 1000}s`,
  );

  // =======================================================================
  console.log("\n4. Storage full");

  let storageWorks = false;
  const fullDisk = createQueue({
    load: async () => [],
    save: async () => {
      if (!storageWorks) throw new Error("SQLITE_FULL: database or disk is full");
    },
    send: () => Promise.resolve({}),
    now: () => Date.now(),
    jitter: () => 0,
  });
  await fullDisk.load();

  let threw = false;
  try {
    await fullDisk.enqueue(item());
  } catch {
    threw = true;
  }
  check(
    "a full disk does not throw the action away",
    !threw && fullDisk.getItems().length === 1,
    "throwing here would roll back the optimistic update and discard work already performed",
  );

  storageWorks = true;
  const recovered = await fullDisk.drain();
  check(
    "and the action still sends once there is room",
    recovered.sent === 1,
    "a durability problem must not become a data-loss one",
  );

  // =======================================================================
  console.log("\n5. The app killed mid-drain, and a corrupted store");

  const midFlight = decodeQueue(encodeQueue([item({ status: "sending", attempts: 2 })]));
  check(
    "an action caught mid-send comes back sendable",
    midFlight[0]?.status === "pending",
    "it may have reached the server; the idempotency key is what makes resending safe",
  );
  check(
    "its attempt count is not reset by the crash",
    midFlight[0]?.attempts === 2,
    "otherwise a crash loop retries for ever and never surfaces",
  );

  disk.corrupt();
  const afterCorruption = await (async () => {
    const fresh = createQueue({
      load: disk.load,
      save: disk.save,
      send: () => Promise.resolve({}),
      now: () => Date.now(),
      jitter: () => 0,
    });
    return fresh.load();
  })();
  check(
    "a half-written store starts the app rather than breaking it",
    Array.isArray(afterCorruption) && afterCorruption.length === 0,
    "a partial JSON document has no recoverable items, but it must not be fatal",
  );

  // =======================================================================
  console.log("\n6. Instrumentation — the questions a support call asks");

  const stats = queueStats(
    [
      item({ createdAt: now - 3600_000, attempts: 3, status: "failed", lastError: "Already assigned." }),
      item({ createdAt: now - 60_000, attempts: 1 }),
      item({ createdAt: now - 10_000, status: "blocked", lastError: "An earlier action was refused." }),
    ],
    now,
  );
  check("depth is reported", stats.depth === 3, `${stats.depth} held`);
  check("stuck is separated from waiting", stats.pending === 1 && stats.failed === 2);
  check("total attempts are counted", stats.attempts === 4, `${stats.attempts} attempts`);
  check(
    "the age of the oldest is available",
    Math.round(stats.oldestAgeMs / 60_000) === 60,
    `${Math.round(stats.oldestAgeMs / 60_000)} min`,
  );
  check(
    "and distinct reasons are kept, not collapsed to one",
    stats.reasons.length === 2,
    stats.reasons.join(" | "),
  );

  // =======================================================================
  console.log("\n7. The 401 path, end to end against the real server");

  await login("admin@trasset.local", PASSWORD);
  const spare = (
    await api.get<Page<Asset>>("/assets/", { status: "available", page_size: 1 })
  ).results[0];

  if (!spare) {
    console.log("  SKIP  no available asset");
  } else {
    // A queue whose token is genuinely dead: no refresh token in the store.
    const deadSession = createQueue({
      load: async () => [],
      save: async () => {},
      send: async (queuedItem) => {
        // `tokens.clear()` drops the in-memory access token as well as the
        // stored refresh. Deleting only the stored key left a live access
        // token in memory, so the request succeeded and the server answered on
        // the merits — which is not the case under test.
        await tokens.clear();
        return api.post(queuedItem.path, queuedItem.body, {
          idempotencyKey: queuedItem.idempotencyKey,
        });
      },
      now: () => Date.now(),
      jitter: () => 0,
    });
    await deadSession.load();
    await deadSession.enqueue(
      item({ path: `/assets/${spare.id}/checkin/`, subject: { type: "asset", id: spare.id } }),
    );

    const report = await deadSession.drain();
    const held = deadSession.getItems()[0];
    check(
      "an expired session leaves the work queued, not failed",
      report.sent === 0 && Boolean(held) && held.status === "pending",
      `status ${held?.status}, HTTP ${held?.lastStatusCode}`,
    );
    check(
      "the queue halted rather than grinding through",
      report.halted,
      "one sign-in, not one failure per item",
    );
  }

  await logout().catch(() => {});

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nNot covered here: a real device running out of storage, and a user changing\n" +
    "the system clock by hand. Both are simulated at the boundary the app actually\n" +
    "sees — a storage write that throws, and a timestamp that cannot have been\n" +
    "scheduled by this code.\n",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
