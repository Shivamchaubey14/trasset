/**
 * Profile (Day 47 builds this out).
 *
 * Day 38 needs the parts the session depends on: who is signed in, whether
 * biometric unlock is on, and a way out. The rest — password change,
 * notification preferences, theme override, the offline queue — lands later.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthContext";
import {
  type BiometricKind,
  biometricKind,
  biometricLabel,
  isBiometricEnabled,
  promptBiometric,
  setBiometricEnabled,
} from "@/auth/biometrics";
import { Button } from "@/components/Button";
import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

export function ProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const [kind, setKind] = useState<BiometricKind>("none");
  const [biometricOn, setBiometricOn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    (async () => {
      setKind(await biometricKind());
      setBiometricOn(await isBiometricEnabled());
    })();
  }, []);

  const toggleBiometric = useCallback(
    async (next: boolean) => {
      // Turning it *on* is confirmed with the biometric itself. Enabling a
      // lock the user cannot then open would be the worst outcome here.
      if (next && !(await promptBiometric("Confirm to enable unlock"))) return;
      setBiometricOn(next);
      await setBiometricEnabled(next);
    },
    [],
  );

  const confirmSignOut = useCallback(() => {
    Alert.alert(
      "Sign out?",
      "You will need your password to sign back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            setSigningOut(true);
            try {
              // Disabling the biometric flag matters: leaving it set would
              // send the next person to an unlock screen with no session
              // behind it.
              await setBiometricEnabled(false);
              await signOut();
            } finally {
              setSigningOut(false);
            }
          },
        },
      ],
    );
  }, [signOut]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: spacing.md,
        paddingTop: insets.top + spacing.md,
        gap: spacing.md,
      }}
    >
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={[styles.initials, { color: colors.onPrimary }]}>
            {initialsOf(user?.full_name)}
          </Text>
        </View>
        <View style={styles.identity}>
          <Text style={[styles.name, { color: colors.text }]}>
            {user?.full_name ?? "Signed in"}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>{user?.email ?? ""}</Text>
          {user?.role_name ? (
            <View style={[styles.pill, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[styles.pillText, { color: colors.textMuted }]}>
                {String(user.role_name).replace(/_/g, " ")}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {kind !== "none" ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="finger-print-outline" size={22} color={colors.primary} />
          <View style={styles.identity}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              Unlock with {biometricLabel(kind)}
            </Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              Your password still works if it fails.
            </Text>
          </View>
          <Switch
            value={biometricOn}
            onValueChange={toggleBiometric}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel={`Unlock with ${biometricLabel(kind)}`}
          />
        </View>
      ) : null}

      <Button
        label="Sign out"
        variant="secondary"
        onPress={confirmSignOut}
        loading={signingOut}
      />

      <Text style={[styles.footnote, { color: colors.textMuted }]}>
        Password changes, notification preferences and the offline queue arrive
        with Day 47.
      </Text>
    </ScrollView>
  );
}

function initialsOf(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: fonts.head, fontSize: fontSizes.h3 },
  identity: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.head, fontSize: fontSizes.h3 },
  rowTitle: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
  meta: { fontFamily: fonts.body, fontSize: fontSizes.small },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 11, textTransform: "capitalize" },
  footnote: { fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: 20 },
});
