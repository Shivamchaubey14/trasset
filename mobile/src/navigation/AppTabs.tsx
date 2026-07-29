/**
 * Bottom tabs — Scan · Assets · Requests · Notifications · Profile (SRS §12.6),
 * with Scan in the centre as the largest target because it is the primary
 * action of the whole app.
 *
 * React Navigation rather than expo-router: SRS §12.2 names it explicitly, and
 * the build plan's Day 36 line saying expo-router contradicts the contract.
 */
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

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

/**
 * Stand-in for the icon set (expo-symbols / a vector set lands with the design
 * system on Day 39). Kept legible and correctly sized so the tab bar's
 * proportions are real rather than provisional.
 */
function TabGlyph({
  label,
  focused,
  emphasised,
}: {
  label: string;
  focused: boolean;
  emphasised?: boolean;
}) {
  const { colors } = useTheme();
  const tint = focused ? colors.primary : colors.textMuted;

  if (emphasised) {
    // Scan is the centre and the largest target — one-handed reachability for
    // the action people open the app to perform.
    return (
      <View
        style={[
          styles.scanTarget,
          { backgroundColor: focused ? colors.primary : colors.surfaceElevated },
        ]}
      >
        <Text
          style={[
            styles.scanGlyph,
            { color: focused ? colors.onPrimary : colors.primary },
          ]}
        >
          {label}
        </Text>
      </View>
    );
  }

  return <Text style={[styles.glyph, { color: tint }]}>{label}</Text>;
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
          tabBarIcon: ({ focused }) => <TabGlyph label="▦" focused={focused} />,
          tabBarAccessibilityLabel: "Assets",
        }}
      />
      <Tab.Screen
        name="Requests"
        component={RequestsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabGlyph label="✉" focused={focused} />,
          tabBarAccessibilityLabel: "Requests",
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabGlyph label="⌗" focused={focused} emphasised />
          ),
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: "Scan an asset",
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabGlyph label="◔" focused={focused} />,
          tabBarAccessibilityLabel: "Notifications",
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabGlyph label="◍" focused={focused} />,
          tabBarAccessibilityLabel: "Profile",
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  glyph: { fontSize: 20, lineHeight: 24 },
  scanTarget: {
    width: MIN_TARGET + 8,
    height: MIN_TARGET + 8,
    borderRadius: (MIN_TARGET + 8) / 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -18,
  },
  scanGlyph: { fontSize: 24, lineHeight: 28, fontWeight: "700" },
});
