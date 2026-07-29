/**
 * Empty state.
 *
 * Every list needs one, and "empty" is not one condition but three: nothing
 * exists yet, nothing matched a filter, or the request failed. They need
 * different words and different actions — a "Clear filters" button on a screen
 * that failed to load is worse than useless.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts, fontSizes, spacing, useTheme } from "@/theme";

import { Button } from "./Button";

type Tone = "neutral" | "error" | "offline";

const ICONS: Record<Tone, React.ComponentProps<typeof Ionicons>["name"]> = {
  neutral: "file-tray-outline",
  error: "alert-circle-outline",
  offline: "cloud-offline-outline",
};

export function EmptyState({
  title,
  message,
  tone = "neutral",
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  message?: string;
  tone?: Tone;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const { colors } = useTheme();
  const tint = tone === "error" ? colors.danger : colors.textMuted;

  return (
    <View style={styles.container} accessible accessibilityRole="summary">
      <Ionicons name={icon ?? ICONS[tone]} size={44} color={tint} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          variant="secondary"
          onPress={onAction}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  title: { fontFamily: fonts.head, fontSize: fontSizes.h3, textAlign: "center" },
  message: {
    fontFamily: fonts.body,
    fontSize: fontSizes.body,
    textAlign: "center",
    lineHeight: fontSizes.body * 1.5,
  },
});
