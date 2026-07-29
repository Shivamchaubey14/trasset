/**
 * Asset detail (FR-14.10, FR-14.11) — what you need while standing in front of
 * the thing.
 *
 * Not a port of the web's tabbed layout. The web has room for Overview,
 * History, Specifications and Depreciation side by side; a phone does not, and
 * hiding history behind a tab costs a tap in exactly the moment someone is
 * asking "who had this last?". So it is one scroll, ordered by what a person
 * standing at a shelf needs first: what it is, who has it, then the detail.
 *
 * Depreciation is deliberately absent — a valuation schedule is a desk task
 * (§12.8), and the current value is already on this screen.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import React, { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/api";
import type { AssetDetail } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import {
  type ActionSpec,
  availableActions,
  stateExplanation,
} from "@/assets/actions";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Skeleton,
  SkeletonRow,
  StatusPill,
  useToast,
} from "@/components";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { type AssetStatus, fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

/**
 * A history row is an *event*, not a date range — the API appends one row per
 * transition (FR-4.3, immutable by construction). Getting this wrong is easy:
 * an earlier draft assumed `assigned_at`/`returned_at` and rendered every entry
 * as "still held" with no dates at all.
 */
type HistoryRow = {
  id: number;
  action: string;
  action_label?: string;
  user?: { full_name?: string } | null;
  assigned_by?: { full_name?: string } | null;
  days_held?: number | null;
  notes?: string | null;
  created_at: string;
};

