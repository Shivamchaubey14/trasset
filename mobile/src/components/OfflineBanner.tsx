/**
 * Offline banner (SRS §12.6, §12.5).
 *
 * Two states, because they mean different things to the user:
 *
 *   offline — you are seeing cached data, and it may be stale
 *   pending — you are offline *and* have work queued that will send later
 *
 * The second matters most. FR-14.27 requires that nothing fails silently, and
 * a person who checked an asset in with no signal needs to see that it has not
 * happened yet — otherwise they walk away believing it did.
 *
 * Presentational only. Real connectivity detection lands with offline reads on
 * Day 48, and the queue count with the mutation queue on Day 49.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts, spacing, useTheme } from "@/theme";

export function OfflineBanner({
  visible,
  pendingCount = 0,
  cachedAt,
}: {
  visible: boolean;
  /** Actions waiting to send. */
  pendingCount?: number;
  /** When the shown data was fetched, so nobody mistakes stale for live. */
  cachedAt?: Date | null;
}) {
  const { colors } = useTheme();
  if (!visible) return null;

  const queued = pendingCount > 0;
  const tint = queued ? colors.accent : colors.textMuted;

  return (
    <View
      style={[styles.bar, { backgroundColor: colors.surfaceElevated, borderColor: tint }]}
      accessibilityLiveRegion="polite"
      accessible
    >
      <Ionicons name={queued ? "cloud-upload-outline" : "cloud-offline-outline"} size={16} color={tint} />
      <Text style={[styles.text, { color: colors.text }]} numberOfLines={2}>
        {queued
          ? `Offline — ${pendingCount} ${pendingCount === 1 ? "change" : "changes"} waiting to send`
          : "Offline"}
        {cachedAt ? <Text style={{ color: colors.textMuted }}>{`  ·  showing data from ${ago(cachedAt)}`}</Text> : null}
      </Text>
    </View>
  );
}

/** Deliberately coarse: "3 minutes ago" is a claim about freshness, not a clock. */
function ago(when: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 3,
  },
  text: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12 },
});
