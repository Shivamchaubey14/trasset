/**
 * Verification — the durable mutation queue.
 *
 * The DoD is: check an asset in with no signal, force-quit, reconnect, and it
 * syncs **exactly once**. Every part of that except the force-quit itself is
 * reproducible here, and the force-quit is simulated the only way that matters
 * — by throwing the in-memory queue away and rebuilding it from the bytes on
 * "disk", which is precisely what a relaunch does.
 *
 * The run is:
 *
 *   1. the pure policy, exhaustively — what retries, what does not, what order
 *      things go in, and what a refusal does to the work behind it;
 *   2. an offline check-in that goes to the queue instead of being lost;
 *   3. a simulated force-quit: serialise, discard everything, decode again;
 *   4. a drain against the **real server**, with the asset's state read back;
 *   5. **the same queued item sent a second time**, which is the crash window
 *      the whole design exists to survive — the app dies after the server acted
 *      but before the success was recorded. The server must recognise the key
 *      and apply it once. Proven by the asset's history, not by trusting a
 *      2xx.
 *
 *   cd mobile && npx tsx scripts/verify-queue.ts
 */
import { ApiError, api, configureApi, configureTokenStore, login, logout } from "../src/api";
import type { Asset, Page, User } from "../src/api";
import { createQueue } from "../src/offline/queue/engine";
import {
  MAX_ATTEMPTS,
  backoffFor,
  drainOrder,
  isPendingFor,
  isRetryable,
  nextReady,
  onFailure,
  pendingCount,
  shouldHaltDrain,
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

function makeItem(over: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: uuid(),
    idempotencyKey: uuid(),
    method: "POST",
    path: "/assets/1/checkin/",
    body: {},
    kind: "checkin",
    subject: { type: "asset", id: 1 },
    createdAt: 1000,
    attempts: 0,
    nextAttemptAt: 0,
    status: "pending",
    lastError: null,
    lastStatusCode: null,
    ...over,
  };
}

/** A fake disk, so a "force quit" is just dropping the object. */
function fakeDisk() {
  let bytes: string | null = null;
  return {
    async load() { return decodeQueue(bytes); },
    async save(items: readonly QueuedMutation[]) { bytes = encodeQueue(items); },
    raw() { return bytes; },
  };
}

