/**
 * Manual entry (FR-14.8).
 *
 * Labels get scuffed, painted over and torn off, and a scanner with no
 * fallback is a dead end in exactly the situation the app exists for. This
 * accepts the same inputs the camera produces — a tag or a serial — and goes
 * through the same resolver, so there is one code path and one set of answers.
 */
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextField } from "@/components";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { isScannable } from "@/scan/parse";
import { resolveScan } from "@/scan/resolve";
import { fonts, fontSizes, spacing, useTheme } from "@/theme";

export function ManualEntryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = value.trim();
    if (!isScannable(trimmed)) {
      setError("Enter an asset tag or serial number.");
      return;
    }

    setError(null);
    setBusy(true);
    const result = await resolveScan(trimmed);
    setBusy(false);

    switch (result.status) {
      case "found":
        // Replace, so Back returns to the camera rather than to this form —
        // nobody wants to retype what they just found.
        navigation.replace("Asset", { id: result.asset.id, asset: result.asset });
        return;
      case "notFound":
        setError("Nothing in Trasset matches that tag or serial.");
        return;
      case "ambiguous":
        setError(`${result.count} assets share that serial number. Search for it instead.`);
        return;
      case "error":
        setError(result.message);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.text }]}>Enter by hand</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Type the asset tag from the label, or the manufacturer&apos;s serial
          number from the case.
        </Text>

        <TextField
          label="Asset tag or serial"
          value={value}
          onChangeText={(next) => {
            setValue(next);
            setError(null);
          }}
          error={error}
          placeholder="TRA-2026-000001"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={submit}
          editable={!busy}
        />

        <Button label="Find asset" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.head, fontSize: fontSizes.h2 },
  body: { fontFamily: fonts.body, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.5 },
});
