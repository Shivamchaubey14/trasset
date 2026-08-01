/**
 * Unsent actions — the screen that stops queued work disappearing.
 *
 * FR-14.27 requires that no failure is silent. The queue already keeps refused
 * actions rather than dropping them; this is where a person finally sees them,
 * and it is the only place they can be resolved.
 *
 * Every row says three things — what you tried, what happened, what to do —
 * because a status code next to an identifier tells a developer everything and
 * a store keeper nothing.
 *
 * **Retry is deliberately not offered on everything.** Re-sending a 409 would
 * be refused identically; the button would do nothing but move the item to the
 * back of the queue while looking like progress. Those rows offer "Open the
 * asset" instead, since the only real next step is to see where it stands now
 * and decide again.
 *
 * Discard is the one irreversible thing here, so it always confirms and always
 * names what is being thrown away.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, EmptyState, useToast } from "@/components";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { queue } from "@/offline/queue";
import { useQueueItems } from "@/offline/queue/QueueProvider";
import { explainFailure, needsAttention } from "@/offline/queue/explain";
import type { QueuedMutation } from "@/offline/queue/types";
import { describeAge } from "@/offline/freshness";
import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

export function ConflictsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const items = useQueueItems();

  const attention = items.filter(needsAttention);
  const waiting = items.filter((i) => i.status === "pending" || i.status === "sending");

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: spacing.md,
        paddingBottom: insets.bottom + spacing.xl,
        gap: spacing.md,
        flexGrow: 1,
      }}
    >
      {attention.length === 0 && waiting.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="Nothing waiting"
          message="Everything you have done has reached the server."
        />
      ) : null}

      {attention.length ? (
        <>
          <Text style={[styles.section, { color: colors.textMuted }]}>NEEDS YOU</Text>
          {attention.map((item) => (
            <ConflictRow key={item.id} item={item} />
          ))}
        </>
      ) : null}

      {waiting.length ? (
        <>
          <Text style={[styles.section, { color: colors.textMuted }]}>ON ITS WAY</Text>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.body, { color: colors.text }]}>
              {waiting.length} {waiting.length === 1 ? "action is" : "actions are"} queued and
              will send when you have signal.
            </Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              Nothing to do — they are retried automatically.
            </Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function ConflictRow({ item }: { item: QueuedMutation }) {
  const { colors } = useTheme();
  const toast = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const explanation = explainFailure(item);

  const onRetry = useCallback(async () => {
    await queue.retry(item.id);
    void queue.drain();
    toast.show("Trying again…");
  }, [item.id, toast]);

  const onOpen = useCallback(() => {
    if (item.subject.type === "asset") {
      navigation.navigate("Asset", { id: item.subject.id });
    } else if (item.subject.type === "stocktake") {
      navigation.navigate("StockTakeReport", { id: item.subject.id });
    } else {
      navigation.navigate("Request", { id: item.subject.id });
    }
  }, [item.subject, navigation]);

  const onDiscard = useCallback(() => {
    // Named, and confirmed. This is the only irreversible action on the screen,
    // and the thing being thrown away is work the user believes they did.
    Alert.alert(
      "Discard this action?",
      `"${explanation.title}" will not be sent, and cannot be recovered.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            await queue.discard(item.id);
            toast.show("Discarded.");
          },
        },
      ],
    );
  }, [explanation.title, item.id, toast]);

  const blocked = item.status === "blocked";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderLeftWidth: 3,
          borderLeftColor: blocked ? colors.slate : colors.danger,
        },
      ]}
    >
      <View style={styles.head}>
        <Ionicons
          name={blocked ? "pause-circle-outline" : "alert-circle-outline"}
          size={20}
          color={blocked ? colors.slate : colors.danger}
        />
        <Text style={[styles.title, { color: colors.text }]}>{explanation.title}</Text>
      </View>

      <Text style={[styles.body, { color: colors.text }]}>{explanation.happened}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>{explanation.advice}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        Queued {describeAge(item.createdAt)}
      </Text>

      <View style={styles.actions}>
        {explanation.actions.includes("retry") ? (
          <Button label="Try again" onPress={onRetry} />
        ) : null}
        {explanation.actions.includes("open") ? (
          <Button
            label={
              item.subject.type === "asset"
                ? "Open the asset"
                : item.subject.type === "stocktake"
                  ? "Open the stock take"
                  : "Open the request"
            }
            variant="secondary"
            onPress={onOpen}
          />
        ) : null}
        <Button label="Discard" variant="ghost" onPress={onDiscard} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.2 },
  card: {
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 2 },
  title: { flex: 1, fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
  body: { fontFamily: fonts.body, fontSize: fontSizes.body, lineHeight: 21 },
  meta: { fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: 19 },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
