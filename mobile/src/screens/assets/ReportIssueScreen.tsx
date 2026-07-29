/**
 * Report an issue (FR-14.14).
 *
 * Raises a maintenance record. The person holding a broken laptop is who
 * notices first, so this is available to them and not just to managers — the
 * backend narrows it to an asset they are actually holding.
 *
 * The form asks two questions and no more. A reporter is standing in front of
 * a fault, not planning work: what kind of problem, and what is wrong. Who
 * fixes it, when, and for how much are a manager's decisions, and the server
 * drops those fields for a non-manager even if they are sent.
 */
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/api";
import { Button, Chip, TextField, useToast } from "@/components";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { fonts, fontSizes, spacing, useTheme } from "@/theme";

/** Mirrors `apps/maintenance/constants.py`. */
const TYPES = [
  { value: "repair", label: "Repair" },
  { value: "preventive", label: "Preventive" },
  { value: "inspection", label: "Inspection" },
  { value: "upgrade", label: "Upgrade" },
] as const;

export function ReportIssueScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const queryClient = useQueryClient();
  const route = useRoute<RouteProp<RootStackParamList, "ReportIssue">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { assetId, assetTag } = route.params;

  const [type, setType] = useState<string>("repair");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const report = useMutation({
    mutationFn: () =>
      api.post("/maintenance/", {
        asset_id: assetId,
        type,
        // Today: the fault exists now. A manager reschedules if the work
        // itself needs booking for later.
        scheduled_date: new Date().toISOString().slice(0, 10),
        notes,
      }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      toast.success("Reported. A manager will pick it up.");
      navigation.goBack();
    },
    onError(err) {
      // 403 here means "not your asset" — the server's sentence says so, and
      // it is more useful than anything invented on this side.
      setError(err instanceof ApiError ? err.message : "Could not report this issue.");
    },
  });

  function submit() {
    if (!notes.trim()) {
      setError("Describe what is wrong — it is the whole point of the report.");
      return;
    }
    setError(null);
    report.mutate();
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.md,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.lead, { color: colors.textMuted }]}>
          Reporting a problem with {assetTag}. A manager will see it and book
          the work.
        </Text>

        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.label, { color: colors.textMuted }]}>KIND OF ISSUE</Text>
          <View style={styles.chips}>
            {TYPES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={type === option.value}
                onPress={() => setType(option.value)}
              />
            ))}
          </View>
        </View>

        <TextField
          label="What is wrong?"
          value={notes}
          onChangeText={(value) => {
            setNotes(value);
            setError(null);
          }}
          error={error}
          placeholder="The screen flickers when the lid is moved."
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: "top" }}
          autoFocus
        />

        <Button label="Report it" onPress={submit} loading={report.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.body, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.5 },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
