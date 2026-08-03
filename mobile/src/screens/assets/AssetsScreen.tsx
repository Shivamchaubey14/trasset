/**
 * Assets — "mine" and the register (FR-14.12, FR-14.15).
 *
 * Two modes rather than two screens, because they answer versions of the same
 * question and a person switches between them constantly: *what am I holding*
 * and *where is that thing*.
 *
 * **The filter set is deliberately narrower than the web's** (FR-14.15). The
 * web offers status, category, location, warranty state, value band and date
 * ranges. Here: search, status and location — the two facts that matter when
 * you are standing in a room rather than sitting at a desk. Category and
 * warranty are reporting filters, and a phone is not where reports get built
 * (§12.8).
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/api";
import type { Asset, Location, Page } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { AssetRow, Chip, EmptyState, OfflineBanner, SkeletonRow } from "@/components";
import { useDebounced } from "@/hooks/useDebounced";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { usePendingCount } from "@/offline/queue/QueueProvider";
import { factsOf, useOfflineRead } from "@/offline/useOfflineRead";
import { type AssetStatus, fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

type Mode = "mine" | "all";

const STATUS_FILTERS: { value: AssetStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "assigned", label: "Assigned" },
  { value: "under_maintenance", label: "Maintenance" },
];

const PAGE_SIZE = 20;

export function AssetsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [mode, setMode] = useState<Mode>("mine");
  const [rawSearch, setRawSearch] = useState("");
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);

  const search = useDebounced(rawSearch.trim());

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<Page<Location>>("/locations/", { page_size: 100 }),
    staleTime: 10 * 60_000, // master data barely moves
    enabled: mode === "all",
  });

  const params = useMemo(() => {
    const query: Record<string, string | number> = { page_size: PAGE_SIZE };

    if (mode === "mine") {
      // Everything this person currently holds. Not a filter the user can
      // clear — it is what the mode means.
      query.assigned_to = user?.id ?? -1;
    } else {
      if (search) query.search = search;
      if (locationId) query.location = locationId;
    }
    return query;
  }, [mode, search, locationId, user?.id]);

  const listQuery = useInfiniteQuery({
    // `statuses` is in the key rather than in `params` because it is repeated
    // (?status=a&status=b) and cannot be expressed as one value.
    queryKey: ["assets", mode, params, statuses],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => query.append(key, String(value)));
      statuses.forEach((status) => query.append("status", status));
      query.append("page", String(pageParam));
      return api.get<Page<Asset>>(`/assets/?${query.toString()}`);
    },
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });

  const rows = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.results) ?? [],
    [listQuery.data],
  );
  const total = listQuery.data?.pages[0]?.count ?? 0;

  const toggleStatus = useCallback((status: AssetStatus) => {
    setStatuses((current) =>
      current.includes(status) ? current.filter((s) => s !== status) : [...current, status],
    );
  }, []);

  const clearFilters = useCallback(() => {
    setRawSearch("");
    setStatuses([]);
    setLocationId(null);
  }, []);

  const hasFilters = Boolean(search || statuses.length || locationId);

  // `hasData` is the row count, not the query's `data`: an infinite query that
  // has fetched one empty page still has `data`, and calling that "cached
  // content" would show a banner over nothing.
  const pending = usePendingCount();
  const offline = useOfflineRead({
    ...factsOf(listQuery),
    hasData: rows.length > 0,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <OfflineBanner
        visible={offline.showBanner || pending > 0}
        pendingCount={pending}
        cachedAt={new Date(listQuery.dataUpdatedAt)}
      />

      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >Assets</Text>

        <View style={[styles.segmented, { backgroundColor: colors.surfaceElevated }]}>
          {(["mine", "all"] as Mode[]).map((value) => (
            <Pressable
              key={value}
              onPress={() => setMode(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === value }}
              style={[
                styles.segment,
                mode === value && { backgroundColor: colors.surface },
              ]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  { color: mode === value ? colors.text : colors.textMuted },
                ]}
              >
                {value === "mine" ? "My assets" : "Register"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {mode === "all" ? (
        <View style={styles.controls}>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={rawSearch}
              onChangeText={setRawSearch}
              placeholder="Name, tag or serial"
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search the register"
            />
            {rawSearch ? (
              <Pressable onPress={() => setRawSearch("")} hitSlop={12} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled"
          >
            {STATUS_FILTERS.map((filter) => (
              <Chip
                key={filter.value}
                label={filter.label}
                selected={statuses.includes(filter.value)}
                onPress={() => toggleStatus(filter.value)}
              />
            ))}
            {(locations.data?.results ?? []).map((location) => (
              <Chip
                key={location.id}
                label={location.name}
                selected={locationId === location.id}
                onPress={() => setLocationId(locationId === location.id ? null : location.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <AssetRow asset={item} onPress={() => navigation.navigate("Asset", { id: item.id })} />
        )}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.sm,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={listQuery.isRefetching && !listQuery.isFetchingNextPage}
            onRefresh={listQuery.refetch}
            tintColor={colors.primary}
          />
        }
        // Fetch the next page a little before the bottom, so a fast scroller
        // does not meet a spinner.
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
            listQuery.fetchNextPage();
          }
        }}
        ListHeaderComponent={
          rows.length ? (
            <Text style={[styles.count, { color: colors.textMuted }]}>
              {total} {total === 1 ? "asset" : "assets"}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          // Skeletons only while something can actually arrive. Offline with
          // nothing cached, a skeleton is a promise the app cannot keep — it
          // would sit there until the signal came back.
          offline.showSpinner ? (
            <View style={{ gap: spacing.sm }}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (
            <Empty
              mode={mode}
              hasFilters={hasFilters}
              offline={offline.showOfflineEmpty}
              error={listQuery.error}
              onClear={clearFilters}
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
    </View>
  );
}

/** The four different "nothing here" conditions, told apart. */
function Empty({
  mode,
  hasFilters,
  offline,
  error,
  onClear,
  onRetry,
}: {
  mode: Mode;
  hasFilters: boolean;
  /** No network *and* nothing cached — checked before any error. */
  offline: boolean;
  error: unknown;
  onClear: () => void;
  onRetry: () => void;
}) {
  // First, because it is the true explanation whenever it applies. A request
  // made with no signal also produces an error, and reporting that instead
  // would blame the server for the aeroplane mode the user turned on.
  if (offline) {
    return (
      <EmptyState
        tone="offline"
        title="You are offline"
        message="Assets you have opened recently are still available. This list needs a connection."
        actionLabel="Try again"
        onAction={onRetry}
      />
    );
  }

  if (error) {
    const offline = error instanceof ApiError && error.isNetworkError;
    return (
      <EmptyState
        tone={offline ? "offline" : "error"}
        title={offline ? "You are offline" : "Could not load assets"}
        message={
          offline
            ? "Assets you have opened recently are still available."
            : error instanceof ApiError
              ? error.message
              : undefined
        }
        actionLabel="Try again"
        onAction={onRetry}
      />
    );
  }

  if (hasFilters) {
    return (
      <EmptyState
        icon="search-outline"
        title="Nothing matched"
        message="Try a different tag, name or serial number."
        actionLabel="Clear filters"
        onAction={onClear}
      />
    );
  }

  return mode === "mine" ? (
    <EmptyState
      icon="cube-outline"
      title="You are not holding anything"
      message="Assets issued to you will appear here."
    />
  ) : (
    <EmptyState icon="cube-outline" title="No assets yet" />
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  title: { fontFamily: fonts.head, fontSize: fontSizes.h1 },
  segmented: { flexDirection: "row", borderRadius: radius.sm, padding: 3 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.sm - 2 },
  segmentLabel: { fontFamily: fonts.bodySemi, fontSize: fontSizes.small },
  controls: { paddingTop: spacing.sm, gap: spacing.sm },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: fontSizes.body, paddingVertical: 10 },
  chipRow: { paddingHorizontal: spacing.md, gap: spacing.sm },
  count: { fontFamily: fonts.body, fontSize: 12, paddingBottom: spacing.xs },
});
