/**
 * Turn whatever the camera read into something the API can resolve.
 *
 * A scan is not one format. The label Trasset prints is a QR containing the
 * asset's *detail URL* (`…/asset-detail.html?tag=TRA-2026-000001`), but the
 * same camera will also read a bare tag someone typed onto a replacement
 * sticker, a `trasset://` deep link, and the manufacturer's own barcode on the
 * side of the box — which carries a serial number, not a Trasset tag.
 *
 * Guessing wrong is cheap to recover from but confusing, so the rule is:
 * anything that *looks* like an asset tag is treated as one, and anything else
 * is tried as a serial. Nothing is rejected before the server has had a look.
 */

/** `TRA-2026-000001` — prefix, year, sequence (FR-3.2). */
const ASSET_TAG = /^[A-Z]{2,5}-\d{4}-\d{4,8}$/i;

export type ScanKind = "tag" | "serial";

export interface ParsedScan {
  kind: ScanKind;
  value: string;
  /** The raw scan, kept for the "not recognised" screen to show verbatim. */
  raw: string;
}

/** Pull `?tag=` out of a URL without needing a full URL parser. */
function tagFromUrl(raw: string): string | null {
  const match = raw.match(/[?&]tag=([^&#\s]+)/i);
  if (match) return decodeURIComponent(match[1]);

  // `trasset://assets/12` carries an id, not a tag — not resolvable by tag, so
  // it is deliberately not handled here. Deep links route through the
  // navigator's linking config instead.
  return null;
}

export function parseScan(raw: string): ParsedScan {
  const trimmed = (raw ?? "").trim();

  const fromUrl = tagFromUrl(trimmed);
  if (fromUrl && ASSET_TAG.test(fromUrl)) {
    return { kind: "tag", value: fromUrl.toUpperCase(), raw: trimmed };
  }

  if (ASSET_TAG.test(trimmed)) {
    return { kind: "tag", value: trimmed.toUpperCase(), raw: trimmed };
  }

  // Everything else is a candidate serial. Manufacturer barcodes are the whole
  // reason this branch exists (FR-14.7); a 1D barcode is just a string, and
  // only the server can say whether it names an asset.
  return { kind: "serial", value: trimmed, raw: trimmed };
}

/** True when the value could not possibly resolve, so we can fail fast. */
export function isScannable(raw: string): boolean {
  const trimmed = (raw ?? "").trim();
  return trimmed.length >= 3 && trimmed.length <= 120;
}
