/**
 * The offline shape of a read screen, decided once.
 *
 * Every list and detail screen has to answer the same questions when the signal
 * goes, and answering them separately in nine screens is how they end up
 * disagreeing — one showing a spinner forever, another claiming to be offline
 * while a request is in flight, a third showing "no assets" when the truth is
 * "cannot reach the server".
 *
 * The rule that matters: **a spinner is a promise that something is happening.**
 * With no network nothing is happening, so an offline screen with no cached data
 * must show an offline state with a retry, never a spinner. That is the
 * difference between an app that looks broken and one that looks honest.
 *
 * Pure — it takes the query's facts and connectivity as plain values — so every
 * combination is checkable without a device. `useOfflineRead.ts` is the hook
 * that wires it to live connectivity.
 */
import { cachedLabel } from "./freshness";

export type QueryFacts = {
  /** TanStack's `dataUpdatedAt`: 0 when nothing has ever been fetched. */
  dataUpdatedAt: number;
  isLoading: boolean;
  isError: boolean;
  hasData: boolean;
};

export type OfflineRead = {
  online: boolean;
  /** Cached content is on screen and the network is gone — say so. */
  showBanner: boolean;
  /** "Showing data from 3 min ago", or null when there is nothing to date. */
  cachedLabel: string | null;
  /** Safe to promise that something is loading. */
  showSpinner: boolean;
  /** Nothing cached and no way to fetch — an offline state, not an empty one. */
  showOfflineEmpty: boolean;
  /** A real failure, distinct from being offline. */
  showError: boolean;
};

export function offlineRead(
  facts: QueryFacts,
  online: boolean,
  now: number = Date.now(),
): OfflineRead {
  const { dataUpdatedAt, isLoading, isError, hasData } = facts;

  return {
    online,
    // Only worth a banner when there is something on screen for it to caveat.
    // Offline with an empty screen is covered by the offline state instead, and
    // showing both would say the same thing twice.
    showBanner: !online && hasData,
    cachedLabel: hasData ? cachedLabel(dataUpdatedAt, now) : null,
    // Held back when offline even if the query calls itself loading: with the
    // network gone it is not loading, it is waiting for a network.
    showSpinner: isLoading && !hasData && online,
    showOfflineEmpty: !online && !hasData,
    // An error only speaks for itself while online. Offline, the honest
    // explanation is the missing network, not whatever the request threw.
    showError: online && isError && !hasData,
  };
}

/** Builds `QueryFacts` from a TanStack query result without repeating it. */
export function factsOf(query: {
  dataUpdatedAt: number;
  isLoading: boolean;
  isError: boolean;
  data: unknown;
}): QueryFacts {
  return {
    dataUpdatedAt: query.dataUpdatedAt,
    isLoading: query.isLoading,
    isError: query.isError,
    hasData: query.data !== undefined && query.data !== null,
  };
}
