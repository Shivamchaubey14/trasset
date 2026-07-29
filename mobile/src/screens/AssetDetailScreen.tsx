/**
 * Asset detail (FR-14.10). Minimal — Day 41 adds history, the lifecycle
 * actions and the tabs.
 *
 * It exists now because Day 40's DoD is "scanning opens its detail in under
 * two seconds", and a scanner that resolves into nothing proves nothing.
 *
 * The scan hands the already-fetched asset through in route params, so arriving
 * from a scan paints immediately rather than showing a spinner for a record the
 * app is already holding. Arriving from a deep link has only an id, so it
 * fetches — hence both paths.
 */
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/api";
import type { AssetDetail } from "@/api";
import { Avatar, Card, EmptyState, SkeletonRow, StatusPill } from "@/components";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { type AssetStatus, fonts, fontSizes, spacing, useTheme } from "@/theme";

export function AssetDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, "Asset">>();
  const { id, asset: seeded } = route.params;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["asset", id],
    queryFn: () => api.get<AssetDetail>(`/assets/${id}/`),
    // What the scan already fetched, so the screen paints on arrival.
    initialData: seeded,
  });

  if (isLoading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.md }}>
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <EmptyState
          tone="error"
          title="Could not load this asset"
          actionLabel="Try again"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  const asset = data as AssetDetail;
  const holder = asset.assigned_to as { full_name?: string; avatar?: string | null } | null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
    >
      <View style={{ gap: spacing.xs }}>
        <Text style={[styles.tag, { color: colors.textMuted }]}>{asset.asset_tag}</Text>
        <Text style={[styles.name, { color: colors.text }]}>{asset.name}</Text>
        <StatusPill
          status={asset.status as AssetStatus}
          label={(asset as { status_label?: string }).status_label}
        />
      </View>

      {holder ? (
        <Card>
          <View style={styles.row}>
            <Avatar name={holder.full_name} uri={holder.avatar} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.textMuted }]}>Held by</Text>
              <Text style={[styles.rowValue, { color: colors.text }]}>{holder.full_name}</Text>
            </View>
          </View>
        </Card>
      ) : null}

      <Card>
        <Field label="Category" value={nameOf(asset.category)} />
        <Field label="Location" value={nameOf(asset.location)} />
        <Field label="Department" value={nameOf(asset.department)} />
        <Field label="Serial number" value={asset.serial_number} />
        <Field label="Warranty" value={asset.warranty_expiry} />
        <Field label="Current value" value={asset.current_value} last />
      </Card>

      <Text style={[styles.footnote, { color: colors.textMuted }]}>
        History, specifications and the assign / check-in actions arrive on Day 41.
      </Text>
    </ScrollView>
  );
}

function nameOf(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return (value as { name?: string }).name ?? null;
}

function Field({
  label,
  value,
  last,
}: {
  label: string;
  value?: string | null;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.field,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: value ? colors.text : colors.textMuted }]}>
        {value || "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.small, letterSpacing: 0.5 },
  name: { fontFamily: fonts.head, fontSize: fontSizes.h1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  field: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md, paddingVertical: 10 },
  rowLabel: { fontFamily: fonts.body, fontSize: fontSizes.small },
  rowValue: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body, flexShrink: 1, textAlign: "right" },
  footnote: { fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: 20 },
});
