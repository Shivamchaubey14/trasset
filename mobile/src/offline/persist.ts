/**
 * Persisting the query cache.
 *
 * What makes an app usable in a stock room with no signal is not a spinner that
 * waits politely — it is the asset you looked at ten minutes ago still opening.
 * That means the cache has to outlive the process, so it is written to
 * AsyncStorage and rehydrated at launch.
 *
 * Three decisions worth stating, because each has a failure mode:
 *
 * **The cache is purged on sign-out.** It holds one person's assets, requests
 * and notifications. A shared handset that rehydrated the previous user's cache
 * into the next user's session would be a data leak, and a silent one — the
 * screens would look perfectly normal. `purgeCache` is called by `signOut`.
 *
 * **Mutations are never persisted.** Replaying a write from a rehydrated cache
 * would apply it a second time. The durable queue owns replay, because only it
 * holds the idempotency key that makes it safe (BE-4).
 *
 * **The app version busts the cache.** A build whose response shapes changed
 * must not rehydrate yesterday's objects into today's screens; a mismatched
 * buster makes the persister discard rather than restore.
 *
 * Kept out of `src/api/` on purpose: that layer holds no platform imports, so
 * it can be exercised against a real server without a device. This file is the
 * platform half.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import Constants from "expo-constants";

import { CACHE_MAX_AGE, PERSIST_KEY, shouldPersistQuery } from "./policy";

export { CACHE_MAX_AGE, PERSIST_KEY, shouldPersistQuery } from "./policy";

/** A build identifier, so a changed payload shape cannot rehydrate into it. */
export function cacheBuster(): string {
  const version = Constants.expoConfig?.version ?? "0";
  const build = Constants.nativeBuildVersion ?? "dev";
  return `${version}+${build}`;
}

export function createPersister() {
  return createAsyncStoragePersister({
    storage: AsyncStorage,
    key: PERSIST_KEY,
    // Writing on every keystroke of a search box would be wasteful; a second's
    // coalescing is invisible to the user and turns a burst into one write.
    throttleTime: 1000,
  });
}

/**
 * Everything the persister needs, in one object, so `App.tsx` cannot wire up
 * half of it.
 */
export function persistOptions() {
  return {
    persister: createPersister(),
    maxAge: CACHE_MAX_AGE,
    buster: cacheBuster(),
    dehydrateOptions: {
      shouldDehydrateQuery: shouldPersistQuery,
      shouldDehydrateMutation: () => false,
    },
  };
}

/**
 * Drop the cache, in memory and on disk.
 *
 * Both halves matter. Clearing only the in-memory client leaves the previous
 * session's data on disk to be rehydrated at the next launch, which is the leak
 * this exists to prevent.
 */
export async function purgeCache(queryClient: QueryClient): Promise<void> {
  queryClient.clear();
  try {
    await AsyncStorage.removeItem(PERSIST_KEY);
  } catch {
    // A storage failure must not block signing out — the in-memory clear has
    // already happened, and the buster and maxAge bound what a stale file can
    // do if it survives.
  }
}
