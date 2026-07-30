/**
 * Requests — mine, and the approvals inbox (FR-14.16, FR-14.17).
 *
 * **One screen, read two ways.** An employee sees a list of things they have
 * asked for and a button to ask for another. An approver sees the same list
 * plus a second mode holding decisions waiting on them, and lands on that mode
 * first — an approver opening this tab is almost always answering something,
 * not browsing their own history.
 *
 * The mode switch only appears for someone who can actually decide, rather than
 * being shown-and-disabled. A control that is visible but never usable is worse
 * than one that was never there: it invites a tap and then explains why not.
 *
 * Visibility inside the inbox is the server's decision, not a filter sent from
 * here — `AssetRequestViewSet.get_queryset` scopes it by role, so a department
 * head sees their department and a manager sees everything. Sending
 * `?requester=` from the client would be a scope the client could also lift.
 */
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/api";
import type { AssetRequest, Page } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Chip, EmptyState, OfflineBanner, RequestRow, SkeletonRow } from "@/components";
import { factsOf, useOfflineRead } from "@/offline/useOfflineRead";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { canApprove, canRaise } from "@/requests/actions";
import { type RequestStatus, fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

type Mode = "mine" | "inbox";

const STATUS_FILTERS: { value: RequestStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 20;

interface RequestStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
}

export function RequestsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const approver = canApprove(user?.role_name as string | undefined);
  // An auditor may read every request and raise none — the read-only guard
  // refuses the POST whatever the view declares.
  const mayRaise = canRaise(user?.role_name as string | undefined);

  const [mode, setMode] = useState<Mode>(approver ? "inbox" : "mine");
  const [statuses, setStatuses] = useState<RequestStatus[]>([]);

  // The role arrives with the user, which on a cold start can land after the
  // first render. Without this, an approver briefly gets "My requests" and then
  // has the tab change under them.
  useEffect(() => {
    if (approver) setMode((current) => (current === "mine" ? "inbox" : current));
  }, [approver]);

  const params = useMemo(() => {
    const query: Record<string, string | number> = { page_size: PAGE_SIZE };
    if (mode === "mine") {
      // What I asked for. Not a filter the user can clear — it is the mode.
      query.requester = user?.id ?? -1;
    }
    return query;
  }, [mode, user?.id]);

  // In the inbox, "pending" is the default rather than a filter the approver has
  // to apply: a settled request is history, and history is not what an inbox is
  // for. They can still widen it with the chips.
  const effectiveStatuses = useMemo<RequestStatus[]>(
    () => (statuses.length ? statuses : mode === "inbox" ? ["pending"] : []),
    [statuses, mode],
  );

  const listQuery = useInfiniteQuery({
    queryKey: ["requests", mode, params, effectiveStatuses],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => query.append(key, String(value)));
      // Repeated (?status=a&status=b), so it cannot go through `params`.
      effectiveStatuses.forEach((status) => query.append("status", status));
      query.append("page", String(pageParam));
      return api.get<Page<AssetRequest>>(`/asset-requests/?${query.toString()}`);
    },
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });

  // Scoped by the same role rules as the list, so this is "pending on me", not
  // a global count. Only worth fetching for someone who can act on it.
  const stats = useQuery({
    queryKey: ["requestStats"],
    queryFn: () => api.get<RequestStats>("/asset-requests/stats/"),
    enabled: approver,
  });

  const rows = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.results) ?? [],
    [listQuery.data],
  );
  const total = listQuery.data?.pages[0]?.count ?? 0;

  const toggleStatus = useCallback((status: RequestStatus) => {
    setStatuses((current) =>
      current.includes(status) ? current.filter((s) => s !== status) : [...current, status],
    );
  }, []);

  const openRequest = useCallback(
    (request: AssetRequest) => navigation.navigate("Request", { id: request.id, request }),
    [navigation],
  );

  const pending = stats.data?.pending ?? 0;

  // Row count rather than the query's `data`: an infinite query that fetched
  // one empty page still has `data`, and a banner over nothing says nothing.
  const offline = useOfflineRead({
    ...factsOf(listQuery),
    hasData: rows.length > 0,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <OfflineBanner visible={offline.showBanner} cachedAt={new Date(listQuery.dataUpdatedAt)} />

      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Requests</Text>

        {approver ? (
          <View style={[styles.segmented, { backgroundColor: colors.surfaceElevated }]}>
            {(["inbox", "mine"] as Mode[]).map((value) => (
              <Pressable
                key={value}
                onPress={() => {
                  setMode(value);
                  // Carrying "rejected" from my own history into the inbox would
                  // show an approver a screen with nothing to decide on.
                  setStatuses([]);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === value }}
                style={[styles.segment, mode === value && { backgroundColor: colors.surface }]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: mode === value ? colors.text : colors.textMuted },
                  ]}
                >
                  {value === "inbox" ? "To approve" : "Mine"}
                </Text>
                {value === "inbox" && pending > 0 ? (
                  <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                    <Text style={[styles.badgeText, { color: colors.onAccent }]}>
                      {pending > 99 ? "99+" : pending}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {STATUS_FILTERS.map((filter) => (
            <Chip
              key={filter.value}
              label={filter.label}
              selected={effectiveStatuses.includes(filter.value)}
              onPress={() => toggleStatus(filter.value)}
            />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <RequestRow
            request={item}
            showRequester={mode === "inbox"}
            onPress={() => openRequest(item)}
          />
        )}
        contentContainerStyle={{
          padding: spacing.md,
          // Clears the pinned button, which otherwise covers the last row —
          // and is not there to clear for a role that cannot raise one.
          paddingBottom: insets.bottom + (mayRaise ? 96 : spacing.xl),
          gap: spacing.sm,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={listQuery.isRefetching && !listQuery.isFetchingNextPage}
            onRefresh={() => {
              listQuery.refetch();
              if (approver) stats.refetch();
            }}
            tintColor={colors.primary}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
            listQuery.fetchNextPage();
          }
        }}
        ListHeaderComponent={
          rows.length ? (
            <Text style={[styles.count, { color: colors.textMuted }]}>
              {total} {total === 1 ? "request" : "requests"}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          // Skeletons only while something can actually arrive.
          offline.showSpinner ? (
            <View style={{ gap: spacing.sm }}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (
            <Empty
              mode={mode}
              filtered={statuses.length > 0}
              mayRaise={mayRaise}
              offline={offline.showOfflineEmpty}
              error={listQuery.error}
              onClear={() => setStatuses([])}
              onRetry={listQuery.refetch}
            />
          )
        }
        ListFooterComponent={
          listQuery.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.md }} />
          ) : null
        }
      />

      {/* Pinned rather than in the header: raising a request is the reason an
          employee opens this tab, and it should not scroll away. Absent
          entirely for a read-only role — the POST would be refused. */}
      {mayRaise ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + spacing.md,
            },
          ]}
        >
          <Button label="Raise a request" onPress={() => navigation.navigate("NewRequest", {})} />
        </View>
      ) : null}
    </View>
  );
}

