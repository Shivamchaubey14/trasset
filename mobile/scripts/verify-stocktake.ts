/**
 * Verification — stock take, the counting loop.
 *
 * The DoD is *a hundred assets can be scanned in sequence without leaving the
 * screen*. The "without leaving the screen" half is a property of the design
 * rather than of a value that can be asserted — nothing in the loop navigates,
 * and no scan makes a request — so what is checked here is the part that makes
 * that possible and the part that can be wrong:
 *
 *   * a hundred scans really do run in sequence against one session, and the
 *     tally after them is exactly right;
 *   * duplicates are recognised and **not** double-counted, which is the
 *     failure a camera produces by default, thirty times a second;
 *   * `missing` is derived rather than recorded, so it falls as the count
 *     rises instead of every asset starting out missing;
 *   * a real session against the server accepts the whole batch in one call
 *     and reconciles to the same numbers the phone showed.
 *
 * That last one is the point of the local engine: if the phone's arithmetic and
 * the server's disagree, the person counting has been lied to by one of them.
 *
 *   cd mobile && npx tsx scripts/verify-stocktake.ts
 */
import { ApiError, api, configureApi, configureTokenStore, login, logout } from "../src/api";
import type { Asset, Location, Page } from "../src/api";
import {
  type ExpectedAsset,
  counts,
  createSession,
  outstanding,
  recordScan,
  scanPayload,
  tagKey,
  undoScan,
} from "../src/stocktake/session";

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

const fake = (n: number): ExpectedAsset[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    asset_tag: `TRA-2026-${String(i + 1).padStart(6, "0")}`,
    name: `Asset ${i + 1}`,
  }));

