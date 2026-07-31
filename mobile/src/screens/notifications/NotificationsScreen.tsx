/**
 * Alerts — the in-app mirror of `/notifications/` (FR-14.24).
 *
 * The same list the web shows, minus the parts that need a mouse. Tapping a row
 * does two things at once, deliberately: it marks the notification read and
 * opens the record it points at. Marking read as a separate gesture would be
 * busywork — reading it *is* the act of reading it.
 *
 * A row routes through the same resolver a tapped push uses
 * (`routeForPayload`), so an in-app tap and a push tap cannot disagree about
 * where a notification leads. The list has no `deep_link` — that field is
 * push-payload-only — so this is exactly why the resolver also accepts
 * `related_object_type` + `related_object_id`.
 *
 * Unread is shown with a dot *and* a weight change, never colour alone (NFR-9).
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/api";
import type { Notification, Page } from "@/api";
import { Chip, EmptyState, OfflineBanner, SkeletonRow, useToast } from "@/components";
import { usePendingCount } from "@/offline/queue/QueueProvider";
import { factsOf, useOfflineRead } from "@/offline/useOfflineRead";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { routeForPayload } from "@/notifications/routing";
import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

const PAGE_SIZE = 25;

export function NotificationsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [unreadOnly, setUnreadOnly] = useState(false);

  const listQuery = useInfiniteQuery({
    queryKey: ["notifications", { unreadOnly }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<Page<Notification>>("/notifications/", {
        page: pageParam,
        page_size: PAGE_SIZE,
        ...(unreadOnly ? { is_read: false } : {}),
      }),
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });

  const counts = useQuery({
    queryKey: ["notificationCount"],
    queryFn: () => api.get<{ unread: number; total: number }>("/notifications/count/"),
  });

  const rows = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.results) ?? [],
    [listQuery.data],
  );
  const unread = counts.data?.unread ?? 0;

  const markRead = useMutation({
    mutationFn: (id: number) => api.post<Notification>(`/notifications/${id}/read/`),
    onSettled() {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notificationCount"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post<{ marked: number }>("/notifications/read-all/"),
    onSuccess(result) {
      toast.success(
        result.marked
          ? `${result.marked} marked as read`
          : "Nothing left to mark",
      );
    },
    onError(error) {
      toast.error(error instanceof ApiError ? error.message : "Could not mark these as read.");
    },
    onSettled() {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notificationCount"] });
    },
  });

  const open = useCallback(
    (notification: Notification) => {
      // Read *and* open. Optimistic in effect: the mutation fires without being
      // awaited, so navigation is not held up by a request that only affects a
      // dot. If it fails the list refetch puts the dot back.
      if (!notification.is_read) markRead.mutate(notification.id);

      const route = routeForPayload({
        related_object_type: notification.related_object_type,
        related_object_id: notification.related_object_id,
        type: notification.type,
      });

      // Already here — navigating to this tab from this tab would be a no-op
      // that looks like a dead tap, so say why instead.
      if (route.screen === "Notifications") {
        toast.show("This one has no record to open on the phone.");
        return;
      }
      navigation.navigate(route.screen, route.params);
    },
    [markRead, navigation, toast],
  );

  // Row count rather than the query's `data`: one fetched empty page still
  // counts as `data`, and a banner over nothing says nothing.
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
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]}>Alerts</Text>
          {unread > 0 ? (
            <Pressable
              onPress={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Mark all ${unread} as read`}
            >
              <Text style={[styles.action, { color: colors.primary }]}>Mark all read</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.chipRow}>
          <Chip label="All" selected={!unreadOnly} onPress={() => setUnreadOnly(false)} />
          <Chip
            label={unread ? `Unread (${unread})` : "Unread"}
            selected={unreadOnly}
            onPress={() => setUnreadOnly(true)}
          />
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <NotificationRow notification={item} onPress={() => open(item)} />}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.sm,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={listQuery.isRefetching && !listQuery.isFetchingNextPage}
            onRefresh={() => {
              listQuery.refetch();
              counts.refetch();
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
        ListEmptyComponent={
          // A skeleton is a promise that something is arriving. Offline with
          // nothing cached, nothing is.
          offline.showSpinner ? (
            <View style={{ gap: spacing.sm }}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : offline.showOfflineEmpty ? (
            <EmptyState
              tone="offline"
              title="You are offline"
              message="Alerts you have already received are still here once they have been fetched at least once."
              actionLabel="Try again"
              onAction={listQuery.refetch}
            />
          ) : offline.showError ? (
            <EmptyState
              tone="error"
              title="Could not load alerts"
              message={listQuery.error instanceof ApiError ? listQuery.error.message : undefined}
              actionLabel="Try again"
              onAction={listQuery.refetch}
            />
          ) : unreadOnly ? (
            <EmptyState
              icon="checkmark-done-outline"
              title="Nothing unread"
              message="You are up to date."
              actionLabel="Show all"
              onAction={() => setUnreadOnly(false)}
            />
          ) : (
            <EmptyState
              icon="notifications-outline"
              title="No alerts yet"
              message="Assignments, approvals and warranty reminders will appear here."
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

function NotificationRow({
  notification,
  onPress,
}: {
  notification: Notification;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const unread = !notification.is_read;

  // The server picks the glyph and colour per type (`TYPE_STYLES`), so the
  // phone and the web agree on what an assignment looks like.
  const icon = mapIcon(notification.icon);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? "Unread. " : ""}${notification.title}. ${notification.message}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: unread ? colors.surfaceElevated : colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.glyph, { backgroundColor: `${notification.color}1F` }]}>
        <Ionicons name={icon} size={18} color={notification.color} />
      </View>

      <View style={styles.body}>
        <Text
          style={[styles.rowTitle, { color: colors.text }, unread && styles.rowTitleUnread]}
          numberOfLines={1}
        >
          {notification.title}
        </Text>
        <Text style={[styles.message, { color: colors.textMuted }]} numberOfLines={2}>
          {notification.message}
        </Text>
        <Text style={[styles.when, { color: colors.textMuted }]}>
          {relativeTime(notification.created_at)}
        </Text>
      </View>

      {/* A dot as well as the weight change — colour alone is not a signal. */}
      {unread ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
    </Pressable>
  );
}

/**
 * The server's icon names come from a web icon set; map the ones that differ.
 *
 * Falling back to a bell rather than rendering nothing: a missing glyph on a
 * row that otherwise reads fine is not worth an empty box.
 */
function mapIcon(name: string | undefined): React.ComponentProps<typeof Ionicons>["name"] {
  const known: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
    bell: "notifications",
    "arrow-right": "arrow-forward-circle",
    "arrow-left": "arrow-back-circle",
    check: "checkmark-circle",
    x: "close-circle",
    wrench: "construct",
    clock: "time",
    shield: "shield-checkmark",
    truck: "cube",
  };
  return known[name ?? ""] ?? "notifications";
}

function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.head, fontSize: fontSizes.h1 },
  action: { fontFamily: fonts.bodySemi, fontSize: fontSizes.small },
  chipRow: { flexDirection: "row", gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  glyph: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 1 },
  rowTitle: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.body },
  rowTitleUnread: { fontFamily: fonts.bodySemi },
  message: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  when: { fontFamily: fonts.body, fontSize: 11 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
