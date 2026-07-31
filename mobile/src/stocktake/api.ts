/**
 * Talking to the stock take endpoints.
 *
 * The one thing worth explaining is `fetchExpected`. The register is paginated,
 * and a stock take needs *all* of a location's assets before the counting
 * starts — a session that discovers page three is missing halfway round the
 * room is worse than one that refused to start. So it pages eagerly, up front,
 * while there is still signal to do it with.
 */
import { api } from "@/api";
import type { Asset, Page } from "@/api";

import type { ExpectedAsset } from "./session";

/** Big pages: fewer round trips over a bad connection beats a tidy page size. */
const PAGE_SIZE = 200;

/** A guard, not a limit — one location holding this much is a data problem. */
const MAX_PAGES = 50;

export type StockTake = {
  id: number;
  location: number;
  location_name: string;
  status: string;
  is_open: boolean;
  started_at: string;
  counts: { found: number; missing: number; unexpected: number; scanned: number };
};

export async function startStockTake(locationId: number, notes = ""): Promise<StockTake> {
  // A 409 here means someone else is already counting this room. That is not
  // an error to swallow — two people counting one location produce two
  // contradictory reports — so it is left to the caller to show.
  // `location_id`, not `location` — the create serializer takes the id under
  // that name and maps it with `source="location"`.
  return api.post<StockTake>("/stock-takes/", { location_id: locationId, notes });
}

export async function openStockTakes(): Promise<StockTake[]> {
  const page = await api.get<Page<StockTake>>("/stock-takes/", { open_only: true, page_size: 50 });
  return page.results;
}

/**
 * Every asset the register places at this location.
 *
 * Terminal statuses are excluded to match `StockTake.expected_assets()` on the
 * server. Counting a disposed asset as missing on every single stock take
 * would bury the entries that actually matter.
 */
export async function fetchExpected(locationId: number): Promise<ExpectedAsset[]> {
  const all: ExpectedAsset[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await api.get<Page<Asset>>("/assets/", {
      location: locationId,
      page,
      page_size: PAGE_SIZE,
    });

    for (const asset of result.results) {
      if (asset.status === "retired" || asset.status === "disposed" || asset.status === "lost") {
        continue;
      }
      all.push({ id: asset.id, asset_tag: asset.asset_tag, name: asset.name });
    }

    if (page >= result.total_pages) break;
  }

  return all;
}

export async function submitScans(stockTakeId: number, payload: { scans: unknown[] }) {
  return api.post<{ results: unknown[]; counts: Record<string, number> }>(
    `/stock-takes/${stockTakeId}/scan/`,
    payload,
  );
}
