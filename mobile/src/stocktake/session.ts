/**
 * A counting session, reconciled on the phone.
 *
 * The tempting design is to POST each scan and let the server keep the tally.
 * It is wrong twice over. A store room is exactly where the signal is worst, so
 * the one place this has to work is the one place that design fails; and a
 * hundred scans would be a hundred round trips, each one a pause between a
 * person and the next label. So the expected list is downloaded once, every
 * scan is reconciled locally, and the batch goes up at the end (FR-14.21).
 *
 * That makes this the heart of the feature and it is therefore pure: no React,
 * no storage, no network. A hundred scans in sequence can be checked exactly,
 * without a camera.
 *
 * The three answers are not symmetrical, and the vocabulary is the server's
 * (`apps/stocktake/constants.py`):
 *
 *   found       expected here, and seen — the boring, good case
 *   missing     expected here, never seen — the reason stock takes exist
 *   unexpected  seen here, but the register says it lives somewhere else
 *
 * `missing` is the only one that cannot be observed. It is what is left over,
 * which is why it is derived at the end rather than recorded during.
 */

export type ScanOutcome =
  /** Counted. */
  | "found"
  /** Counted, but it does not belong to this location. */
  | "unexpected"
  /** Already counted — recognised, deliberately not counted twice. */
  | "duplicate"
  /** Not a tag this phone can make sense of. */
  | "unknown";

export type ExpectedAsset = {
  id: number;
  asset_tag: string;
  name: string;
};

export type Scan = {
  tag: string;
  /** Normalised key — what duplicate detection actually compares. */
  key: string;
  at: number;
  outcome: Exclude<ScanOutcome, "duplicate">;
  /** Resolved from the expected list; absent for an unexpected asset. */
  asset?: ExpectedAsset;
};

export type SessionState = {
  stockTakeId: number;
  locationId: number;
  locationName: string;
  /** Keyed by normalised tag, so a lookup is O(1) at any list size. */
  expected: Record<string, ExpectedAsset>;
  scans: Scan[];
};

export type Counts = {
  expected: number;
  found: number;
  missing: number;
  unexpected: number;
  scanned: number;
};

/**
 * How two tags are judged to be the same.
 *
 * Case and surrounding space are noise: a tag can arrive from a barcode
 * reader, from a URL something lowercased on the way, or from a person typing
 * it with a trailing space. Treating those as different assets would count one
 * shelf twice and report the other copy missing — the two worst outcomes this
 * screen can produce, and it would produce both from one scan.
 */
export function tagKey(tag: string): string {
  return tag.trim().toUpperCase();
}

export function createSession(
  stockTakeId: number,
  locationId: number,
  locationName: string,
  expected: readonly ExpectedAsset[],
): SessionState {
  const index: Record<string, ExpectedAsset> = {};
  for (const asset of expected) index[tagKey(asset.asset_tag)] = asset;
  return { stockTakeId, locationId, locationName, expected: index, scans: [] };
}

/**
 * Classify a scan without applying it.
 *
 * Separate from `recordScan` so a screen can show what *would* happen — the
 * haptic and the colour fire from this, before any state changes.
 */
export function classify(state: SessionState, tag: string): ScanOutcome {
  const key = tagKey(tag);
  if (!key) return "unknown";
  if (state.scans.some((scan) => scan.key === key)) return "duplicate";
  if (state.expected[key]) return "found";
  // Not expected here. It is still a real thing the counter is holding, so it
  // is counted as unexpected rather than discarded — the server decides at
  // submission whether the tag resolves to an asset at all, because this phone
  // only downloaded *this* location's list and cannot know about the rest.
  return "unexpected";
}

/**
 * Apply a scan. Returns the new state and what happened.
 *
 * A duplicate returns the state **unchanged and by reference**, so a screen
 * re-rendering on every scan does no work for the fifth read of the same label
 * — which, with a camera pointed steadily at one barcode, is the common case.
 */
export function recordScan(
  state: SessionState,
  tag: string,
  at: number = Date.now(),
): { state: SessionState; outcome: ScanOutcome } {
  const outcome = classify(state, tag);
  if (outcome === "duplicate" || outcome === "unknown") {
    return { state, outcome };
  }

  const key = tagKey(tag);
  const scan: Scan = {
    tag: tag.trim(),
    key,
    at,
    outcome,
    asset: state.expected[key],
  };

  // Newest first: the person wants to see what they just scanned, not what
  // they scanned ninety-eight labels ago.
  return { state: { ...state, scans: [scan, ...state.scans] }, outcome };
}

/** Undo a scan — a mis-scan of the shelf behind the one being counted. */
export function undoScan(state: SessionState, key: string): SessionState {
  return { ...state, scans: state.scans.filter((scan) => scan.key !== key) };
}

export function counts(state: SessionState): Counts {
  const expected = Object.keys(state.expected).length;
  let found = 0;
  let unexpected = 0;
  for (const scan of state.scans) {
    if (scan.outcome === "found") found += 1;
    else unexpected += 1;
  }
  return {
    expected,
    found,
    // Derived, never recorded: missing is whatever the register expected and
    // nobody saw. Counting it during the session would mean every asset was
    // "missing" until the moment it was scanned.
    missing: expected - found,
    unexpected,
    scanned: found + unexpected,
  };
}

/** What has not been seen yet — the list someone walks the room with. */
export function outstanding(state: SessionState): ExpectedAsset[] {
  const seen = new Set(state.scans.map((scan) => scan.key));
  return Object.entries(state.expected)
    .filter(([key]) => !seen.has(key))
    .map(([, asset]) => asset)
    .sort((a, b) => a.asset_tag.localeCompare(b.asset_tag));
}

/** The batch the server expects (`ScanBatchSerializer`). */
export function scanPayload(state: SessionState) {
  return {
    scans: state.scans
      // Oldest first on the way up: the server records them in the order they
      // physically happened, which is what the audit trail should show.
      .slice()
      .reverse()
      .map((scan) => ({
        asset_tag: scan.tag,
        scanned_at: new Date(scan.at).toISOString(),
      })),
  };
}