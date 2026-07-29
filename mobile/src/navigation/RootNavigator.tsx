/**
 * Root navigator.
 *
 * The auth stack and the app shell are siblings, so signing out unmounts the
 * whole app tree rather than leaving screens alive behind a login modal.
 *
 * Asset detail deliberately sits *here*, not inside a tab: it is reached from a
 * scan, a search result, an approval and a push deep link, and nesting it in
 * one tab's stack would either duplicate it four times or land deep links in
 * the wrong tab. One route serves every entry point — which is also what
 * `trasset://assets/12` from BE-3 needs.
 */
import {
  NavigationContainer,
  type LinkingOptions,
  type NavigatorScreenParams,
  type Theme as NavTheme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";

import { fonts, useTheme } from "@/theme";

import { AppTabs, type TabParamList } from "./AppTabs";

export type RootStackParamList = {
  App: NavigatorScreenParams<TabParamList>;
  // Arriving in later phases:
  // Auth: undefined;
  // Asset: { id: number };
  // StockTake: { id?: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Deep links, so a tapped push opens the record (FR-14.23). */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["trasset://"],
  config: {
    screens: {
      App: {
        screens: {
          Scan: "scan",
          Assets: "assets",
          Requests: "requests",
          Notifications: "notifications",
          Profile: "profile",
        },
      },
    },
  },
};

export function RootNavigator() {
  const { colors, dark } = useTheme();

  // React Navigation keeps its own theme; feeding it ours stops the navigator
  // chrome from flashing the wrong background on push and on cold start.
  const navTheme: NavTheme = {
    dark,
    colors: {
      primary: colors.primary,
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
    fonts: {
      regular: { fontFamily: fonts.body, fontWeight: "400" },
      medium: { fontFamily: fonts.bodyMedium, fontWeight: "500" },
      bold: { fontFamily: fonts.bodySemi, fontWeight: "600" },
      heavy: { fontFamily: fonts.head, fontWeight: "700" },
    },
  };

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="App" component={AppTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
