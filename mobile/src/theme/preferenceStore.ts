/**
 * Where the theme preference is kept.
 *
 * SecureStore rather than a plain key-value store, matching `biometrics.ts`:
 * the preference is not a secret, but this is the one storage dependency the
 * app already has, and adding a second for a single string would not pay for
 * itself. When the offline query cache brings AsyncStorage in, this can move
 * there if it ever grows.
 */
import * as SecureStore from "expo-secure-store";

import {
  DEFAULT_THEME_PREFERENCE,
  type ThemePreference,
  isThemePreference,
} from "./preference";

const KEY = "trasset.theme";

/** Never throws and never returns junk — an unreadable store means "system". */
export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export async function saveThemePreference(
  preference: ThemePreference,
): Promise<void> {
  try {
    // "system" is stored as the absence of a value rather than as the string,
    // so anyone who never chose still follows a future change of default.
    if (preference === DEFAULT_THEME_PREFERENCE) {
      await SecureStore.deleteItemAsync(KEY);
    } else {
      await SecureStore.setItemAsync(KEY, preference);
    }
  } catch {
    // As with the biometric flag: failing to persist a preference must not
    // break the thing the preference is about. The choice still applies to
    // this run — it just will not survive a restart.
  }
}
