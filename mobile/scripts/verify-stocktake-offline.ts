/**
 * Verification — a stock take completed entirely offline.
 *
 * The DoD is *a stock take completed entirely offline submits correctly on
 * reconnect*, and it is reproduced here end to end rather than approximated:
 *
 *   1. a session is opened and its expected list downloaded while online;
 *   2. **the network is then taken away** — the queue's sender is replaced with
 *      one that fails exactly as an offline device does;
 *   3. the room is counted, and the session is thrown away and rebuilt from its
 *      bytes between scans, which is what a force-quit mid-count does;
 *   4. the finished count is queued, and a drain attempted with no network
 *      leaves it intact rather than losing it;
 *   5. the network returns, the queue drains, and the **server's own
 *      reconciliation** is read back and compared to what the phone showed.
 *
 * Step 5 is the one that matters. Every earlier step could pass while the count
 * still arrived wrong.
 *
 *   cd mobile && npx tsx scripts/verify-stocktake-offline.ts
 */
import { ApiError, api, configureApi, configureTokenStore, login, logout } from "../src/api";
import type { Asset, Location, Page } from "../src/api";
import { createQueue } from "../src/offline/queue/engine";
import { drainOrder, nextReady, pendingCount } from "../src/offline/queue/policy";
import { decodeQueue, encodeQueue } from "../src/offline/queue/serialise";
import type { QueuedMutation } from "../src/offline/queue/types";
import { counts, createSession, recordScan, scanPayload } from "../src/stocktake/session";
import { decodeSession, encodeSession } from "../src/stocktake/storage";

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
function queued(input: {
  path: string;
  body?: unknown;
  kind: string;
  id: number;
  createdAt?: number;
}): QueuedMutation {
  return {
    id: uuid(),
    idempotencyKey: uuid(),
    method: "POST",
    path: input.path,
    body: input.body,
    kind: input.kind,
    subject: { type: "stocktake", id: input.id },
    createdAt: input.createdAt ?? Date.now(),
    seq: (seq += 1),
    attempts: 0,
    nextAttemptAt: 0,
    status: "pending",
    lastError: null,
    lastStatusCode: null,
  };
}

