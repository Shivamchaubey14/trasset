/**
 * Theme provider and hook.
 *
 * Dark mode is wired from the very first screen rather than retrofitted —
 * SRS §12.6 is explicit that retrofitting costs far more, and every component
 * written before it exists is a component that has to be revisited.
 */
import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

import {
  Colors,
  StatusColors,
  darkColors,
  darkSeries,
  darkStatusColors,
  lightColors,
  lightSeries,
  lightStatusColors,
} from "./tokens";

export * from "./tokens";

type Theme = {
  dark: boolean;
  colors: Colors;
  status: StatusColors;
  series: readonly string[];
};

const ThemeContext = createContext<Theme>({
  dark: false,
  colors: lightColors,
  status: lightStatusColors,
  series: lightSeries,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Follows the OS setting. An in-app override lands with the settings screen
  // (Day 47); until then the system is the single source of truth.
  const scheme = useColorScheme();
  const dark = scheme === "dark";

  const value = useMemo<Theme>(
    () => ({
      dark,
      colors: dark ? darkColors : lightColors,
      status: dark ? darkStatusColors : lightStatusColors,
      series: dark ? darkSeries : lightSeries,
    }),
    [dark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
