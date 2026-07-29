/**
 * Token storage (FR-14.2).
 *
 * The access token lives in memory only — it is short-lived and re-obtainable,
 * so persisting it buys nothing and widens the window an extracted one is
 * useful for. The refresh token goes to the platform secure store (Keychain on
 * iOS, Keystore on Android), **never** AsyncStorage: AsyncStorage is a plain
 * file, readable on a rooted or jailbroken device and by anything with backup
 * access.
 *
 * This differs from the web client, which has no equivalent of a Keychain and
 * therefore accepts localStorage as a documented trade-off. On a phone there is
 * a better option, so the trade-off is not inherited.
 *
 * The store is injectable so the request layer can be exercised off-device.
 */
export interface SecureStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const REFRESH_KEY = "trasset.refresh";

let accessToken: string | null = null;
let store: SecureStore | null = null;

/** Called once at startup, and by tests with a fake. */
export function configureTokenStore(secureStore: SecureStore) {
  store = secureStore;
}

function requireStore(): SecureStore {
  if (!store) {
    throw new Error(
      "Token store not configured — call configureTokenStore() before using the API.",
    );
  }
  return store;
}

export const tokens = {
  getAccess(): string | null {
    return accessToken;
  },

  async getRefresh(): Promise<string | null> {
    try {
      return await requireStore().getItemAsync(REFRESH_KEY);
    } catch {
      // A locked or unavailable Keychain must not crash the app; it just means
      // there is no session to restore.
      return null;
    }
  },

  async set(access: string | null, refresh?: string | null): Promise<void> {
    accessToken = access ?? null;
    if (refresh) {
      try {
        await requireStore().setItemAsync(REFRESH_KEY, refresh);
      } catch {
        // Session survives until the app is closed rather than failing outright.
      }
    }
  },

  async clear(): Promise<void> {
    accessToken = null;
    try {
      await requireStore().deleteItemAsync(REFRESH_KEY);
    } catch {
      /* nothing to clear */
    }
  },

  async isAuthenticated(): Promise<boolean> {
    return Boolean(accessToken || (await tokens.getRefresh()));
  },
};