async function main() {
  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);

  // =======================================================================
  console.log("\n1. Ordering — a submit must never overtake its own scans");

  const sameMs = Date.now();
  const scans = queued({ path: "/a/scan/", kind: "stocktake-scans", id: 1, createdAt: sameMs });
  const submit = queued({ path: "/a/submit/", kind: "stocktake-submit", id: 1, createdAt: sameMs });

  const order = drainOrder([submit, scans]);
  check(
    "two actions queued in the same millisecond keep their enqueue order",
    order[0].id === scans.id && order[1].id === submit.id,
    "a submit that overtook its scans would reconcile a count the server never received",
  );
  // The regression this day actually produced: the scan batch fails once with
  // no signal and goes into backoff, and on reconnect the submit — which never
  // got an attempt and so has no backoff — is the only *ready* item.
  const backedOff = { ...scans, nextAttemptAt: Date.now() + 60_000, attempts: 1 };
  check(
    "a backed-off action is not overtaken by its own successor",
    nextReady([backedOff, submit], Date.now()) === null,
    "otherwise the submit closes a session the server has no scans for, and every asset is missing",
  );
  check(
    "but an unrelated subject still drains while it waits",
    nextReady(
      [backedOff, submit, queued({ path: "/assets/9/checkin/", kind: "checkin", id: 9 })],
      Date.now(),
    )?.kind === "checkin",
    "only the same subject blocks",
  );

  check(
    "and the order survives being written and read back",
    (() => {
      const back = drainOrder(decodeQueue(encodeQueue([submit, scans])));
      return back[0].id === scans.id;
    })(),
    "which is what a force-quit between queueing and draining does",
  );

  // =======================================================================
  console.log("\n2. A session survives being killed mid-count");

  const sample = [
    { id: 1, asset_tag: "TRA-2026-000001", name: "One" },
    { id: 2, asset_tag: "TRA-2026-000002", name: "Two" },
    { id: 3, asset_tag: "TRA-2026-000003", name: "Three" },
  ];
  let s = createSession(7, 2, "Central Warehouse", sample);
  s = recordScan(s, "TRA-2026-000001").state;

  const revived = decodeSession(encodeSession(s));
  check(
    "the count comes back after a force-quit",
    revived !== null && counts(revived).found === 1 && counts(revived).missing === 2,
    revived ? `found ${counts(revived).found}, missing ${counts(revived).missing}` : "lost",
  );
  check(
    "and counting continues from where it stopped",
    (() => {
      if (!revived) return false;
      const next = recordScan(revived, "TRA-2026-000002");
      return next.outcome === "found" && counts(next.state).found === 2;
    })(),
    "an hour of somebody's afternoon is not recounted",
  );
  check(
    "a label already counted is still a duplicate after the restart",
    revived !== null && recordScan(revived, "tra-2026-000001").outcome === "duplicate",
    "otherwise a resumed count double-counts everything scanned before the crash",
  );
  check("a truncated write does not crash the app", decodeSession('{"version":1,"sess') === null);
  check(
    "a session from an unknown version is discarded rather than half-read",
    decodeSession(JSON.stringify({ version: 99, session: s })) === null,
    "a wrong count is worse than an honest recount — unlike a queued action, this promises nobody anything",
  );

  // =======================================================================
  console.log("\n3. The DoD, end to end against the real server");

  await login("admin@trasset.local", PASSWORD);

  const locations = await api.get<Page<Location>>("/locations/", { page_size: 20 });
  const assets = await api.get<Page<Asset>>("/assets/", { page_size: 100 });
  const locationIdOf = (a: Asset): number | null =>
    (a.location as { id?: number } | null)?.id ?? null;
  const target = locations.results.find((l) =>
    assets.results.some((a) => locationIdOf(a) === l.id),
  );

  if (!target) {
    console.log("  SKIP  no location with assets on it");
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }

  for (const existing of (
    await api.get<Page<{ id: number; location: number }>>("/stock-takes/", {
      open_only: true, page_size: 50,
    })
  ).results) {
    if (existing.location === target.id) {
      await api.post(`/stock-takes/${existing.id}/cancel/`, {}).catch(() => {});
    }
  }

  const stockTake = await api.post<{ id: number }>("/stock-takes/", { location_id: target.id });
  const expected = assets.results
    .filter((a) => locationIdOf(a) === target.id)
    .filter((a) => !["retired", "disposed", "lost"].includes(a.status))
    .map((a) => ({ id: a.id, asset_tag: a.asset_tag, name: a.name }));

  check(
    "the expected list is downloaded while there is still signal",
    expected.length > 1,
    `${expected.length} assets at ${target.name}`,
  );

  // --- the network goes ---------------------------------------------------
  let online = false;
  const disk = (() => {
    let bytes: string | null = null;
    return {
      async load() { return decodeQueue(bytes); },
      async save(items: readonly QueuedMutation[]) { bytes = encodeQueue(items); },
      raw: () => bytes,
    };
  })();

  const q = createQueue({
    load: disk.load,
    save: disk.save,
    send: (item) => {
      if (!online) {
        // Exactly what the client produces with no network: status 0.
        return Promise.reject(new ApiError(0, "Network request failed"));
      }
      return api.post(item.path, item.body, { idempotencyKey: item.idempotencyKey });
    },
    now: () => Date.now(),
    jitter: () => 0,
  });
  await q.load();

  // --- count the room with no signal, dying once in the middle ------------
  let live = createSession(stockTake.id, target.id, target.name, expected);
  const toCount = expected.slice(0, -1); // leave one behind, so `missing` is real

  live = recordScan(live, toCount[0].asset_tag).state;
  const afterCrash = decodeSession(encodeSession(live));
  check("the count survives a force-quit taken mid-room", afterCrash !== null);
  live = afterCrash ?? live;

  for (const asset of toCount.slice(1)) {
    live = recordScan(live, asset.asset_tag).state;
    live = recordScan(live, asset.asset_tag).state; // the camera reads it twice
  }
  const stray = assets.results.find((a) => locationIdOf(a) !== target.id);
  if (stray) live = recordScan(live, stray.asset_tag).state;

  const onPhone = counts(live);
  console.log(
    `     phone says: found ${onPhone.found}, missing ${onPhone.missing}, unexpected ${onPhone.unexpected}`,
  );

  // --- hand it over, still with no signal ---------------------------------
  await q.enqueue(queued({
    path: `/stock-takes/${stockTake.id}/scan/`,
    body: scanPayload(live),
    kind: "stocktake-scans",
    id: stockTake.id,
  }));
  await q.enqueue(queued({
    path: `/stock-takes/${stockTake.id}/submit/`,
    body: {},
    kind: "stocktake-submit",
    id: stockTake.id,
  }));

  check("the finished count is on disk before anything is sent", disk.raw() !== null);

  const offlineDrain = await q.drain();
  check(
    "draining with no network loses nothing",
    offlineDrain.sent === 0 && pendingCount(q.getItems()) === 2,
    `${pendingCount(q.getItems())} still queued, ${offlineDrain.failed} failed attempt(s)`,
  );

  // A force-quit while the count is waiting to send.
  const afterRestart = createQueue({
    load: disk.load,
    save: disk.save,
    send: (item) => api.post(item.path, item.body, { idempotencyKey: item.idempotencyKey }),
    now: () => Date.now(),
    jitter: () => 0,
  });
  const restored = await afterRestart.load();
  check(
    "and it is still queued after the app is killed",
    restored.length === 2,
    "the count is durable before it is delivered",
  );

  // --- the signal returns -------------------------------------------------
  online = true;
  // What the app does on the reconnect event: cancel the outage's backoff,
  // then drain.
  await afterRestart.wake();
  const drain = await afterRestart.drain();
  check(
    "reconnecting sends both calls, in order",
    drain.sent === 2 && drain.failed === 0,
    `sent ${drain.sent}`,
  );
  check("and the queue empties", afterRestart.getItems().length === 0);

  // --- the server's own reconciliation ------------------------------------
  const report = await api.get<{
    counts: { found: number; missing: number; unexpected: number };
    stock_take: { status: string };
  }>(`/stock-takes/${stockTake.id}/report/`);

  check(
    "the session is closed on the server",
    report.stock_take.status === "submitted",
    report.stock_take.status,
  );
  check(
    "the server found what the phone found",
    report.counts.found === onPhone.found,
    `phone ${onPhone.found}, server ${report.counts.found}`,
  );
  check(
    "and agrees on missing",
    report.counts.missing === onPhone.missing,
    `phone ${onPhone.missing}, server ${report.counts.missing}`,
  );
  check(
    "and on unexpected",
    report.counts.unexpected === onPhone.unexpected,
    `phone ${onPhone.unexpected}, server ${report.counts.unexpected}`,
  );

  // --- replaying the submit, as a flaky connection would ------------------
  const second = await api.post<unknown>(`/stock-takes/${stockTake.id}/submit/`, {});
  const afterReplay = await api.get<{ counts: { missing: number } }>(
    `/stock-takes/${stockTake.id}/report/`,
  );
  check(
    "submitting twice does not reconcile twice",
    Boolean(second) && afterReplay.counts.missing === report.counts.missing,
    `missing ${report.counts.missing} → ${afterReplay.counts.missing}`,
  );

  await logout();

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nNot covered here: a literal aeroplane mode and a literal force-quit. The\n" +
    "first is simulated by failing the sender exactly as the client does with no\n" +
    "network; the second by discarding the objects and rebuilding them from their\n" +
    "stored bytes, which is what a relaunch does.\n",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
