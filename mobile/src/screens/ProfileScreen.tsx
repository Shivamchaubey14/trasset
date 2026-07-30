/**
 * Profile and settings.
 *
 * The parts the session depends on came first — who is signed in, whether
 * biometric unlock is on, and a way out. The rest follows here: appearance,
 * notification preferences, a password change and an about screen.
 *
 * Two kinds of preference live on this screen and they behave differently, on
 * purpose:
 *
 *   * **Appearance** is device-local. Theme belongs to the screen you are
 *     looking at, not to the account, so it never touches the server.
 *   * **Notifications** are account-wide and go straight to `PATCH /auth/me/`,
 *     so the account, not the handset, is what changes. They are applied
 *     optimistically and rolled back if the server refuses — a switch
 *     that sits in the wrong position after a failure is worse than one that
 *     moves back and says why.
 *
 * Turning push *on* is also the one place the app may spend iOS's single
 * permission prompt, which is why `registerForPush({ prompt: true })` is called
 * here and nowhere else, and why the outcome gets a sentence of its own rather
 * than being collapsed into "failed".
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { RootStackParamList } from "@/navigation/RootNavigator";

import { ApiError, api } from "@/api";
import type { User } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import {
  type BiometricKind,
  biometricKind,
  biometricLabel,
  isBiometricEnabled,
  promptBiometric,
  setBiometricEnabled,
} from "@/auth/biometrics";
import { Button, SegmentedControl, type SegmentedOption, useToast } from "@/components";
import { explainOutcome, registerForPush } from "@/notifications/push";
import {
  THEME_PREFERENCES,
  THEME_PREFERENCE_LABELS,
  type ThemePreference,
  fonts,
  fontSizes,
  radius,
  spacing,
  useTheme,
} from "@/theme";

const THEME_OPTIONS: readonly SegmentedOption<ThemePreference>[] =
  THEME_PREFERENCES.map((value) => ({
    value,
    label: THEME_PREFERENCE_LABELS[value],
    // "Light" and "Dark" on their own are ambiguous read aloud.
    accessibilityLabel:
      value === "system"
        ? "Follow the device setting"
        : `${THEME_PREFERENCE_LABELS[value]} theme`,
  }));

/** The two account-wide notification flags, as the server names them. */
type NotificationField = "email_notifications" | "push_notifications";

