/**
 * About — the screen support asks you to read out.
 *
 * Its job is not branding. When someone rings up because "the app is broken",
 * the first three questions are always which version, which build, and which
 * server — and a user who cannot answer them turns a two-minute call into a
 * long one. So every value here is one a support engineer would ask for, the
 * text is selectable so it can be copied into a message, and the environment
 * row is honest about pointing at a laptop in development.
 *
 * Push capability is included for the same reason: "I am not getting
 * notifications" has several causes that look identical from the outside, and
 * this says which one applies on *this* handset rather than in general.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiConfig } from "@/api";
import { isExpoGo } from "@/notifications/push";
import { queue, queueStats } from "@/offline/queue";
import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

function easProjectId(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  const fromEas = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return fromExtra ?? fromEas ?? null;
}

/** One sentence on whether this build can receive push at all. */
function pushCapability(): string {
  if (!Device.isDevice) return "Not on a simulator";
  if (isExpoGo()) return "Not in Expo Go — needs a development build";
  if (!easProjectId()) return "Not linked to an Expo project yet";
  return "Supported on this build";
}

/** Queue depth in one line, for a support call. */
function queueSummary(): string {
  const stats = queueStats(queue.getItems());
  if (stats.depth === 0) return "Nothing waiting";
  const parts = [`${stats.pending} waiting`];
  if (stats.failed) parts.push(`${stats.failed} stuck`);
  if (stats.attempts) parts.push(`${stats.attempts} attempts`);
  return parts.join(" · ");
}

export function AboutScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const rows: [string, string][] = [
    ["Version", Constants.expoConfig?.version ?? "—"],
    // `nativeBuildVersion` is the store build number; it is null in Expo Go,
    // where there is no native build of this app to speak of.
    ["Build", Constants.nativeBuildVersion ?? (isExpoGo() ? "Expo Go" : "—")],
    ["Runtime", String(Constants.expoConfig?.runtimeVersion ?? Constants.expoConfig?.sdkVersion ?? "—")],
    ["Platform", `${Platform.OS} ${String(Platform.Version)}`],
    ["Device", Device.modelName ?? "—"],
    ["Server", apiConfig().baseUrl],
    ["Push", pushCapability()],
    // "How much is stuck, and for how long" is the first question anyone asks
    // about a queue that is not emptying, and it is unanswerable from a screen
    // that only shows a badge.
    ["Queued", queueSummary()],
  ];

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: spacing.md,
        paddingBottom: insets.bottom + spacing.xl,
        gap: spacing.md,
      }}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.name, { color: colors.text }]}>Trasset</Text>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>
          Asset management, in your pocket.
        </Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {rows.map(([label, value], index) => (
          <View
            key={label}
            style={[
              styles.row,
              index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null,
            ]}
          >
            <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
            {/* Selectable so it can be copied into a support message. */}
            <Text selectable style={[styles.rowValue, { color: colors.text }]}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[styles.footnote, { color: colors.textMuted }]}>
        Read these out when you report a problem — version, build and server
        answer most of the first questions.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  name: { fontFamily: fonts.head, fontSize: fontSizes.h1 },
  tagline: { fontFamily: fonts.body, fontSize: fontSizes.small },
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  rowLabel: { fontFamily: fonts.body, fontSize: fontSizes.small },
  rowValue: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.small,
    flexShrink: 1,
    textAlign: "right",
  },
  footnote: { fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: 20 },
});