async function main() {
  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);

  // =======================================================================
  console.log("\n1. What retries, and what does not");

  check("a network failure retries — the case the queue exists for", isRetryable(0));
  check("500 retries", isRetryable(500));
  check("503 retries", isRetryable(503));
  check("429 retries — the server asked us to wait", isRetryable(429));
  check("408 retries", isRetryable(408));
  check("400 does not — it will be refused identically forever", !isRetryable(400));
  check("403 does not", !isRetryable(403));
  check("404 does not", !isRetryable(404));
  check(
    "409 does NOT retry — the world moved, and repeating cannot fix it",
    !isRetryable(409),
    "someone else took the asset; this needs a person",
  );

  // =======================================================================
  console.log("\n2. Backoff");

  check("first retry waits a second", backoffFor(1) === 1000, `${backoffFor(1)} ms`);
  check("it doubles", backoffFor(2) === 2000 && backoffFor(3) === 4000, `${backoffFor(2)}, ${backoffFor(3)} ms`);
  check("and is capped", backoffFor(30) === 5 * 60_000, `${backoffFor(30)} ms`);
  check(
    "jitter only ever shortens",
    backoffFor(5, 1) < backoffFor(5, 0) && backoffFor(5, 1) > 0,
    `${backoffFor(5, 1)} vs ${backoffFor(5, 0)} ms`,
  );

  // =======================================================================
  console.log("\n3. Order, and what a refusal does to the work behind it");

  const older = makeItem({ createdAt: 100 });
  const newer = makeItem({ createdAt: 200 });
  check(
    "oldest first, always",
    drainOrder([newer, older])[0].id === older.id,
    "two actions on one asset applied backwards leave a state nobody asked for",
  );

  check(
    "an item in backoff is not picked up early",
    nextReady([makeItem({ nextAttemptAt: 5000 })], 1000) === null,
  );
  check(
    "and is picked up once its time comes",
    nextReady([makeItem({ nextAttemptAt: 5000 })], 6000) !== null,
  );
  check(
    "an item already sending is never picked up twice",
    nextReady([makeItem({ status: "sending" })], 9999) === null,
    "two drains sending one item would double the traffic on a bad connection",
  );

  const a = makeItem({ createdAt: 100, subject: { type: "asset", id: 7 } });
  const b = makeItem({ createdAt: 200, subject: { type: "asset", id: 7 } });
  const other = makeItem({ createdAt: 300, subject: { type: "asset", id: 99 } });
  const afterConflict = onFailure([a, b, other], a.id, 409, "Already assigned.", 5000);

  check(
    "a refused action is marked failed, never dropped",
    afterConflict.find((i) => i.id === a.id)?.status === "failed",
    "FR-14.27: nothing fails silently",
  );
  check(
    "and its own sentence is kept for the conflict screen",
    afterConflict.find((i) => i.id === a.id)?.lastError === "Already assigned.",
  );
  check(
    "later actions on the SAME asset are blocked, not applied out of order",
    afterConflict.find((i) => i.id === b.id)?.status === "blocked",
    "assigning after a refused check-in would put it somewhere nobody asked for",
  );
  check(
    "an unrelated asset's action is untouched",
    afterConflict.find((i) => i.id === other.id)?.status === "pending",
  );

  const afterOutage = onFailure([a], a.id, 0, "Network request failed", 5000);
  check(
    "a network failure stays pending, with a later attempt scheduled",
    afterOutage[0].status === "pending" && afterOutage[0].nextAttemptAt > 5000,
    `retry at +${afterOutage[0].nextAttemptAt - 5000} ms`,
  );
  check(
    "a drain halts on an outage rather than burning every item's attempts",
    shouldHaltDrain(0) && shouldHaltDrain(503) && !shouldHaltDrain(409),
  );

  const nearLimit = makeItem({ attempts: MAX_ATTEMPTS - 1 });
  const exhausted = onFailure([nearLimit], nearLimit.id, 0, "Network request failed", 1);
  check(
    "a retryable failure stops retrying at the attempt limit — but is kept",
    exhausted[0].status === "failed" && exhausted[0].attempts === MAX_ATTEMPTS,
    `${exhausted[0].attempts} attempts, then ${exhausted[0].status} — retried forever it would be indistinguishable from stuck`,
  );

  check(
    "a screen can tell an asset has work waiting",
    isPendingFor([a], "asset", 7) && !isPendingFor([a], "asset", 8),
  );

  // =======================================================================
  console.log("\n4. Surviving a force-quit");

  const crashed = decodeQueue(encodeQueue([makeItem({ status: "sending", attempts: 1 })]));
  check(
    "an action caught mid-flight comes back as pending, not lost",
    crashed[0]?.status === "pending",
    "it may or may not have reached the server; the key makes resending safe",
  );
  check(
    "its idempotency key survives the round trip",
    typeof crashed[0]?.idempotencyKey === "string" && crashed[0].idempotencyKey.length > 10,
    "without this the resend would be a second, different action",
  );
  check("a truncated file does not crash the app", decodeQueue('{"version":1,"items":[').length === 0);
  check("an empty store is simply empty", decodeQueue(null).length === 0);

  const foreign = decodeQueue(JSON.stringify({ version: 99, items: [makeItem()] }));
  check(
    "a queue from an unknown version is surfaced, not silently binned",
    foreign[0]?.status === "failed" && Boolean(foreign[0]?.lastError),
    foreign[0]?.lastError ?? "",
  );

  // =======================================================================
  console.log("\n5. End to end, against the real server");

  await login("admin@trasset.local", PASSWORD);
  const people = await api.get<Page<User>>("/users/", { page_size: 50, is_active: true });
  const employee = people.results.find((u) => u.role_name === "employee");
  const spare = (
    await api.get<Page<Asset>>("/assets/", { status: "available", page_size: 1 })
  ).results[0];

  if (!employee || !spare) {
    console.log("  SKIP  needs an employee and an available asset");
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }

  const disk = fakeDisk();
  const sendCalls: string[] = [];

  const makeEngine = () =>
    createQueue({
      load: disk.load,
      save: disk.save,
      send: (item) => {
        sendCalls.push(item.idempotencyKey);
        return api.post(item.path, item.body, { idempotencyKey: item.idempotencyKey });
      },
      now: () => Date.now(),
      jitter: () => 0,
    });

  // --- offline: the action is queued rather than lost --------------------
  const first = makeEngine();
  await first.load();
  const assignAction = makeItem({
    id: uuid(),
    idempotencyKey: uuid(),
    path: `/assets/${spare.id}/assign/`,
    body: { user_id: employee.id, notes: "queue check" },
    kind: "assign",
    subject: { type: "asset", id: spare.id },
    createdAt: Date.now(),
  });
  await first.enqueue(assignAction);

  check(
    "an action taken with no signal is on disk before anything is sent",
    disk.raw() !== null && decodeQueue(disk.raw()).length === 1,
    "a crash between sending and recording is only survivable if the record exists first",
  );
  check("and it counts as pending", pendingCount(first.getItems()) === 1);

  // --- force quit: the object is thrown away entirely --------------------
  const afterRestart = makeEngine();
  const restored = await afterRestart.load();
  check(
    "it is still there after the process dies",
    restored.length === 1 && restored[0].idempotencyKey === assignAction.idempotencyKey,
    "same key, which is what makes the next part safe",
  );

  // --- reconnect: drain --------------------------------------------------
  const report = await afterRestart.drain();
  check(
    "reconnecting sends it",
    report.sent === 1 && report.failed === 0,
    `sent ${report.sent}, failed ${report.failed}`,
  );
  check("and the queue empties", afterRestart.getItems().length === 0);

  const assigned = await api.get<Asset>(`/assets/${spare.id}/`);
  check(
    "the asset actually changed on the server",
    assigned.status === "assigned",
    `${spare.asset_tag} → ${assigned.status}`,
  );

  // --- the crash window: send the very same item again -------------------
  const historyBefore = await api.get<{ results?: unknown[] } | unknown[]>(
    `/assets/${spare.id}/history/`,
  );
  const countOf = (h: unknown) => (Array.isArray(h) ? h.length : (h as { results?: unknown[] }).results?.length ?? 0);

  const replay = makeEngine();
  await replay.load();
  await replay.enqueue({ ...assignAction, id: uuid(), status: "pending", attempts: 0 });
  const replayReport = await replay.drain();

  const historyAfter = await api.get<{ results?: unknown[] } | unknown[]>(
    `/assets/${spare.id}/history/`,
  );

  check(
    "re-sending the same key succeeds rather than erroring",
    replayReport.sent === 1,
    "the app cannot know whether the first attempt landed, so it must resend",
  );
  check(
    "and the server applied it EXACTLY ONCE",
    countOf(historyAfter) === countOf(historyBefore),
    `history rows ${countOf(historyBefore)} → ${countOf(historyAfter)}`,
  );
  check(
    "which is the whole point: two sends, one effect",
    sendCalls.filter((k) => k === assignAction.idempotencyKey).length === 2,
    `${sendCalls.filter((k) => k === assignAction.idempotencyKey).length} sends of one key`,
  );

  // --- a refusal is kept, not dropped ------------------------------------
  const refused = makeEngine();
  await refused.load();
  await refused.enqueue(
    makeItem({
      id: uuid(),
      idempotencyKey: uuid(),
      path: `/assets/${spare.id}/assign/`,
      body: { user_id: employee.id, notes: "second assign, should conflict" },
      kind: "assign",
      subject: { type: "asset", id: spare.id },
      createdAt: Date.now(),
    }),
  );
  const refusedReport = await refused.drain();
  const stuck = refused.getItems()[0];
  check(
    "an action the server refuses stays in the queue for a person to see",
    refusedReport.failed === 1 && Boolean(stuck) && stuck.status === "failed",
    stuck?.lastError ?? "",
  );

  // Leave the fixture as it was found.
  await refused.clear();
  await api.post(`/assets/${spare.id}/checkin/`, {}, { idempotencyKey: uuid() });
  const restoredAsset = await api.get<Asset>(`/assets/${spare.id}/`);
  check(
    "the asset is put back",
    restoredAsset.status === "available",
    `${spare.asset_tag} → ${restoredAsset.status}`,
  );

  await logout();

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nNot covered here: a literal force-quit and a literal aeroplane mode. Both\n" +
    "need a handset. What they cause — an item stranded mid-flight, a queue read\n" +
    "back from bytes, and the same key sent twice — is exercised above against\n" +
    "the real server.\n",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error instanceof ApiError ? error.message : error);
  process.exit(1);
});