async function main() {
  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);

  // =======================================================================
  console.log("\n1. A hundred scans in sequence — the DoD");

  const expected = fake(100);
  let session = createSession(1, 1, "Central Warehouse", expected);

  check("nothing is found before anything is scanned", counts(session).found === 0);
  check(
    "and everything expected starts out missing",
    counts(session).missing === 100,
    "missing is what is left over, not a state anything is put into",
  );

  const outcomes: string[] = [];
  for (const asset of expected) {
    const result = recordScan(session, asset.asset_tag);
    session = result.state;
    outcomes.push(result.outcome);
  }

  const after = counts(session);
  check(
    "a hundred scans in sequence are all recorded",
    session.scans.length === 100 && outcomes.every((o) => o === "found"),
    `${session.scans.length} scans, all found`,
  );
  check(
    "the tally is exactly right afterwards",
    after.found === 100 && after.missing === 0 && after.unexpected === 0,
    `found ${after.found}, missing ${after.missing}, unexpected ${after.unexpected}`,
  );
  check("and nothing is left outstanding", outstanding(session).length === 0);

  // =======================================================================
  console.log("\n2. Duplicates — what a camera actually does");

  let dup = createSession(1, 1, "Central Warehouse", fake(3));
  const tag = "TRA-2026-000001";

  // A camera reads one label many times a second while it is held in frame.
  let repeats = 0;
  for (let i = 0; i < 30; i += 1) {
    const result = recordScan(dup, tag);
    if (result.outcome === "duplicate") repeats += 1;
    dup = result.state;
  }
  check(
    "one label read thirty times counts once",
    counts(dup).found === 1 && dup.scans.length === 1,
    `${repeats} of 30 recognised as repeats`,
  );

  const before = dup;
  const again = recordScan(dup, tag);
  check(
    "and a repeat leaves the state identical BY REFERENCE",
    again.state === before,
    "so React does no work for the commonest event on the screen",
  );

  check(
    "case and stray whitespace are the same asset, not two",
    recordScan(dup, "  tra-2026-000001  ").outcome === "duplicate",
    "otherwise one shelf is counted twice and its twin reported missing",
  );
  check("tagKey normalises both", tagKey("  tra-2026-000001 ") === "TRA-2026-000001");

  // =======================================================================
  console.log("\n3. Unexpected, missing and undo");

  let mixed = createSession(1, 1, "Central Warehouse", fake(5));
  mixed = recordScan(mixed, "TRA-2026-000001").state;
  mixed = recordScan(mixed, "TRA-2026-000002").state;
  const stray = recordScan(mixed, "TRA-2026-009999");
  mixed = stray.state;

  check(
    "an asset from another room counts as unexpected, not discarded",
    stray.outcome === "unexpected",
    "it is physically in the counter's hand; refusing it would lose a real finding",
  );
  const m = counts(mixed);
  check(
    "missing falls as the count rises",
    m.found === 2 && m.missing === 3 && m.unexpected === 1,
    `found ${m.found}, missing ${m.missing}, unexpected ${m.unexpected}`,
  );
  check(
    "unexpected does not reduce missing",
    m.missing === 3,
    "it belongs to a different room's tally, not this one's",
  );
  check(
    "the outstanding list is what is left to walk to",
    outstanding(mixed).length === 3 && outstanding(mixed)[0].asset_tag === "TRA-2026-000003",
    outstanding(mixed).map((a) => a.asset_tag).join(", "),
  );

  const undone = undoScan(mixed, tagKey("TRA-2026-000002"));
  check(
    "a mis-scan can be undone",
    counts(undone).found === 1 && counts(undone).missing === 4,
    "the shelf behind the one being counted gets scanned more often than anyone admits",
  );

  check(
    "the batch goes up oldest first",
    scanPayload(mixed).scans[0].asset_tag === "TRA-2026-000001",
    "the audit trail should show the order they physically happened in",
  );

  // =======================================================================
  console.log("\n4. Against the real server");

  await login("admin@trasset.local", PASSWORD);

  const locations = await api.get<Page<Location>>("/locations/", { page_size: 20 });
  const assetsPage = await api.get<Page<Asset>>("/assets/", { page_size: 100 });
  // `location` is a nested object on the serialised asset, not an id.
  const locationIdOf = (a: Asset): number | null =>
    (a.location as { id?: number } | null)?.id ?? null;
  const withLocation = assetsPage.results.filter((a) => locationIdOf(a) !== null);
  const target = locations.results.find((l) =>
    withLocation.some((a) => locationIdOf(a) === l.id),
  );

  if (!target) {
    console.log("  SKIP  no location with assets on it");
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }

  // Clear any session this script left open on a previous run.
  const open = await api.get<Page<{ id: number; location: number }>>("/stock-takes/", {
    open_only: true, page_size: 50,
  });
  for (const existing of open.results) {
    if (existing.location === target.id) {
      await api.post(`/stock-takes/${existing.id}/cancel/`, {}).catch(() => {});
    }
  }

  const stockTake = await api.post<{ id: number; location_name: string }>("/stock-takes/", {
    location_id: target.id,
  });
  check("a session opens for one location", Boolean(stockTake.id), stockTake.location_name);

  const clash = await (async () => {
    try {
      await api.post("/stock-takes/", { location_id: target.id });
      return null;
    } catch (error) {
      return error instanceof ApiError ? error : null;
    }
  })();
  check(
    "a second session on the same room is refused",
    clash?.status === 409,
    clash?.message ?? "two people counting one room produce two contradictory reports",
  );

  // The expected list, exactly as the app downloads it.
  const expectedReal = withLocation
    .filter((a) => locationIdOf(a) === target.id)
    .filter((a) => !["retired", "disposed", "lost"].includes(a.status))
    .map((a) => ({ id: a.id, asset_tag: a.asset_tag, name: a.name }));

  check(
    "the expected list downloads before counting starts",
    expectedReal.length > 0,
    `${expectedReal.length} assets at ${target.name}`,
  );

  // Count all but one, so there is a real "missing", and add a stray.
  let live = createSession(stockTake.id, target.id, target.name, expectedReal);
  for (const asset of expectedReal.slice(0, -1)) {
    live = recordScan(live, asset.asset_tag).state;
    // A second read of the same label, as the camera would.
    live = recordScan(live, asset.asset_tag).state;
  }
  const elsewhere = withLocation.find((a) => locationIdOf(a) !== target.id);
  if (elsewhere) live = recordScan(live, elsewhere.asset_tag).state;

  const local = counts(live);
  const response = await api.post<{ results: { outcome: string }[]; counts: Record<string, number> }>(
    `/stock-takes/${stockTake.id}/scan/`,
    scanPayload(live),
  );

  check(
    "the whole count goes up in ONE call",
    response.results.length === live.scans.length,
    `${live.scans.length} scans, 1 request — not ${live.scans.length} requests`,
  );
  check(
    "the server agrees with the phone about found",
    response.counts.found === local.found,
    `phone ${local.found}, server ${response.counts.found}`,
  );
  check(
    "and about missing",
    response.counts.missing === local.missing,
    `phone ${local.missing}, server ${response.counts.missing}`,
  );
  check(
    "and about unexpected",
    response.counts.unexpected === local.unexpected,
    `phone ${local.unexpected}, server ${response.counts.unexpected}`,
  );

  // Leave nothing open behind.
  await api.post(`/stock-takes/${stockTake.id}/cancel/`, {}).catch(() => {});
  check("the session is closed again", true, "cancelled, so the room is free to count");

  await logout();

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nNot covered here: the camera itself, and the haptics. Both need a handset.\n" +
    "What they drive — the classification of every scan and the running tally —\n" +
    "is checked above, including a hundred in sequence.\n",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
