/**
 * Bottom tabs — Scan · Assets · Requests · Notifications · Profile (SRS §12.6),
 * with Scan in the centre as the largest target because it is the primary
 * action of the whole app.
 *
 * React Navigation rather than expo-router: SRS §12.2 names it explicitly, and
 * the build plan's Day 36 line saying expo-router contradicts the contract.
 */
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { StyleSheet, View } from "react-native";

import {
  AssetsScreen,
  NotificationsScreen,
  ProfileScreen,
  RequestsScreen,
  ScanScreen,
} from "@/screens";
import { MIN_TARGET, fonts, useTheme } from "@/theme";

export type TabParamList = {
  Scan: undefined;
  Assets: undefined;
  Requests: undefined;
  Notifications: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * Icon sizing.
 *
 * These are *visual* sizes only. The pressable area stays the full tab cell,
 * which is well over the 44pt minimum (SRS §12.6) — so a smaller glyph costs
 * nothing in reachability. Shrinking the touch target would be a different and
 * much worse change.
 */
const ICON_SIZE = 20;
// Comfortably above the 44pt floor: Scan is the primary action of the whole
// app, so it should read as bigger than its neighbours, not merely different.
const SCAN_CIRCLE = 60;
const SCAN_ICON = 28;

/**
 * Filled when active, outlined when not — the convention on both platforms,
 * and a second signal beyond colour, which matters for anyone who cannot rely
 * on the green/grey distinction (NFR-9).
 */
function TabIcon({
  name,
  focused,
  size = ICON_SIZE,
}: {
  name: string;
  focused: boolean;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <Ionicons
      name={(focused ? name : `${name}-outline`) as IoniconName}
      size={size}
      color={focused ? colors.primary : colors.textMuted}
    />
  );
}

/**
 * Scan is the centre and the largest target — one-handed reachability for the
 * action people open the app to perform.
 */
function ScanIcon({ focused }: { focused: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.scanTarget,
        {
          backgroundColor: focused ? colors.primary : colors.surfaceElevated,
          borderColor: colors.bg,
        },
      ]}
    >
      <Ionicons
        name="scan"
        size={SCAN_ICON}
        color={focused ? colors.onPrimary : colors.primary}
      />
    </View>
  );
}

export function AppTabs() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
      }}
    >
      <Tab.Screen
        name="Assets"
        component={AssetsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="cube" focused={focused} />,
          tabBarAccessibilityLabel: "Assets",
        }}
      />
      <Tab.Screen
        name="Requests"
        component={RequestsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="file-tray-full" focused={focused} />
          ),
          tabBarAccessibilityLabel: "Requests",
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          tabBarIcon: ({ focused }) => <ScanIcon focused={focused} />,
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: "Scan an asset",
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="notifications" focused={focused} />
          ),
          // "Notifications" clips to "Notificati…" in a fifth of the width.
          // The *route* keeps its name so `trasset://notifications` and the
          // API vocabulary are untouched; only what the user reads changes.
          // The accessibility label matches the visible one deliberately —
          // a screen reader announcing a different word from the one on
          // screen is its own failure.
          tabBarLabel: "Alerts",
          tabBarAccessibilityLabel: "Alerts",
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="person" focused={focused} />,
          tabBarAccessibilityLabel: "Profile",
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  scanTarget: {
    width: SCAN_CIRCLE,
    height: SCAN_CIRCLE,
    borderRadius: SCAN_CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
    // Lifted just enough to read as raised. Any more and it detaches from the
    // bar and starts to look like a floating action button, which it is not —
    // it is a tab that happens to be the primary one.
    marginTop: -12,
    // Cuts the circle away from the bar edge so the lift is legible.
    borderWidth: 3,
  },
});
