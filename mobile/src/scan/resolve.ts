/**
 * Resolve a scan to an asset.
 *
 * MNFR-2 gives this two seconds from scan to detail, so the happy path is one
 * request: `GET /assets/by-tag/{tag}/` (BE-6), built for exactly this and
 * returning the detail shape so nothing further is needed.
 *
 * A manufacturer barcode has no such endpoint, so it falls back to a search
 * and an exact match client-side. That is deliberately strict: a search for
 * `SN-4471` would happily return three assets whose serials merely contain it,
 * and opening the wrong asset is worse than saying "not recognised".
 */
import { ApiError, api } from "@/api";
import type { AssetDetail, Page } from "@/api";

import { type ParsedScan, parseScan } from "./parse";

export type ScanOutcome =
  | { status: "found"; asset: AssetDetail; scan: ParsedScan }
  | { status: "notFound"; scan: ParsedScan }
  | { status: "ambiguous"; scan: ParsedScan; count: number }
  | { status: "error"; scan: ParsedScan; message: string; offline: boolean };

export async function resolveScan(raw: string): Promise<ScanOutcome> {
  const scan = parseScan(raw);

  try {
    if (scan.kind === "tag") {
      const asset = await api.get<AssetDetail>(
        `/assets/by-tag/${encodeURIComponent(scan.value)}/`,
      );
      return { status: "found", asset, scan };
    }

    // Serial route (FR-14.7).
    const page = await api.get<Page<{ id: number; serial_number: string | null }>>(
      "/assets/",
      { search: scan.value, page_size: 5 },
    );

    const exact = page.results.filter(
      (row) => (row.serial_number ?? "").trim().toLowerCase() === scan.value.toLowerCase(),
    );

    if (exact.length === 1) {
      // The list serializer is a thinner shape than the detail screen wants,
      // so fetch the full record rather than passing a half-populated object.
      const asset = await api.get<AssetDetail>(`/assets/${exact[0].id}/`);
      return { status: "found", asset, scan };
    }
    if (exact.length > 1) {
      return { status: "ambiguous", scan, count: exact.length };
    }
    return { status: "notFound", scan };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) return { status: "notFound", scan };
      return {
        status: "error",
        scan,
        message: error.message,
        offline: error.isNetworkError,
      };
    }
    return { status: "error", scan, message: "Something went wrong.", offline: false };
  }
}
