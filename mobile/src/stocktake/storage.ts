/**
 * Keeping a count alive across a force-quit.
 *
 * A stock take is an hour of somebody's afternoon walking a room. Losing it to
 * a low-memory kill, a dropped phone or a battery dying is not a degraded
 * experience — it is the whole job again, and the second count will not match
 * the first. So the session is written on every scan.
 *
 * Written on *every* scan rather than throttled, deliberately. The saving is a
 * few milliseconds against an event that happens once a second at most, and the
 * cost of getting it wrong is the one thing this file exists to prevent.
 *
 * `decodeSession` is pure and exported so the awkward cases — a truncated
 * write, a session from an older build — can be exercised directly.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ExpectedAsset, Scan, SessionState } from "./session";

export const SESSION_KEY = "trasset.stocktake.session";
export const SESSION_VERSION = 1 as const;

type Persisted = {
  version: number;
  session: SessionState;
};

export function encodeSession(session: SessionState): string {
  return JSON.stringify({ version: SESSION_VERSION, session } satisfies Persisted);
}

function looksLikeSession(value: unknown): value is SessionState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<SessionState>;
  return (
    typeof s.stockTakeId === "number" &&
    typeof s.locationId === "number" &&
    typeof s.locationName === "string" &&
    typeof s.expected === "object" &&
    s.expected !== null &&
    Array.isArray(s.scans)
  );
}

/**
 * Read a session back, or null.
 *
 * A session from a version this build does not understand is **discarded**,
 * which is the opposite of the rule the mutation queue follows — and the
 * difference is deliberate. A queued mutation is an action the user believes
 * they performed, so it must survive to be shown. A half-finished count is not
 * a promise to anyone: it has been submitted to nothing, and resuming it with
 * fields this build cannot read would produce a *wrong* count, which is worse
 * than an honest recount.
 */
export function decodeSession(raw: string | null | undefined): SessionState | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // a write cut short by the process dying
  }

  const envelope = parsed as Partial<Persisted>;
  if (envelope.version !== SESSION_VERSION) return null;
  if (!looksLikeSession(envelope.session)) return null;

  const session = envelope.session;
  return {
    ...session,
    // Defensive: these two carry the count, and a malformed one would show a
    // tally that is quietly wrong rather than obviously broken.
    expected: (session.expected ?? {}) as Record<string, ExpectedAsset>,
    scans: (session.scans ?? []).filter(
      (scan): scan is Scan => typeof scan?.key === "string" && typeof scan?.tag === "string",
    ),
  };
}

export async function saveSession(session: SessionState | null): Promise<void> {
  try {
    if (session) await AsyncStorage.setItem(SESSION_KEY, encodeSession(session));
    else await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing useful to do mid-count. The session is still correct in memory,
    // so the person can finish and submit; only a crash would now lose it.
  }
}

export async function loadSession(): Promise<SessionState | null> {
  try {
    return decodeSession(await AsyncStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    /* already gone from memory; nothing further to do */
  }
}
