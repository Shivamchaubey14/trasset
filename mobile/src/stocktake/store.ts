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
 * Every change is written to disk, so the count survives the process dying.
 * `hydrate()` reads it back at launch, which is what makes an interrupted
 * count resumable rather than an hour of somebody's afternoon thrown away.
 */
import { useSyncExternalStore } from "react";

import { type SessionState, recordScan, undoScan } from "./session";
import type { ScanOutcome } from "./session";
import { loadSession, saveSession } from "./storage";

let active: SessionState | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Persisted without awaiting: a scan must not wait on a disk write. */
function commit(next: SessionState | null) {
  active = next;
  void saveSession(next);
  emit();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession(): SessionState | null {
  return active;
}

export function setSession(session: SessionState | null) {
  commit(session);
}

/**
 * Read any interrupted session back off disk.
 *
 * Safe to call more than once, and it never overwrites a live session — a
 * hydrate racing a freshly started count must not replace the new one with the
 * old.
 */
export async function hydrate(): Promise<SessionState | null> {
  if (hydrated) return active;
  hydrated = true;
  const stored = await loadSession();
  if (stored && !active) {
    active = stored;
    emit();
  }
  return active;
}

/** Only for tests: forget that hydration already happened. */
export function resetForTests() {
  active = null;
  hydrated = false;
}

/**
 * Apply a scan to the active session.
 *
 * Returns the outcome so the caller can buzz or flash without reading state
 * back. A duplicate leaves the object identical **by reference**, so React
 * skips the re-render — and, just as importantly, skips the disk write.
 */
export function scan(tag: string, at: number = Date.now()): ScanOutcome {
  if (!active) return "unknown";
  const result = recordScan(active, tag, at);
  if (result.state !== active) commit(result.state);
  return result.outcome;
}

export function undo(key: string) {
  if (!active) return;
  commit(undoScan(active, key));
}

export function useSession(): SessionState | null {
  return useSyncExternalStore(subscribe, getSession, () => null);
}
