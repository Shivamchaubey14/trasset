/**
 * How old is what you are looking at.
 *
 * Cached data is only safe to show if its age is shown with it — otherwise
 * stale reads as live, and someone walks to a store room on the strength of a
 * holder who changed yesterday. SRS §12.5 asks for exactly this.
 *
 * Deliberately coarse. "3 min ago" is a claim about freshness, not a clock, and
 * rounding to the nearest minute avoids a label that churns every second. Pure
 * and `now`-injectable so the boundaries can be checked without waiting.
 */

/** Anything older than this is called out as properly stale rather than aged. */
export const STALE_AFTER_MS = 60 * 60 * 1000;

export function describeAge(from: Date | number, now: Date | number = Date.now()): string {
  const fromMs = from instanceof Date ? from.getTime() : from;
  const nowMs = now instanceof Date ? now.getTime() : now;

  // A clock that moved backwards — or a device whose time is simply wrong —
  // must not produce "in 3 minutes". Clamped, because the honest answer to
  // "how old is this" in that case is "as new as I can tell".
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000));

  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

/** True once the age is worth a stronger word than "cached". */
export function isStale(from: Date | number, now: Date | number = Date.now()): boolean {
  const fromMs = from instanceof Date ? from.getTime() : from;
  const nowMs = now instanceof Date ? now.getTime() : now;
  return nowMs - fromMs >= STALE_AFTER_MS;
}

/**
 * The sentence a screen puts under cached content.
 *
 * `updatedAt` of 0 is TanStack's "never fetched", which is not an age at all —
 * there is nothing cached to describe, so callers get null and show their
 * empty state instead of "showing data from just now".
 */
export function cachedLabel(
  updatedAt: number | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!updatedAt) return null;
  return `Showing data from ${describeAge(updatedAt, now)}`;
}
