/**
 * One asset in a list.
 *
 * The web shows a seven-column table. At 375px that is unreadable, so this
 * carries only what identifies an asset and what a person is most likely to be
 * asking: what is it, what state is it in, and where is it or who has it.
 * Everything else is one tap away on the detail screen.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Asset } from "@/api";
import { type AssetStatus, fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

import { Avatar } from "./Avatar";
import { StatusPill } from "./StatusPill";

export function AssetRow({ asset, onPress }: { asset: Asset; onPress: () => void }) {
  const { colors } = useTheme();

  const holder = asset.assigned_to as { full_name?: string; avatar?: string | null } | null;
  const location = nameOf(asset.location);
  const category = nameOf(asset.category);

  // Whoever holds it matters more than where it nominally lives — if it is
  // assigned, the location is where the register thinks it is, not where it is.
  const secondary = holder?.full_name
    ? `Held by ${holder.full_name}`
    : [category, location].filter(Boolean).join(" · ") || "—";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${asset.name}, ${asset.asset_tag}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {holder ? (
        <Avatar name={holder.full_name} uri={holder.avatar} size={38} />
      ) : (
        <View style={[styles.glyph, { backgroundColor: colors.surfaceElevated }]}>
          <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {asset.name}
        </Text>
        <Text style={[styles.tag, { color: colors.textMuted }]} numberOfLines={1}>
          {asset.asset_tag}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {secondary}
        </Text>
      </View>

      <View style={styles.trailing}>
        <StatusPill
          status={asset.status as AssetStatus}
          label={(asset as { status_label?: string }).status_label}
          small
        />
      </View>
    </Pressable>
  );
}

function nameOf(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return (value as { name?: string }).name ?? null;
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
  name: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
  tag: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 0.3 },
  meta: { fontFamily: fonts.body, fontSize: 12 },
  trailing: { alignItems: "flex-end" },
});
