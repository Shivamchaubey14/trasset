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
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { RootNavigator } from "@/navigation/RootNavigator";
import { ThemeProvider, useTheme } from "@/theme";

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
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
