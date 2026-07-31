/**
 * Assign an asset (FR-14.11).
 *
 * The picker is a searchable list rather than a dropdown: an organisation has
 * more people than fit a wheel, and the person doing this is usually standing
 * in front of whoever is receiving the equipment, so typing two letters of
 * their name is the fastest path.
 */
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/api";
import type { Page, User } from "@/api";
import {
  Avatar,
  Button,
  ConflictSheet,
  EmptyState,
  SkeletonRow,
  TextField,
  useToast,
} from "@/components";
import { newIdempotencyKey, useAssignAsset } from "@/assets/mutations";
import { useDebounced } from "@/hooks/useDebounced";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

export function AssignScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const route = useRoute<RouteProp<RootStackParamList, "Assign">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { assetId, assetTag } = route.params;

  const [rawSearch, setRawSearch] = useState("");
  const [selected, setSelected] = useState<User | null>(null);
  const [notes, setNotes] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);

  // One key for this submission, generated once. Regenerating on each attempt
  // would make BE-4 useless — the server would see two different actions.
  const [idempotencyKey] = useState(newIdempotencyKey);

  const search = useDebounced(rawSearch.trim());
  const assign = useAssignAsset();

  const people = useQuery({
    queryKey: ["users", search],
    queryFn: () =>
      api.get<Page<User>>("/users/", {
        page_size: 30,
        is_active: true,
        ...(search ? { search } : {}),
      }),
  });

  const rows = useMemo(() => people.data?.results ?? [], [people.data]);

  function submit() {
    if (!selected) return;

    assign.mutate(
      { assetId, user: selected, notes, idempotencyKey },
      {
        onSuccess(outcome) {
          // Queued is not done, and must not be reported as done.
          if (outcome.queued) {
            toast.show(`${assetTag} will be assigned to ${selected.full_name} when you are back online`);
          } else {
            toast.success(`${assetTag} assigned to ${selected.full_name}`);
          }
          navigation.goBack();
        },
        onError(error) {
          if (error instanceof ApiError && error.isConflict) {
            // Not a failure the user caused — handled on its own path.
            setConflict(error.message);
            return;
          }
          toast.error(
            error instanceof ApiError ? error.message : "Could not assign this asset.",
          );
        },
      },
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: 220 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
            <Text style={[styles.lead, { color: colors.textMuted }]}>
              Who is taking {assetTag}?
            </Text>
            <TextField
              label="Search people"
              value={rawSearch}
              onChangeText={setRawSearch}
              placeholder="Name or email"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        }
        renderItem={({ item }) => (
          <PersonRow
            person={item}
            selected={selected?.id === item.id}
            onPress={() => setSelected(selected?.id === item.id ? null : item)}
          />
        )}
        ListEmptyComponent={
          people.isLoading ? (
            <View style={{ gap: spacing.sm }}>
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (
            <EmptyState
              icon="people-outline"
              title="Nobody matched"
              message="Try part of their name or email address."
            />
          )
        }
      />

      {/* Pinned so the action is reachable without scrolling back past a long
          list of people. */}
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
        {selected ? (
          <TextField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Condition, accessories, anything worth recording"
          />
        ) : null}

        <Button
          label={selected ? `Assign to ${selected.full_name}` : "Choose a person"}
          onPress={submit}
          disabled={!selected}
          loading={assign.isPending}
        />
      </View>

      <ConflictSheet
        visible={Boolean(conflict)}
        message={conflict ?? ""}
        onResolve={() => {
          setConflict(null);
          // Back to detail, which refetches — leaving them on a form for an
          // asset somebody else now holds would be worse than useless.
          navigation.goBack();
        }}
      />
    </View>
  );
}

function PersonRow({
  person,
  selected,
  onPress,
}: {
  person: User;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={person.full_name ?? person.email}
      style={({ pressed }) => [
        styles.person,
        {
          backgroundColor: colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Avatar name={person.full_name} uri={person.avatar as string | null} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {person.full_name}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {person.email}
          {person.department_name ? ` · ${person.department_name}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.body, fontSize: fontSizes.body },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  name: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
  meta: { fontFamily: fonts.body, fontSize: 12 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
