/**
 * Verification — offline reads.
 *
 * The DoD is "in aeroplane mode, recently viewed assets and my assets still
 * open". Aeroplane mode itself needs a handset, but almost none of what makes
 * that work is about the radio — it is four decisions, and each is pure and
 * checked here:
 *
 *   * `isReachable` — connected is not the same as reachable, and the captive
 *     portal is the case that breaks naive checks;
 *   * `offlineRead` — every combination of (online, cached, loading, error),
 *     including the two that produce the classic bugs: a spinner that spins
 *     forever, and "no assets" shown when the truth is "no signal";
 *   * `describeAge` — the label that stops stale data reading as live;
 *   * `shouldPersistQuery` — what is allowed onto disk in the first place.
 *
 * It also round-trips a real `QueryClient` through `dehydrate` → JSON →
 * `hydrate`, using the same predicate the persister is configured with. That is
 * "survives a force-quit" minus the process death and the AsyncStorage call —
 * the serialisation and the restore are the parts that can actually be wrong.
 *
 *   cd mobile && npx tsx scripts/verify-offline.ts
 */
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";

import { cachedLabel, describeAge, isStale } from "../src/offline/freshness";
import { shouldPersistQuery } from "../src/offline/policy";
import { offlineRead, type QueryFacts } from "../src/offline/read";
import { isReachable } from "../src/net/reachability";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ""}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const facts = (over: Partial<QueryFacts> = {}): QueryFacts => ({
  dataUpdatedAt: 0,
  isLoading: false,
  isError: false,
  hasData: false,
  ...over,
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

async function main() {
  // =======================================================================
  console.log("\n1. isReachable — connected is not reachable");

  check("connected with internet → online", isReachable({ isConnected: true, isInternetReachable: true }));
  check("no connection at all → offline", !isReachable({ isConnected: false, isInternetReachable: false }));
  check(
    "captive portal: connected but nothing reachable → offline",
    !isReachable({ isConnected: true, isInternetReachable: false }),
    "the case a naive isConnected check gets wrong",
  );
  check(
    "connected, reachability unknown → online",
    isReachable({ isConnected: true, isInternetReachable: null }),
    "Android reports null while probing; guessing offline would suppress the first fetch",
  );
  check(
    "nothing known at all → online",
    isReachable({}),
    "an unknown state must not hide every screen behind a banner",
  );
  check(
    "disconnected but reachability claims true → online",
    isReachable({ isConnected: false, isInternetReachable: true }),
    "the honest signal wins whenever it has an opinion",
  );

  // =======================================================================
  console.log("\n2. offlineRead — the four states a screen can be in");

  const loadingOnline = offlineRead(facts({ isLoading: true }), true);
  check(
    "online, nothing cached, loading → spinner",
    loadingOnline.showSpinner && !loadingOnline.showOfflineEmpty && !loadingOnline.showBanner,
  );

  const loadingOffline = offlineRead(facts({ isLoading: true }), false);
  check(
    "OFFLINE, nothing cached, 'loading' → offline state, never a spinner",
    !loadingOffline.showSpinner && loadingOffline.showOfflineEmpty,
    "a spinner promises something is happening; with no network nothing is",
  );

  const cachedOffline = offlineRead(
    facts({ hasData: true, dataUpdatedAt: Date.now() - 3 * MINUTE }),
    false,
  );
  check(
    "OFFLINE with cached rows → content plus a dated banner",
    cachedOffline.showBanner && !cachedOffline.showOfflineEmpty && !cachedOffline.showSpinner,
    cachedOffline.cachedLabel ?? "",
  );

  const cachedOnline = offlineRead(facts({ hasData: true, dataUpdatedAt: Date.now() }), true);
  check(
    "online with data → no banner",
    !cachedOnline.showBanner,
    "a banner while a request is in flight is worse than none",
  );

  const erroredOffline = offlineRead(facts({ isError: true }), false);
  check(
    "OFFLINE and errored → offline state, not the error",
    erroredOffline.showOfflineEmpty && !erroredOffline.showError,
    "a request with no signal also fails; blaming the server would be wrong",
  );

  const erroredOnline = offlineRead(facts({ isError: true }), true);
  check(
    "online and errored → the error speaks for itself",
    erroredOnline.showError && !erroredOnline.showOfflineEmpty,
  );

  const staleWhileRefetching = offlineRead(
    facts({ hasData: true, isLoading: true, dataUpdatedAt: Date.now() - MINUTE }),
    true,
  );
  check(
    "cached data is never replaced by a spinner on refetch",
    !staleWhileRefetching.showSpinner,
    "the whole point of keeping it is that it stays on screen",
  );

  check(
    "nothing ever fetched → no age label invented",
    offlineRead(facts({ hasData: true, dataUpdatedAt: 0 }), false).cachedLabel === null,
    "dataUpdatedAt of 0 is 'never', not 1970",
  );

  // =======================================================================
  console.log("\n3. describeAge — stale must not read as live");

  const now = Date.now();
  check("under a minute → 'just now'", describeAge(now - 20_000, now) === "just now", describeAge(now - 20_000, now));
  check("minutes", describeAge(now - 3 * MINUTE, now) === "3 min ago", describeAge(now - 3 * MINUTE, now));
  check("hours", describeAge(now - 5 * HOUR, now) === "5 h ago", describeAge(now - 5 * HOUR, now));
  check("days", describeAge(now - 50 * HOUR, now) === "2 d ago", describeAge(now - 50 * HOUR, now));
  check(
    "a clock that moved backwards never says 'in 3 minutes'",
    describeAge(now + 3 * MINUTE, now) === "just now",
    "device clocks are wrong more often than anyone expects",
  );
  check("an hour old counts as stale", isStale(now - HOUR, now) && !isStale(now - MINUTE, now));
  check(
    "the label reads as a caveat",
    cachedLabel(now - 2 * MINUTE, now) === "Showing data from 2 min ago",
    cachedLabel(now - 2 * MINUTE, now) ?? "",
  );

  // =======================================================================
  console.log("\n4. What is allowed onto disk");

  check(
    "a successful query with data persists",
    shouldPersistQuery({ state: { status: "success", data: [{ id: 1 }] } }),
  );
  check(
    "an errored query does not",
    !shouldPersistQuery({ state: { status: "error", data: undefined } }),
    "restoring a failure as though it were a result",
  );
  check(
    "a pending query does not",
    !shouldPersistQuery({ state: { status: "pending", data: undefined } }),
  );
  check(
    "a success holding undefined does not",
    !shouldPersistQuery({ state: { status: "success", data: undefined } }),
    "would restore a screen that renders nothing while claiming cached data",
  );

  // =======================================================================
  console.log("\n5. The cache survives being written and read back");

  const source = new QueryClient();
  const fetchedAt = Date.now() - 4 * MINUTE;
  source.setQueryData(["asset", 19], { id: 19, asset_tag: "TRA-2026-000019", name: "Dell Latitude 5440" }, { updatedAt: fetchedAt });
  source.setQueryData(["assets", "mine"], [{ id: 19 }, { id: 27 }], { updatedAt: fetchedAt });

  // Dehydrate with the same predicate the persister uses, then hydrate into a
  // fresh client — which is what a relaunch does, minus the process death.
  const frozen = JSON.parse(
    JSON.stringify(dehydrate(source, { shouldDehydrateQuery: shouldPersistQuery })),
  );

  const restored = new QueryClient();
  hydrate(restored, frozen);

  const asset = restored.getQueryData<{ asset_tag: string }>(["asset", 19]);
  check(
    "a viewed asset survives the round trip",
    asset?.asset_tag === "TRA-2026-000019",
    asset?.asset_tag ?? "missing",
  );
  check(
    "and so does 'my assets'",
    (restored.getQueryData<unknown[]>(["assets", "mine"]) ?? []).length === 2,
    "both halves of the DoD",
  );

  const state = restored.getQueryCache().find({ queryKey: ["asset", 19] })?.state;
  check(
    "its age comes back with it, so the banner can date it",
    state?.dataUpdatedAt === fetchedAt,
    state ? describeAge(state.dataUpdatedAt, Date.now()) : "no state",
  );

  const errored = new QueryClient();
  errored.setQueryData(["assets", "all"], undefined);
  const frozenEmpty = dehydrate(errored, { shouldDehydrateQuery: shouldPersistQuery });
  check(
    "nothing worthless is written",
    frozenEmpty.queries.length === 0,
    `${frozenEmpty.queries.length} queries dehydrated`,
  );
  check(
    "and no mutations are ever written",
    (frozen as { mutations?: unknown[] }).mutations?.length === 0,
    "replaying a write from a restored cache would apply it twice",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nNot covered here: the OS actually reporting aeroplane mode, and AsyncStorage\n" +
    "surviving a real force-quit. Both need a handset. What they feed — the\n" +
    "reachability decision, the per-screen state and the dehydrate/hydrate round\n" +
    "trip — is checked above.\n",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
