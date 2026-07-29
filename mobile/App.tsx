/**
 * Trasset mobile — app entry.
 *
 * Fonts are bundled rather than fetched: a mobile app cannot reach Google
 * Fonts the way the web app does, and rendering before they load shows a frame
 * of system font that then visibly reflows.
 */
import {
  Lexend_400Regular,
  Lexend_500Medium,
  Lexend_600SemiBold,
  useFonts,
} from "@expo-google-fonts/lexend";
import {
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from "@expo-google-fonts/quicksand";
import { QueryClientProvider } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { configureApi, configureTokenStore, createQueryClient } from "@/api";
import { env } from "@/config/env";
import { RootNavigator } from "@/navigation/RootNavigator";
import { ThemeProvider, useTheme } from "@/theme";

// The API layer holds no platform imports of its own, so the two things it
// needs from the platform are injected once, here:
//   * where the server is — derived from the packager host in development;
//   * where the refresh token lives — Keychain / Keystore, never AsyncStorage
//     (FR-14.2).
// Keeping it this way is also what lets the request layer be exercised against
// a real server without a device.
configureApi({ baseUrl: env.apiUrl, client: env.client });
configureTokenStore(SecureStore);

function Shell() {
  const { colors, dark } = useTheme();

  const [fontsLoaded] = useFonts({
    Quicksand_600SemiBold,
    Quicksand_700Bold,
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
  });

  if (!fontsLoaded) {
    // Day 38 replaces this with the splash held until the session resolves.
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  // One client for the app's lifetime — recreating it on render would throw
  // the cache away, which is what Day 48's offline reads depend on.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Shell />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
