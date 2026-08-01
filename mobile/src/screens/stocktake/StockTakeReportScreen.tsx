/**
 * The reconciliation (FR-14.20).
 *
 * Three answers, grouped, because that is the entire output of a stock take:
 * what was where it should be, what could not be found, and what turned up
 * that the register did not expect. The last two are why anyone spends an
 * afternoon walking a room.
 *
 * The awkward case is the one that matters. A count submitted with no signal
 * has not been reconciled by anything yet — the queue is still holding it — so
 * there is no report to show. Showing zeros would be a lie, and showing a
 * spinner would suggest something is in progress. It says what is actually
 * true: the count is safe, it has not been sent yet, and here is where to watch
 * it go.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/api";
import { Button, EmptyState, SkeletonRow } from "@/components";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useOnline } from "@/net/online";
import { isPendingFor } from "@/offline/queue";
import { useQueueItems } from "@/offline/queue/QueueProvider";
import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

type Entry = {
  id: number;
  asset_tag: string;
  asset_name: string;
  state: string;
  expected_location_name?: string | null;
};

type Report = {
  counts: { found: number; missing: number; unexpected: number; scanned: number };
  found: Entry[];
  missing: Entry[];
  unexpected: Entry[];
  stock_take: { location_name: string; status_label: string };
};

export function StockTakeReportScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, "StockTakeReport">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const online = useOnline();
  const queued = useQueueItems();

  const { id } = route.params;
  const stillQueued = isPendingFor(queued, "stocktake", id);

  const report = useQuery({
    queryKey: ["stock-take", id, "report"],
    queryFn: () => api.get<Report>(`/stock-takes/${id}/report/`),
    // Pointless while the count is still sitting in the queue: the server has
    // not seen a single scan yet, so it would answer with everything missing.
    enabled: !stillQueued && online,
    retry: false,
  });

  if (stillQueued) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: spacing.md }}>
        <EmptyState
          tone="offline"
          icon="cloud-upload-outline"
          title="Your count is saved"
          message={
            online
              ? "It is being sent now. The reconciliation appears once the server has it."
              : "It has not been sent yet. It will go automatically when you have signal — nothing is waiting on you."
          }
          actionLabel="See unsent actions"
          onAction={() => navigation.navigate("Conflicts")}
        />
      </View>
    );
  }

  if (report.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm }}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (report.isError || !report.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <EmptyState
          tone={online ? "error" : "offline"}
          title={online ? "Could not load the reconciliation" : "You are offline"}
          message={
            online
              ? "The count may still be on its way."
              : "The reconciliation lives on the server, so it needs a connection."
          }
          actionLabel="Try again"
          onAction={() => report.refetch()}
        />
      </View>
    );
  }

  const { counts, found, missing, unexpected, stock_take: stockTake } = report.data;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: spacing.md,
        paddingBottom: insets.bottom + spacing.xl,
        gap: spacing.md,
      }}
    >
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.location, { color: colors.text }]}>{stockTake.location_name}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>{stockTake.status_label}</Text>
        <View style={styles.tally}>
          <Figure label="Found" value={counts.found} colour={colors.primary} />
          <Figure label="Missing" value={counts.missing} colour={colors.danger} />
          <Figure label="Unexpected" value={counts.unexpected} colour={colors.accent} />
        </View>
      </View>

      {/* Missing first: it is the finding somebody has to act on, and burying
          it under a long list of everything that was exactly where it should
          be is how a report gets skimmed and closed. */}
      <Group
        title="Missing"
        hint="The register says these are here. Nobody could see them."
        icon="help-circle-outline"
        colour={colors.danger}
        entries={missing}
      />
      <Group
        title="Unexpected"
        hint="These were here, but the register places them somewhere else."
        icon="alert-circle-outline"
        colour={colors.accent}
        entries={unexpected}
      />
      <Group
        title="Found"
        hint="Exactly where they should be."
        icon="checkmark-circle-outline"
        colour={colors.primary}
        entries={found}
      />

      <Button label="Done" variant="secondary" onPress={() => navigation.popToTop()} />
    </ScrollView>
  );
}

function Figure({ label, value, colour }: { label: string; value: number; colour: string }) {
  const { colors } = useTheme();
  return (
    <View>
      <Text style={[styles.figure, { color: colour }]}>{value}</Text>
      <Text style={[styles.figureLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function Group({
  title,
  hint,
  icon,
  colour,
  entries,
}: {
  title: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  colour: string;
  entries: Entry[];
}) {
  const { colors } = useTheme();
  if (!entries.length) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.groupHead}>
        <Ionicons name={icon} size={18} color={colour} />
        <Text style={[styles.groupTitle, { color: colors.text }]}>
          {title} · {entries.length}
        </Text>
      </View>
      <Text style={[styles.meta, { color: colors.textMuted }]}>{hint}</Text>

      {entries.map((entry) => (
        <View
          key={`${entry.state}-${entry.id}`}
          style={[
            styles.entry,
            { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colour },
          ]}
        >
          <Text style={[styles.tag, { color: colors.text }]}>{entry.asset_tag}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {entry.asset_name}
            {entry.expected_location_name ? ` · expected at ${entry.expected_location_name}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  location: { fontFamily: fonts.head, fontSize: fontSizes.h3 },
  tally: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.sm },
  figure: { fontFamily: fonts.head, fontSize: fontSizes.h2 },
  figureLabel: { fontFamily: fonts.body, fontSize: 11 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupTitle: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
  entry: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    padding: spacing.sm,
  },
  tag: { fontFamily: fonts.bodySemi, fontSize: fontSizes.small },
  meta: { fontFamily: fonts.body, fontSize: fontSizes.small },
});
