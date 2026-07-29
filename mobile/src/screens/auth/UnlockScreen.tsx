/**
 * Biometric unlock (FR-14.4).
 *
 * Reached only when a valid session exists *and* the user has turned this on.
 * The escape hatch is deliberately prominent: a biometric that will not
 * cooperate must never be a dead end, so "Use password instead" is always
 * offered rather than hidden behind a failure count.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/auth/AuthContext";
import { type BiometricKind, biometricKind, biometricLabel } from "@/auth/biometrics";
import { Button } from "@/components/Button";
import { fonts, fontSizes, spacing, useTheme } from "@/theme";

const ICONS: Record<BiometricKind, React.ComponentProps<typeof Ionicons>["name"]> = {
  face: "scan-circle-outline",
  fingerprint: "finger-print-outline",
  iris: "eye-outline",
  none: "lock-closed-outline",
};

export function UnlockScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { unlock, forgetSession, user } = useAuth();

  const [kind, setKind] = useState<BiometricKind>("none");
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const attempt = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await unlock();
      // A cancel is a decision, not an error. Stop re-prompting and let them
      // choose; prompting again immediately is how apps become unusable.
      if (!ok) setDismissed(true);
    } finally {
      setBusy(false);
    }
  }, [unlock]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const detected = await biometricKind();
      if (cancelled) return;
      setKind(detected);

      if (detected === "none") {
        // Enrolment was removed since they opted in — the gate cannot be
        // satisfied, so do not strand them behind it.
        setDismissed(true);
        return;
      }
      attempt();
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const label = biometricLabel(kind);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.middle}>
        <Ionicons name={ICONS[kind]} size={64} color={colors.primary} />

        <Text style={[styles.title, { color: colors.text }]}>
          {user?.full_name ? `Welcome back, ${user.full_name.split(" ")[0]}` : "Welcome back"}
        </Text>

        <Text style={[styles.body, { color: colors.textMuted }]}>
          {kind === "none"
            ? "Biometric unlock is no longer available on this device."
            : `Unlock Trasset with ${label}.`}
        </Text>
      </View>

      <View style={styles.actions}>
        {kind !== "none" ? (
          <Button
            label={dismissed ? `Try ${label} again` : "Unlock"}
            onPress={attempt}
            loading={busy}
          />
        ) : null}

        <Button label="Use password instead" variant="secondary" onPress={forgetSession} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: "space-between" },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  title: { fontFamily: fonts.head, fontSize: fontSizes.h2, textAlign: "center" },
  body: { fontFamily: fonts.body, fontSize: fontSizes.body, textAlign: "center" },
  actions: { gap: spacing.sm, paddingBottom: spacing.lg },
});
