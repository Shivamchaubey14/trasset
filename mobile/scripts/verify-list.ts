/**
 * Day 42 verification — the queries the Assets screen actually issues.
 *
 * The screen builds its query string by hand (repeated `?status=` cannot be
 * expressed as a plain object), so the thing worth proving is that those exact
 * URLs come back with the shape the list assumes: a page it can flatten, a
 * `total_pages` it can page against, and filters that actually narrow.
 *
 *   cd mobile && npx tsx scripts/verify-list.ts
 */
import { api, configureApi, configureTokenStore, login, logout } from "../src/api";
import type { Asset, Location, Page, User } from "../src/api";

const BASE = "http://127.0.0.1:8000/api/v1";
const PASSWORD = "Trasset@2026";
const PAGE_SIZE = 20;

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

/** Exactly how AssetsScreen builds its request. */
function listUrl(params: Record<string, string | number>, statuses: string[], page: number) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => query.append(k, String(v)));
  statuses.forEach((s) => query.append("status", s));
  query.append("page", String(page));
  return `/assets/?${query.toString()}`;
}

async function main() {
  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);
  await login("admin@trasset.local", PASSWORD);

  console.log("\n1. The page shape the list flattens");
  const first = await api.get<Page<Asset>>(listUrl({ page_size: PAGE_SIZE }, [], 1));
  check("results is an array", Array.isArray(first.results));
  check("count, page and total_pages are present",
    typeof first.count === "number" && typeof first.page === "number" &&
    typeof first.total_pages === "number",
    `count=${first.count} pages=${first.total_pages}`);
  check("page_size is honoured", first.results.length <= PAGE_SIZE);

  console.log("\n2. Pagination — what onEndReached does");
  if (first.total_pages > 1) {
    const second = await api.get<Page<Asset>>(listUrl({ page_size: PAGE_SIZE }, [], 2));
    check("page 2 returns rows", second.results.length > 0);
    const overlap = second.results.filter((row) =>
      first.results.some((other) => other.id === row.id));
    check("pages do not overlap", overlap.length === 0,
      overlap.length ? `${overlap.length} duplicated` : "clean");
    check("getNextPageParam stops at the last page",
      (second.page < second.total_pages) === (2 < first.total_pages));
  } else {
    console.log(`  (only ${first.total_pages} page — seeding more would be needed)`);
  }

  console.log("\n3. Search — the DoD: find by name, tag or serial");
  const sample = first.results.find((a) => a.serial_number) ?? first.results[0];
  for (const [label, term] of [
    ["by tag", sample.asset_tag],
    ["by name", sample.name.split(" ")[0]],
    ["by serial", sample.serial_number ?? ""],
  ] as const) {
    if (!term) { console.log(`  (skipped ${label} — none on the sample)`); continue; }
    const found = await api.get<Page<Asset>>(listUrl({ page_size: 20, search: term }, [], 1));
    check(`finds ${label}`, found.results.some((a) => a.id === sample.id),
      `"${term}" → ${found.count} result(s)`);
  }

  const nonsense = await api.get<Page<Asset>>(
    listUrl({ page_size: 20, search: "zzz-not-a-thing-zzz" }, [], 1));
  check("a search with no matches returns an empty page, not an error",
    nonsense.count === 0 && Array.isArray(nonsense.results));

  console.log("\n4. Filters actually narrow");
  const multi = await api.get<Page<Asset>>(
    listUrl({ page_size: 50 }, ["available", "assigned"], 1));
  check("repeated ?status= is honoured as multi-select",
    multi.results.every((a) => ["available", "assigned"].includes(String(a.status))),
    `${multi.count} row(s)`);

  const onlyAvailable = await api.get<Page<Asset>>(listUrl({ page_size: 50 }, ["available"], 1));
  check("a single status narrows further",
    onlyAvailable.count <= multi.count && onlyAvailable.results.every((a) => a.status === "available"),
    `${onlyAvailable.count} ≤ ${multi.count}`);

  const locations = await api.get<Page<Location>>("/locations/", { page_size: 100 });
  const location = locations.results.find((l) => (l as { asset_count?: number }).asset_count);
  if (location) {
    const byLocation = await api.get<Page<Asset>>(
      listUrl({ page_size: 50, location: location.id }, [], 1));
    check("location filter narrows to that location",
      byLocation.results.every((a) => {
        const loc = a.location as { id?: number } | null;
        return loc?.id === location.id;
      }),
      `${location.name}: ${byLocation.count}`);
  }

  console.log("\n5. My assets — the other half of the DoD");
  await logout();
  await login("employee@trasset.local", PASSWORD);
  const me = await api.get<User>("/auth/me/");
  const mine = await api.get<Page<Asset>>(listUrl({ page_size: 50, assigned_to: me.id }, [], 1));

  check("assigned_to returns only this person's assets",
    mine.results.every((a) => {
      const holder = a.assigned_to as { id?: number } | null;
      return holder?.id === me.id;
    }),
    `${mine.count} held by ${me.email}`);
  check("every row carries what AssetRow renders",
    mine.results.every((a) =>
      "asset_tag" in a && "name" in a && "status" in a) ||
      mine.count === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
