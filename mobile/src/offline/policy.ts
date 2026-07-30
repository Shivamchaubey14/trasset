/**
 * What is allowed onto disk, and for how long.
 *
 * Pure, so the predicate can be exercised directly — `persist.ts` is the half
 * that owns AsyncStorage.
 */

export const PERSIST_KEY = "trasset.query-cache";

/**
 * How long a restored cache is allowed to be.
 *
 * Matches `gcTime` in `createQueryClient`. Beyond a day, "showing data from
 * 3 d ago" stops being a useful offer and starts being a misleading one.
 */
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

/**
 * Whether a single query is worth keeping.
 *
 * Only successful queries that actually hold something. Persisting an error
 * would restore a failure as though it were a result, and persisting an
 * `undefined` would restore a screen that renders nothing while claiming to
 * have cached data.
 */
export function shouldPersistQuery(query: {
  state: { status: string; data: unknown };
}): boolean {
  return query.state.status === "success" && query.state.data !== undefined;
}
