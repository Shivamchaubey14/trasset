/**
 * One request in a list.
 *
 * What it carries depends on who is reading it, which is the whole reason this
 * takes a `showRequester` flag rather than always rendering everything:
 *
 * * In **my requests**, the requester is always me — printing my own name on
 *   every row is noise. What matters is *what I asked for* and *where it got to*.
 * * In the **approvals inbox**, the requester is the single most important fact,
 *   because the decision is about a person as much as a thing.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AssetRequest } from "@/api";
import { type RequestStatus, fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

import { Avatar } from "./Avatar";
import { StatusPill } from "./StatusPill";

export function RequestRow({
  request,
  showRequester,
  onPress,
}: {
  request: AssetRequest;
  showRequester?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  const requester = request.requester as { full_name?: string; avatar?: string | null } | null;
  const status = request.status as RequestStatus;

  // `target_label` is built by the server — "TRA-2026-000014 — Dell Latitude"
  // for a specific asset, "Any Laptop" for a category. Rebuilding it here would
  // be a second implementation of the same sentence.
  const target = request.target_label || "An asset";

  const needed = formatNeededBy(request.needed_by);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        showRequester && requester?.full_name
          ? `Request from ${requester.full_name} for ${target}`
          : `Request for ${target}`
      }
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {showRequester ? (
        <Avatar name={requester?.full_name} uri={requester?.avatar} size={38} />
      ) : (
        <View style={[styles.glyph, { backgroundColor: colors.surfaceElevated }]}>
          <Ionicons name="file-tray-outline" size={20} color={colors.textMuted} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={[styles.target, { color: colors.text }]} numberOfLines={1}>
          {target}
        </Text>
        {showRequester && requester?.full_name ? (
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {requester.full_name}
          </Text>
        ) : null}
        <Text style={[styles.reason, { color: colors.textMuted }]} numberOfLines={1}>
          {request.reason}
        </Text>
        {needed ? (
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {needed}
          </Text>
        ) : null}
      </View>

      <View style={styles.trailing}>
        <StatusPill status={status} label={request.status_label} small />
      </View>
    </Pressable>
  );
}

/**
 * "Needed by" in words, because a date on its own does not answer the question
 * an approver is actually asking, which is *how urgent is this*.
 */
function formatNeededBy(value: string | null | undefined): string | null {
  if (!value) return null;

  // Both sides are plain dates, so comparing at midnight keeps "today" honest
  // regardless of the time of day this renders.
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return `Needed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Needed today";
  if (days === 1) return "Needed tomorrow";
  if (days <= 14) return `Needed in ${days} days`;

  return `Needed by ${target.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  glyph: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 1 },
  target: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
  reason: { fontFamily: fonts.body, fontSize: 12 },
  meta: { fontFamily: fonts.body, fontSize: 12 },
  trailing: { alignItems: "flex-end" },
});
