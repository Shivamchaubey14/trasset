/**
 * A navigation ref, so code outside the component tree can route.
 *
 * A tapped push is handled by a listener that is not a screen and has no
 * `useNavigation` to call — including the cold-start case, where the tap is
 * read back *before* any screen has mounted. React Navigation's `linking`
 * config covers URL deep links, but a push carries a `data` payload rather
 * than a URL, so the target is resolved from that payload and navigated here.
 *
 * `navigate` is deliberately guarded: `isReady()` is false during a cold start
 * until the container mounts, and calling through before then throws. Callers
 * that need to act on a tap from a cold start should hold the payload and
 * replay it once the container is ready — see `PushProvider`.
 */
import { createNavigationContainerRef } from "@react-navigation/native";

import type { RootStackParamList } from "./RootNavigator";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** True once the container has mounted and can accept navigation. */
export function navigationIsReady(): boolean {
  return navigationRef.isReady();
}

/**
 * Navigate if the container is ready; report whether it happened.
 *
 * Returns false rather than throwing so a caller can queue and retry — losing
 * the tap silently would mean a push that opens the app to the wrong place.
 */
export function navigateIfReady<Name extends keyof RootStackParamList>(
  name: Name,
  params: RootStackParamList[Name],
): boolean {
  if (!navigationRef.isReady()) return false;
  // The overload the ref exposes is awkward to satisfy generically; the pair is
  // checked at every call site by `RootStackParamList`, which is where a wrong
  // route or param actually gets caught.
  (navigationRef.navigate as (n: Name, p: RootStackParamList[Name]) => void)(name, params);
  return true;
}
