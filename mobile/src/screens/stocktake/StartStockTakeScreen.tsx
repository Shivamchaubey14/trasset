/**
 * Opening a counting session (FR-14.18).
 *
 * Two things happen here and the order matters: the session is opened on the
 * server, then the location's whole expected list is downloaded **before**
 * anyone starts walking. A session that discovers page three is missing halfway
 * round a store room is worse than one that refused to start, because by then
 * the person has already counted things they will have to count again.
 *
 * That download is also what makes the next screen work with no signal at all,
 * which is the only condition a store room reliably offers.
 */
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/api";
import type { Location, Page } from "@/api";
import { Button, EmptyState, SkeletonRow } from "@/components";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { fetchExpected, startStockTake } from "@/stocktake/api";
import { createSession } from "@/stocktake/session";
import { setSession } from "@/stocktake/store";
import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

export function StartStockTakeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [selected, setSelected] = useState<Location | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locations = useQuery({
    queryKey: ["locations", "for-stocktake"],
    queryFn: () => api.get<Page<Location>>("/locations/", { page_size: 100 }),
    staleTime: 10 * 60_000,
  });

  const begin = useCallback(async () => {
    if (!selected) return;
    setError(null);

    try {
      setPreparing("Opening the session…");
      const stockTake = await startStockTake(selected.id);

      setPreparing("Downloading the expected list…");
      const expected = await fetchExpected(selected.id);

      setSession(createSession(stockTake.id, selected.id, selected.name, expected));
      setPreparing(null);
      // Replace, not push: coming "back" to a start screen from inside a live
      // session would invite starting a second one.
      navigation.replace("StockTakeScan");
    } catch (err) {
      setPreparing(null);
      setError(
        err instanceof ApiError
          ? // A 409 is the useful case: someone else already has this room open.
            err.message
          : "Could not start the stock take.",
      );
    }
  }, [navigation, selected]);

  const rows = locations.data?.results ?? [];

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
      <Text style={[styles.lead, { color: colors.textMuted }]}>
        Pick the room you are standing in. Everything the register places there
        is downloaded now, so the count works with no signal.
      </Text>

      {locations.isLoading ? (
        <View style={{ gap: spacing.sm }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title="No locations"
          message="A stock take counts one location at a time, so there has to be at least one."
        />
      ) : (
        rows.map((location) => {
          const active = selected?.id === location.id;
          return (
            <Pressable
              key={location.id}
              onPress={() => setSelected(location)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                  borderWidth: active ? 2 : StyleSheet.hairlineWidth,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons
                name={active ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={active ? colors.primary : colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{location.name}</Text>
                {location.address ? (
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                    {location.address}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {preparing ? (
        <Text style={[styles.meta, { color: colors.textMuted }]}>{preparing}</Text>
      ) : null}

      <Button
        label="Start counting"
        onPress={begin}
        disabled={!selected || Boolean(preparing)}
        loading={Boolean(preparing)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  name: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
  meta: { fontFamily: fonts.body, fontSize: fontSizes.small },
  error: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.small },
});
