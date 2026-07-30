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
 * Presentational only: it is told whether to show rather than deciding. The
 * decision belongs to `useOnline`, so a screen cannot claim to be offline while
 * a request of its own is in flight. The queue count arrives with the mutation
 * queue.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { describeAge } from "@/offline/freshness";
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
        {cachedAt ? (
          <Text style={{ color: colors.textMuted }}>
            {`  ·  showing data from ${describeAge(cachedAt)}`}
          </Text>
        ) : null}
      </Text>
    </View>
  );
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
