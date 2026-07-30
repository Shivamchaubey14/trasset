/**
 * Connectivity — the half that talks to the OS.
 *
 * One source of truth: TanStack Query's `onlineManager`. Everything that cares
 * whether there is a network — the query layer deciding whether to fetch, the
 * banner deciding whether to show — reads the same value, so they cannot
 * disagree. A screen that says "Offline" while a request of its own is in
 * flight is worse than no banner at all.
 *
 * The decision itself lives in `reachability.ts`, free of platform imports, so
 * it can be checked without a phone.
 */
import { onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { useSyncExternalStore } from "react";

import { isReachable } from "./reachability";

export { isReachable } from "./reachability";
export type { Reachability } from "./reachability";

/**
 * Point `onlineManager` at the OS.
 *
 * Called once at startup. The returned function restores a no-op listener,
 * which matters only in tests — the app never stops watching.
 */
export function watchConnectivity(): () => void {
  onlineManager.setEventListener((setOnline) => {
    // Seed immediately: `addNetworkStateListener` fires only on *change*, so
    // without this the app would hold its default assumption until the first
    // time connectivity moved, which on a stable connection is never.
    void Network.getNetworkStateAsync()
      .then((state) => setOnline(isReachable(state)))
      .catch(() => setOnline(true));

    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(isReachable(state));
    });
    return () => subscription.remove();
  });

  return () => onlineManager.setEventListener(() => () => {});
}

/**
 * Whether the app currently believes it is online.
 *
 * Subscribed through `useSyncExternalStore` rather than mirrored into state, so
 * every consumer re-renders on the same tick and none can hold a stale copy.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (callback) => onlineManager.subscribe(callback),
    () => onlineManager.isOnline(),
    () => true,
  );
}
