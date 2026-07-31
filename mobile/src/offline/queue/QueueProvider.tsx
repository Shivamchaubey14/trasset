/**
 * Keeps the queue moving.
 *
 * Three things wake it, because a queue that only drains when you happen to
 * open the right screen is a queue that loses work:
 *
 *   * **launch** — whatever survived the last run goes out as soon as there is
 *     a network;
 *   * **reconnect** — the signal returning is the event the whole design waits
 *     for;
 *   * **foreground** — coming back to the app is the moment a person expects
 *     their pending change to have landed, and backoff timers do not fire while
 *     the process is suspended.
 *
 * Mounted inside the session gate: draining while signed out would send another
 * user's queued actions under this user's token.
 */
import { onlineManager } from "@tanstack/react-query";
import React, { useEffect } from "react";
import { AppState } from "react-native";
import { useSyncExternalStore } from "react";

import { queue } from ".";
import { pendingCount as countPending } from "./policy";

export function QueueProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;

    const kick = () => {
      if (cancelled) return;
      if (!onlineManager.isOnline()) return;
      void queue.drain();
    };

    void queue.load().then(kick);

    const unsubscribeOnline = onlineManager.subscribe((online) => {
      if (online) kick();
    });

    const appState = AppState.addEventListener("change", (status) => {
      if (status === "active") kick();
    });

    // A slow sweep, so an item whose backoff expired while nothing else
    // happened is not left waiting for an unrelated event to nudge it.
    const timer = setInterval(kick, 30_000);

    return () => {
      cancelled = true;
      unsubscribeOnline();
      appState.remove();
      clearInterval(timer);
    };
  }, []);

  return <>{children}</>;
}

/** How many actions are still waiting — what the offline banner shows. */
export function usePendingCount(): number {
  return useSyncExternalStore(
    (callback) => queue.subscribe(callback),
    () => countPending(queue.getItems()),
    () => 0,
  );
}

/** The whole queue, for the conflict screen. */
export function useQueueItems() {
  return useSyncExternalStore(
    (callback) => queue.subscribe(callback),
    () => queue.getItems(),
    () => queue.getItems(),
  );
}
