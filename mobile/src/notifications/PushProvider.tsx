/**
 * Push lifecycle — the three states a notification can arrive in (FR-14.23).
 *
 * They are genuinely different problems, which is why this is not one listener:
 *
 * * **Foreground.** The app is open and the OS would normally stay silent. The
 *   banner is shown deliberately, because a notification about an asset being
 *   assigned to you matters whether or not you happen to be looking at the app —
 *   but the badge and lists are refreshed too, so the state behind it is not
 *   stale the moment the banner is dismissed.
 * * **Background.** The app is alive but not shown; a tap fires the response
 *   listener and the container is already mounted, so it can navigate at once.
 * * **Cold start.** The tap *launched* the app. There is no listener attached
 *   yet — the event happened before this component existed — so it is read back
 *   with `getLastNotificationResponseAsync`. The navigator may still be
 *   mounting, so the route is held and replayed once the ref is ready. This is
 *   the case the DoD names, and the one that silently does nothing if you rely
 *   on the listener alone.
 *
 * Registration runs at launch with `prompt: false`: it picks up an existing
 * grant without spending iOS's single permission ask, which belongs behind a
 * screen that can explain itself (Day 47's settings).
 */
import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/auth/AuthContext";
import { navigateIfReady } from "@/navigation/ref";

import { registerForPush } from "./push";
import { routeForPayload, type PushPayload, type Route } from "./routing";

/**
 * Show banners while the app is in the foreground.
 *
 * Set at module scope because expo-notifications reads it when a notification
 * arrives, which can be before any component has mounted.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

function payloadOf(response: Notifications.NotificationResponse | null): PushPayload | null {
  const data = response?.notification?.request?.content?.data;
  return (data as PushPayload | undefined) ?? null;
}

export function PushProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = state === "signedIn";

  // A cold-start tap can arrive before the navigator is ready. Holding it here
  // and replaying beats dropping it — the whole point of the deep link is that
  // the tap lands on the record.
  const [pendingRoute, setPendingRoute] = useState<Route | null>(null);
  const handledColdStart = useRef(false);

  const go = useCallback((route: Route) => {
    const delivered =
      route.screen === "Notifications"
        ? navigateIfReady("App", { screen: "Notifications" })
        : navigateIfReady(route.screen, route.params);
    if (!delivered) setPendingRoute(route);
  }, []);

  /** Anything a notification could have invalidated. */
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notificationCount"] });
    // A push almost always means a record moved — an assignment, a decision.
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    queryClient.invalidateQueries({ queryKey: ["requests"] });
    queryClient.invalidateQueries({ queryKey: ["requestStats"] });
  }, [queryClient]);

  // --- registration -------------------------------------------------------
  useEffect(() => {
    if (!signedIn) return;
    // Fire and forget: every outcome is a value, and a failure to register is
    // not a reason to block the app. Day 47's settings screen surfaces the
    // reason, with a button that may prompt.
    registerForPush({ prompt: false }).catch(() => {});
  }, [signedIn]);

  // --- foreground ---------------------------------------------------------
  useEffect(() => {
    if (!signedIn) return;
    const sub = Notifications.addNotificationReceivedListener(() => refresh());
    return () => sub.remove();
  }, [signedIn, refresh]);

  // --- background tap -----------------------------------------------------
  useEffect(() => {
    if (!signedIn) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      go(routeForPayload(payloadOf(response)));
      refresh();
    });
    return () => sub.remove();
  }, [signedIn, go, refresh]);

  // --- cold start ---------------------------------------------------------
  useEffect(() => {
    if (!signedIn || handledColdStart.current) return;

    let cancelled = false;
    (async () => {
      // Returns the tap that launched the app, if that is how it started.
      const response = await Notifications.getLastNotificationResponseAsync();
      if (cancelled || !response) return;
      handledColdStart.current = true;
      go(routeForPayload(payloadOf(response)));
      refresh();
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [signedIn, go, refresh]);

  // --- replay a route the navigator was not ready for ---------------------
  useEffect(() => {
    if (!pendingRoute) return;
    // The navigator mounts a tick or two after this provider on a cold start,
    // so a short poll is enough and avoids threading a readiness callback
    // through NavigationContainer.
    const timer = setInterval(() => {
      const delivered =
        pendingRoute.screen === "Notifications"
          ? navigateIfReady("App", { screen: "Notifications" })
          : navigateIfReady(pendingRoute.screen, pendingRoute.params);
      if (delivered) setPendingRoute(null);
    }, 120);

    // Give up rather than poll for ever — if the navigator has not mounted in
    // three seconds, something is wrong and the app is on its own screen.
    const bail = setTimeout(() => setPendingRoute(null), 3000);

    return () => {
      clearInterval(timer);
      clearTimeout(bail);
    };
  }, [pendingRoute]);

  // Signing out should stop a queued deep link from firing into the next
  // session — it was addressed to whoever was signed in when it arrived.
  useEffect(() => {
    if (!signedIn) {
      setPendingRoute(null);
      handledColdStart.current = false;
    }
  }, [signedIn]);

  return <>{children}</>;
}
