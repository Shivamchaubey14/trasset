/**
 * Whether the network can actually carry a request.
 *
 * Pure, and free of platform imports, so the awkward combinations can be
 * checked without a phone or a flight. `online.ts` is the half that talks to
 * the OS.
 */

/** The subset of expo-network's `NetworkState` the decision depends on. */
export type Reachability = {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
};

/**
 * `isConnected` alone is not enough, and that is the classic mistake: a handset
 * joined to a café's captive portal, or to a router whose uplink is down, is
 * connected to *something* and can reach nothing. `isInternetReachable` is the
 * honest signal, so it wins whenever it has an opinion.
 *
 * When it has none — `null` or `undefined`, which is what both platforms report
 * briefly at startup and what Android reports while still probing — the
 * fallback is `isConnected`, and an entirely unknown state is treated as
 * **online**. Guessing offline would be worse: it would suppress the first
 * fetch of every screen behind a banner, whereas guessing online costs only a
 * request that fails and retries.
 */
export function isReachable(state: Reachability): boolean {
  if (state.isInternetReachable === false) return false;
  if (state.isInternetReachable === true) return true;
  return state.isConnected !== false;
}
