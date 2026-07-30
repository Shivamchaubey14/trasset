/**
 * Theme provider and hook.
 *
 * Dark mode is wired from the very first screen rather than retrofitted —
 * SRS §12.6 is explicit that retrofitting costs far more, and every component
 * written before it exists is a component that has to be revisited.
 *
 * The in-app override sits on top of that, reusing the `scheme` prop the
 * component gallery already needed. Two responsibilities live here and are kept
 * distinct: the **root** provider owns the persisted preference, while a
 * **nested** one given an explicit `scheme` only forces colours and inherits
 * that preference untouched.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";

import {
  DEFAULT_THEME_PREFERENCE,
  type ThemePreference,
  resolveScheme,
} from "./preference";
import { loadThemePreference, saveThemePreference } from "./preferenceStore";
import {
  Colors,
  StatusColors,
  darkColors,
  darkRequestStatusColors,
  darkSeries,
  darkStatusColors,
  lightColors,
  lightRequestStatusColors,
  lightSeries,
  lightStatusColors,
} from "./tokens";

/** Asset and request statuses share one map; their key sets are disjoint. */
const lightStatuses: StatusColors = {
  ...lightStatusColors,
  ...lightRequestStatusColors,
};
const darkStatuses: StatusColors = {
  ...darkStatusColors,
  ...darkRequestStatusColors,
};

export * from "./preference";
export * from "./tokens";

type Theme = {
  dark: boolean;
  colors: Colors;
  status: StatusColors;
  series: readonly string[];
  /** What the user chose — `system` unless they have said otherwise. */
  preference: ThemePreference;
  /** Applies immediately, then persists. See `saveThemePreference`. */
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<Theme>({
  dark: false,
  colors: lightColors,
  status: lightStatuses,
  series: lightSeries,
  preference: DEFAULT_THEME_PREFERENCE,
  setPreference: () => {},
});

export function ThemeProvider({
  children,
  scheme: forced,
}: {
  children: React.ReactNode;
  /**
   * Force a scheme instead of resolving one.
   *
   * Used by the component gallery to render both themes on one screen. A
   * provider given this prop is a *nested* one: it neither reads nor writes the
   * stored preference, so a control rendered inside it still writes to the
   * single root.
   */
  scheme?: "light" | "dark";
}) {
  const inherited = useContext(ThemeContext);
  const systemScheme = useColorScheme();

  // Whether this instance owns the preference. Fixed for an instance's
  // lifetime — the gallery never stops forcing and the root never starts — so
  // the hooks below keep a stable order.
  const isRoot = forced === undefined;

  // `null` means "not read yet", which is deliberately distinct from
  // "system": rendering the OS scheme and correcting it a frame later is the
  // flash this exists to avoid.
  const [stored, setStored] = useState<ThemePreference | null>(null);

  useEffect(() => {
    if (!isRoot) return;
    let alive = true;
    void loadThemePreference().then((value) => {
      if (alive) setStored(value);
    });
    return () => {
      alive = false;
    };
  }, [isRoot]);

  const setPreferenceHere = useCallback((next: ThemePreference) => {
    // State first: the write is a background detail, and someone watching the
    // screen should not wait on the Keystore to see the colours change.
    setStored(next);
    void saveThemePreference(next);
  }, []);

  const preference = isRoot ? stored ?? DEFAULT_THEME_PREFERENCE : inherited.preference;
  const setPreference = isRoot ? setPreferenceHere : inherited.setPreference;

  const dark = forced
    ? forced === "dark"
    : resolveScheme(preference, systemScheme) === "dark";

  const value = useMemo<Theme>(
    () => ({
      dark,
      colors: dark ? darkColors : lightColors,
      status: dark ? darkStatuses : lightStatuses,
      series: dark ? darkSeries : lightSeries,
      preference,
      setPreference,
    }),
    [dark, preference, setPreference],
  );

  // Held until the stored preference is known. The splash is still up here
  // (App.tsx prevents auto-hide), so this is invisible rather than a blank
  // frame — and it is what stops a dark-mode user seeing a white flash on
  // every cold start.
  if (isRoot && stored === null) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
