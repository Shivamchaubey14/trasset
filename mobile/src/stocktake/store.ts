/**
 * The one active counting session.
 *
 * Held in a module store rather than passed through navigation params, for two
 * reasons. A location's expected list can run to hundreds of assets and
 * navigation params are not the place for it; and the scan screen has to keep
 * the session alive across a navigation away and back — walking to a shelf,
 * opening an asset to check it, and coming back must not lose the count.
 *
 * Only one session at a time, deliberately. Two open counts on one phone would
 * be two tallies of the same room with no way to tell which is right.
 *
 * Persistence is not here yet; a force-quit still loses the session. That is
 * the next day's work, and the state is a plain serialisable object precisely
 * so it can be stored without reshaping.
 */
import { useSyncExternalStore } from "react";

import { type SessionState, recordScan, undoScan } from "./session";
import type { ScanOutcome } from "./session";

let active: SessionState | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession(): SessionState | null {
  return active;
}

export function setSession(session: SessionState | null) {
  active = session;
  emit();
}

/**
 * Apply a scan to the active session.
 *
 * Returns the outcome so the caller can buzz or flash without reading state
 * back. A duplicate leaves the object identical **by reference**, so React
 * skips the re-render — which matters when a camera is reading the same label
 * twenty times a second.
 */
export function scan(tag: string, at: number = Date.now()): ScanOutcome {
  if (!active) return "unknown";
  const result = recordScan(active, tag, at);
  if (result.state !== active) {
    active = result.state;
    emit();
  }
  return result.outcome;
}

export function undo(key: string) {
  if (!active) return;
  active = undoScan(active, key);
  emit();
}

export function useSession(): SessionState | null {
  return useSyncExternalStore(subscribe, getSession, () => null);
}
