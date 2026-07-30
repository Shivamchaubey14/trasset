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
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { configureApi, configureTokenStore, createQueryClient } from "@/api";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { ToastProvider } from "@/components";
import { env } from "@/config/env";
import { RootNavigator } from "@/navigation/RootNavigator";
import { PushProvider } from "@/notifications/PushProvider";
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

// Held until fonts *and* the session have resolved. Without this the app shows
// a frame of the sign-in screen before the restored session lands — which
// reads, wrongly, as having been signed out.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden, or unsupported — not worth failing startup over */
});

function Shell() {
  const { dark } = useTheme();
  const { ready } = useAuth();

  const [fontsLoaded] = useFonts({
    Quicksand_600SemiBold,
    Quicksand_700Bold,
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
  });

  const onLayout = useCallback(() => {
    if (fontsLoaded && ready) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, ready]);

  // Nothing is rendered until both are settled, so the splash stays up rather
  // than flashing an empty shell.
  if (!fontsLoaded || !ready) return null;

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <StatusBar style={dark ? "light" : "dark"} />
      {/*
        Inside the gate rather than outside it: PushProvider reads a cold-start
        tap on mount, and mounting it before the session has resolved would have
        it decide there is nobody signed in and drop the deep link.
      */}
      <PushProvider>
        <RootNavigator />
      </PushProvider>
    </View>
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
          {/*
            Above AuthProvider so a session-expiry message can still be shown
            while the app is unwinding to the sign-in screen.
          */}
          <ToastProvider>
            <AuthProvider>
              <Shell />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