/** The four different "nothing here" conditions, told apart. */
function Empty({
  mode,
  filtered,
  mayRaise,
  offline,
  error,
  onClear,
  onRetry,
}: {
  mode: Mode;
  filtered: boolean;
  mayRaise: boolean;
  /** No network *and* nothing cached — checked before any error. */
  offline: boolean;
  error: unknown;
  onClear: () => void;
  onRetry: () => void;
}) {
  // First, because it is the true explanation whenever it applies: a request
  // made with no signal also fails, and the error would blame the server.
  if (offline) {
    return (
      <EmptyState
        tone="offline"
        title="You are offline"
        message="Requests will load again once you have signal."
        actionLabel="Try again"
        onAction={onRetry}
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        tone="error"
        title="Could not load requests"
        message={error instanceof ApiError ? error.message : undefined}
        actionLabel="Try again"
        onAction={onRetry}
      />
    );
  }

  if (filtered) {
    return (
      <EmptyState
        icon="funnel-outline"
        title="Nothing in that state"
        message="Try a different status."
        actionLabel="Clear filters"
        onAction={onClear}
      />
    );
  }

  return mode === "inbox" ? (
    <EmptyState
      icon="checkmark-done-outline"
      title="Nothing waiting on you"
      message="Requests needing a decision will appear here."
    />
  ) : (
    <EmptyState
      icon="file-tray-outline"
      title="You have not asked for anything"
      message={
        mayRaise
          ? "Raise a request and it will show up here with its progress."
          : // An auditor reads requests and raises none, so promising them a
            // button that is not on screen would be a small lie.
            "Requests you raise would appear here."
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  title: { fontFamily: fonts.head, fontSize: fontSizes.h1 },
  segmented: { flexDirection: "row", borderRadius: radius.sm, padding: 3 },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.sm - 2,
  },
  segmentLabel: { fontFamily: fonts.bodySemi, fontSize: fontSizes.small },
  badge: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 11 },
  chipRow: { gap: spacing.sm, paddingRight: spacing.md },
  count: { fontFamily: fonts.body, fontSize: 12, paddingBottom: spacing.xs },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