export function ProfileScreen() {
  const { colors, dark, preference, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, signOut, refreshUser } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [kind, setKind] = useState<BiometricKind>("none");
  const [biometricOn, setBiometricOn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Mirrors of the server's flags, so a switch moves under the finger rather
  // than after a round trip. Seeded from the profile and re-seeded whenever it
  // changes underneath us.
  const [emailOn, setEmailOn] = useState(user?.email_notifications ?? true);
  const [pushOn, setPushOn] = useState(user?.push_notifications ?? true);
  const [saving, setSaving] = useState<NotificationField | null>(null);
  const [pushNote, setPushNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setKind(await biometricKind());
      setBiometricOn(await isBiometricEnabled());
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    setEmailOn(user.email_notifications ?? true);
    setPushOn(user.push_notifications ?? true);
  }, [user]);

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

  /**
   * Push the flag and keep the switch honest about what the server holds.
   *
   * The optimistic value is applied by the caller; this reverts it on failure
   * rather than leaving a switch that lies about the account.
   */
  const saveFlag = useCallback(
    async (field: NotificationField, value: boolean, revert: (previous: boolean) => void) => {
      setSaving(field);
      try {
        await api.patch<User>("/auth/me/", { [field]: value });
        // Re-read rather than trust the echo: the profile is what every other
        // screen renders from, and it should not drift from this one.
        await refreshUser();
      } catch (error) {
        revert(!value);
        toast.error(
          error instanceof ApiError && error.isNetworkError
            ? "You are offline — that preference was not saved."
            : "Could not save that preference.",
        );
      } finally {
        setSaving(null);
      }
    },
    [refreshUser, toast],
  );

  const toggleEmail = useCallback(
    (next: boolean) => {
      setEmailOn(next);
      void saveFlag("email_notifications", next, setEmailOn);
    },
    [saveFlag],
  );

  const togglePush = useCallback(
    async (next: boolean) => {
      setPushOn(next);
      setPushNote(null);

      // Switching on is the moment the user has said what push is for, so it
      // is the moment the OS may be asked. Switching off never prompts.
      if (next) {
        const outcome = await registerForPush({ prompt: true });
        setPushNote(explainOutcome(outcome));
        if (outcome.status !== "registered") {
          // The account flag is still worth setting — the user asked for push,
          // and another handset of theirs may well be able to receive it. What
          // failed is *this* device, and the note says which reason.
          toast.show("Saved, but this device cannot receive push yet.");
        }
      }

      void saveFlag("push_notifications", next, setPushOn);
    },
    [saveFlag, toast],
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

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: spacing.md,
        paddingTop: insets.top + spacing.md,
        paddingBottom: insets.bottom + spacing.xl,
        gap: spacing.md,
      }}
    >
      <View style={[...card, styles.row]}>
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

      {/* --- Appearance: device-local, never sent anywhere ----------------- */}
      <View style={[...card, styles.stack]}>
        <View style={styles.stackHeader}>
          <Ionicons
            name={dark ? "moon-outline" : "sunny-outline"}
            size={22}
            color={colors.primary}
          />
          <Text style={[styles.rowTitle, { color: colors.text }]}>Appearance</Text>
        </View>
        <SegmentedControl
          options={THEME_OPTIONS}
          value={preference}
          onChange={setPreference}
          accessibilityLabel="Appearance"
        />
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {preference === "system"
            ? `Following your device setting — currently ${dark ? "dark" : "light"}.`
            : `Always ${preference}, whatever this device is set to.`}
        </Text>
      </View>

      {/* --- Notifications: account-wide, straight to the server ----------- */}
      <View style={[...card, styles.stack]}>
        <View style={styles.stackHeader}>
          <Ionicons name="notifications-outline" size={22} color={colors.primary} />
          <Text style={[styles.rowTitle, { color: colors.text }]}>Notifications</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.identity}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Email</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              Assignments, approvals and warranty reminders.
            </Text>
          </View>
          <Switch
            value={emailOn}
            onValueChange={toggleEmail}
            disabled={saving === "email_notifications"}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Email notifications"
          />
        </View>

        <View style={[styles.settingRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm }]}>
          <View style={styles.identity}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Push</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              On this phone, as things happen.
            </Text>
          </View>
          <Switch
            value={pushOn}
            onValueChange={togglePush}
            disabled={saving === "push_notifications"}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Push notifications"
          />
        </View>

        {pushNote ? (
          <Text style={[styles.note, { color: colors.textMuted, backgroundColor: colors.surfaceElevated }]}>
            {pushNote}
          </Text>
        ) : null}
      </View>

      {/* --- Security ----------------------------------------------------- */}
      <View style={[...card, styles.stack]}>
        <View style={styles.stackHeader}>
          <Ionicons name="lock-closed-outline" size={22} color={colors.primary} />
          <Text style={[styles.rowTitle, { color: colors.text }]}>Security</Text>
        </View>

        {kind !== "none" ? (
          <View style={styles.settingRow}>
            <View style={styles.identity}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
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

        <NavRow
          label="Change password"
          onPress={() => navigation.navigate("ChangePassword")}
          topBorder={kind !== "none"}
        />
      </View>

      {/* --- About -------------------------------------------------------- */}
      <View style={[...card, styles.stack]}>
        <NavRow label="About Trasset" onPress={() => navigation.navigate("About")} />
      </View>

      {__DEV__ ? (
        <Button
          label="Component gallery"
          variant="ghost"
          onPress={() => navigation.navigate("Gallery")}
        />
      ) : null}

      <Button
        label="Sign out"
        variant="secondary"
        onPress={confirmSignOut}
        loading={signingOut}
      />
    </ScrollView>
  );
}

/** A row that goes somewhere — label, chevron, whole row is the target. */
function NavRow({
  label,
  onPress,
  topBorder,
}: {
  label: string;
  onPress: () => void;
  topBorder?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.settingRow,
        styles.navRow,
        topBorder
          ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }
          : null,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
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
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "center" },
  // A card whose contents stack rather than sitting in a row — the appearance
  // control and the setting rows need the full width.
  stack: { flexDirection: "column", alignItems: "stretch", gap: spacing.sm },
  stackHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 44,
  },
  navRow: { justifyContent: "space-between" },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: fonts.head, fontSize: fontSizes.h3 },
  identity: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.head, fontSize: fontSizes.h3 },
  rowTitle: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
  settingLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.body },
  meta: { fontFamily: fonts.body, fontSize: fontSizes.small },
  note: {
    fontFamily: fonts.body,
    fontSize: fontSizes.small,
    lineHeight: 19,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 11, textTransform: "capitalize" },
});
