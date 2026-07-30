/**
 * Session state (FR-14.1 – FR-14.5).
 *
 * Four states, because "signed in or not" is not enough on a phone:
 *
 *   starting  — restoring a session; the splash is still up
 *   signedOut — no usable refresh token; show sign-in
 *   locked    — a valid session exists but the app wants a biometric first
 *   signedIn  — usable
 *
 * `locked` is the one a web app has no equivalent of. It exists because a
 * phone is picked up by other people, and because the alternative — signing
 * out whenever the app is backgrounded — would make the offline queue useless.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useQueryClient } from "@tanstack/react-query";

import { api, login as apiLogin, logout as apiLogout, restoreSession, setSessionExpiredHandler, tokens } from "@/api";
import type { User } from "@/api";
import { clearPushToken, currentPushToken } from "@/notifications/push";
import { purgeCache } from "@/offline/persist";

import { isBiometricEnabled, promptBiometric } from "./biometrics";

export type SessionState = "starting" | "signedOut" | "locked" | "signedIn";

interface AuthValue {
  state: SessionState;
  user: User | null;
  /** True once the startup sequence has finished, splash can hide. */
  ready: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  unlock(): Promise<boolean>;
  /** Abandon the biometric gate and sign in with a password instead. */
  forgetSession(): Promise<void>;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>("starting");
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  // --- startup ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const restored = await restoreSession();
        if (cancelled) return;

        if (!restored) {
          setState("signedOut");
          return;
        }

        // A restored session may still need unlocking before it is usable.
        if (await isBiometricEnabled()) {
          setState("locked");
          return;
        }

        // Fetch the profile so the shell can paint with a name rather than a
        // placeholder. A failure here is not a failed session — the tokens are
        // good — so it degrades to signed-in-without-profile.
        try {
          setUser(await api.get<User>("/auth/me/"));
        } catch {
          /* profile can be re-fetched later */
        }
        if (!cancelled) setState("signedIn");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // --- session expiry -----------------------------------------------------
  useEffect(() => {
    setSessionExpiredHandler(() => {
      // Only the tokens are dropped. Nothing else is cleared, so anything the
      // user has queued offline survives to be replayed once they sign back in
      // (Day 49) — losing queued work at the exact moment a token expires
      // would be the worst possible time to lose it.
      setUser(null);
      setState("signedOut");
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email.trim().toLowerCase(), password);
    setUser((data.user as User) ?? null);
    setState("signedIn");
  }, []);

  const signOut = useCallback(async () => {
    // Deregister this handset in the same call that blacklists the refresh
    // token (BE-2), so a signed-out phone stops receiving push immediately
    // rather than at its next launch. Null on a build that never obtained a
    // token, in which case `logout` omits the field — which is the same thing
    // as having nothing to deregister.
    await apiLogout(currentPushToken() ?? undefined);
    clearPushToken();

    // The persisted query cache holds this person's assets, requests and
    // notifications. On a shared handset, rehydrating it into the next
    // session would leak them — and silently, because the screens would look
    // entirely normal. Both halves go: memory and disk.
    await purgeCache(queryClient);

    setUser(null);
    setState("signedOut");
  }, [queryClient]);

  const unlock = useCallback(async () => {
    const ok = await promptBiometric();
    if (!ok) return false;

    try {
      setUser(await api.get<User>("/auth/me/"));
    } catch {
      /* offline — the session is still valid */
    }
    setState("signedIn");
    return true;
  }, []);

  const forgetSession = useCallback(async () => {
    // The password route out of a biometric that will not cooperate. Clearing
    // the tokens is what makes the sign-in screen meaningful.
    await tokens.clear();
    // Abandoning the session deliberately, so the cache goes with it — the
    // person at the sign-in screen may not be the person who left it.
    await purgeCache(queryClient);
    setUser(null);
    setState("signedOut");
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await api.get<User>("/auth/me/"));
    } catch {
      /* leave the cached profile in place */
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ state, user, ready, signIn, signOut, unlock, forgetSession, refreshUser }),
    [state, user, ready, signIn, signOut, unlock, forgetSession, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