export function AssetDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const route = useRoute<RouteProp<RootStackParamList, "Asset">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // A deep link supplies `id` as a string from the URL; a scan supplies a
  // number. Normalising here keeps the query key stable — otherwise the same
  // asset caches twice under "12" and 12.
  const id = Number(route.params.id);
  const seeded = route.params.asset;

  const assetQuery = useQuery({
    queryKey: ["asset", id],
    queryFn: () => api.get<AssetDetail>(`/assets/${id}/`),
    initialData: seeded,
  });

  const historyQuery = useQuery({
    queryKey: ["asset", id, "history"],
    queryFn: () => api.get<HistoryRow[] | { results: HistoryRow[] }>(`/assets/${id}/history/`),
    // Only after the asset exists — a 404 on the asset makes history pointless.
    enabled: Boolean(assetQuery.data),
  });

  const refresh = useCallback(() => {
    assetQuery.refetch();
    historyQuery.refetch();
  }, [assetQuery, historyQuery]);

  if (assetQuery.isLoading && !assetQuery.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.md }}>
        <Skeleton width="45%" height={13} />
        <Skeleton width="80%" height={30} />
        <Skeleton width={120} height={26} />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (assetQuery.isError && !assetQuery.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <EmptyState
          tone="error"
          title="Could not load this asset"
          message="It may have been removed, or you may be offline."
          actionLabel="Try again"
          onAction={refresh}
        />
      </View>
    );
  }

  const asset = assetQuery.data as AssetDetail;
  const status = asset.status as AssetStatus;
  const holder = asset.assigned_to as
    | { full_name?: string; email?: string; avatar?: string | null }
    | null;

  const actions = availableActions(status, user?.role_name as string | undefined);
  const explanation = stateExplanation(status);

  const rawHistory = historyQuery.data;
  const history: HistoryRow[] = Array.isArray(rawHistory)
    ? rawHistory
    : (rawHistory?.results ?? []);

  function runAction(spec: ActionSpec) {
    switch (spec.action) {
      case "assign":
        navigation.navigate("Assign", { assetId: id, assetTag: asset.asset_tag });
        return;
      case "checkin":
        navigation.navigate("Checkin", {
          assetId: id,
          assetTag: asset.asset_tag,
          holderName: holder?.full_name ?? null,
        });
        return;
      default:
        // Report-an-issue is Day 44; retire is not in mobile v1's queue story
        // and lands with the rest of the lifecycle work.
        toast.show(`"${spec.label}" arrives on Day 44.`);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: spacing.md,
        paddingBottom: insets.bottom + spacing.xl,
        gap: spacing.md,
      }}
      refreshControl={
        <RefreshControl
          refreshing={assetQuery.isFetching && !assetQuery.isLoading}
          onRefresh={refresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Identity first: standing at a shelf, the question is "is this the
          right thing?" before anything else. */}
      <View style={{ gap: spacing.xs }}>
        <Text style={[styles.tag, { color: colors.textMuted }]}>{asset.asset_tag}</Text>
        <Text style={[styles.name, { color: colors.text }]}>{asset.name}</Text>
        <StatusPill status={status} label={(asset as { status_label?: string }).status_label} />
      </View>

      {holder ? (
        <Card>
          <View style={styles.holderRow}>
            <Avatar name={holder.full_name} uri={holder.avatar} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Held by</Text>
              <Text style={[styles.value, { color: colors.text }]}>{holder.full_name}</Text>
              {asset.assigned_at ? (
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  since {formatDate(asset.assigned_at)}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>
      ) : explanation ? (
        <Card elevated>
          <Text style={[styles.explanation, { color: colors.textMuted }]}>{explanation}</Text>
        </Card>
      ) : null}

      {actions.length ? (
        <View style={{ gap: spacing.sm }}>
          {actions.map((spec) => (
            <Button
              key={spec.action}
              label={spec.label}
              variant={spec.primary ? "primary" : "secondary"}
              onPress={() => runAction(spec)}
            />
          ))}
        </View>
      ) : null}

      <Section title="Details">
        <Card>
          <Field label="Category" value={nameOf(asset.category)} />
          <Field label="Location" value={nameOf(asset.location)} />
          <Field label="Department" value={nameOf(asset.department)} />
          <Field label="Serial number" value={asset.serial_number} />
          <Field label="Manufacturer" value={(asset as { manufacturer?: string }).manufacturer} />
          <Field label="Model" value={(asset as { model_number?: string }).model_number} />
          <Field label="Warranty" value={warrantyText(asset)} />
          <Field label="Current value" value={money(asset.current_value)} last />
        </Card>
      </Section>

      <Specifications asset={asset} />

      <Section title="History">
        {historyQuery.isLoading ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : history.length ? (
          <Card>
            {history.map((row, index) => (
              <HistoryEntry key={row.id ?? index} row={row} last={index === history.length - 1} />
            ))}
          </Card>
        ) : (
          <Card padded={false}>
            <EmptyState
              icon="time-outline"
              title="Never assigned"
              message="This asset has not been checked out to anyone yet."
            />
          </Card>
        )}
      </Section>
    </ScrollView>
  );
}

/**
 * Category custom fields (FR-3.8). Rendered only when there are any — an empty
 * "Specifications" heading is noise on a small screen.
 */
function Specifications({ asset }: { asset: AssetDetail }) {
  const custom = (asset as { custom_data?: Record<string, unknown> }).custom_data;
  const entries = Object.entries(custom ?? {}).filter(([, value]) => value != null && value !== "");
  if (!entries.length) return null;

  return (
    <Section title="Specifications">
      <Card>
        {entries.map(([key, value], index) => (
          <Field
            key={key}
            label={humanise(key)}
            value={String(value)}
            last={index === entries.length - 1}
          />
        ))}
      </Card>
    </Section>
  );
}

function HistoryEntry({ row, last }: { row: HistoryRow; last: boolean }) {
  const { colors, status: statusColors } = useTheme();

  // The dot colours the *kind* of event, reusing the status palette so a
  // check-out here reads the same green as an Assigned pill elsewhere.
  const tint =
    row.action === "checkin"
      ? statusColors.available
      : row.action === "retire"
        ? statusColors.retired
        : colors.ink;

  const headline = row.action_label ?? humanise(row.action);
  const person = row.user?.full_name;

  return (
    <View style={styles.historyRow}>
      <View style={styles.timeline}>
        <View style={[styles.dot, { backgroundColor: tint }]} />
        {!last ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
      </View>

      <View style={styles.historyBody}>
        {/* `value` is right-aligned for the label/value rows above; a timeline
            entry reads left-to-right, so the alignment is overridden here. */}
        <Text style={[styles.value, styles.alignLeft, { color: colors.text }]}>
          {person ? `${headline} — ${person}` : headline}
        </Text>
        <Text style={[styles.label, { color: colors.textMuted }]}>
          {formatDate(row.created_at)}
          {row.assigned_by?.full_name ? ` · by ${row.assigned_by.full_name}` : ""}
          {typeof row.days_held === "number" && row.days_held >= 0
            ? ` · held ${row.days_held} ${row.days_held === 1 ? "day" : "days"}`
            : ""}
        </Text>
        {row.notes ? (
          <Text style={[styles.notes, { color: colors.textMuted }]}>{row.notes}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Field({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.field,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: value ? colors.text : colors.textMuted }]}>
        {value || "—"}
      </Text>
    </View>
  );
}

// --- formatting -------------------------------------------------------------
function nameOf(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return (value as { name?: string }).name ?? null;
}

function humanise(key: string): string {
  return key.replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function money(value?: string | null): string | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  // The estate is priced in rupees (SRS §7 examples, ₹ throughout the reports).
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function warrantyText(asset: AssetDetail): string | null {
  const expiry = (asset as { warranty_expiry?: string | null }).warranty_expiry;
  if (!expiry) return null;
  const expired = (asset as { warranty_expired?: boolean }).warranty_expired;
  const soon = (asset as { warranty_expiring_soon?: boolean }).warranty_expiring_soon;
  const date = formatDate(expiry);
  if (expired) return `${date} · expired`;
  if (soon) return `${date} · expiring soon`;
  return date;
}

const styles = StyleSheet.create({
  tag: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.small, letterSpacing: 0.5 },
  name: { fontFamily: fonts.head, fontSize: fontSizes.h1 },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.2 },
  holderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  explanation: { fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: 20 },
  field: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 10,
  },
  label: { fontFamily: fonts.body, fontSize: fontSizes.small },
  value: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body, flexShrink: 1, textAlign: "right" },
  alignLeft: { textAlign: "left" },
  historyRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  timeline: { alignItems: "center", width: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  line: { width: 2, flex: 1, marginTop: 4, borderRadius: 1 },
  historyBody: { flex: 1, gap: 2 },
  notes: { fontFamily: fonts.body, fontSize: fontSizes.small, fontStyle: "italic", marginTop: 2 },
});
