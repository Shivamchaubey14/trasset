/**
 * Raise a request (FR-14.16).
 *
 * A request names **either** a specific asset ("I want TRA-2026-000014") or a
 * category ("I need a laptop"), which is the server's rule and worth surfacing
 * as two explicit modes rather than two optional fields — filling both in and
 * being told off afterwards is the failure this avoids.
 *
 * Reached two ways, and the mode follows: from this tab, where nobody has an
 * asset in mind and the category path is the natural one; and from an asset's
 * own screen, where the asset is already the subject and arrives prefilled.
 *
 * **"Needed by" is a set of relative choices, not a calendar.** The question a
 * requester is answering is *how soon*, and on a phone a date picker to express
 * "next week" is three taps and a mental date calculation for something the app
 * can work out. It also keeps a native date-picker dependency out of the build.
 */
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/api";
import type { Asset, Category, Page } from "@/api";
import { Button, Chip, EmptyState, TextField, useToast } from "@/components";
import { useDebounced } from "@/hooks/useDebounced";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { newIdempotencyKey, useCreateRequest } from "@/requests/mutations";
import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

type Target = "asset" | "category";

/** Mirrors `AssetRequestCreateSerializer.validate_reason`. */
const MIN_REASON = 10;

const WHEN_CHOICES: { label: string; days: number | null }[] = [
  { label: "No date", days: null },
  { label: "Today", days: 0 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
  { label: "In a month", days: 30 },
];

export function NewRequestScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const route = useRoute<RouteProp<RootStackParamList, "NewRequest">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const prefilled = route.params?.assetId
    ? { id: route.params.assetId, tag: route.params.assetTag ?? `#${route.params.assetId}` }
    : null;

  const [target, setTarget] = useState<Target>(prefilled ? "asset" : "category");
  const [assetId, setAssetId] = useState<number | null>(prefilled?.id ?? null);
  const [assetTag, setAssetTag] = useState<string | null>(prefilled?.tag ?? null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [whenDays, setWhenDays] = useState<number | null>(null);
  const [rawSearch, setRawSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // One key for this submission, generated once — a new key per retry would
  // defeat BE-4 and could raise the same request twice.
  const [idempotencyKey] = useState(newIdempotencyKey);

  const search = useDebounced(rawSearch.trim());
  const create = useCreateRequest();

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Page<Category>>("/categories/", { page_size: 100 }),
    staleTime: 10 * 60_000, // master data barely moves
    enabled: target === "category",
  });

  // Only assets that can actually be requested. A terminal one is refused by
  // the serializer, so offering it would be offering a dead end.
  const assets = useQuery({
    queryKey: ["assets", "requestable", search],
    queryFn: () =>
      api.get<Page<Asset>>("/assets/", {
        page_size: 20,
        ...(search ? { search } : {}),
      }),
    enabled: target === "asset" && search.length > 1,
  });

  const assetRows = useMemo(
    () => (assets.data?.results ?? []).filter((asset) => !isTerminal(asset.status as string)),
    [assets.data],
  );

  const neededBy = whenDays === null ? null : isoDaysFromToday(whenDays);

  function submit() {
    if (target === "asset" && !assetId) {
      setError("Choose which asset you are asking for, or switch to a category.");
      return;
    }
    if (target === "category" && !categoryId) {
      setError("Choose a category, or name a specific asset instead.");
      return;
    }
    if (reason.trim().length < MIN_REASON) {
      // The same rule the server applies, checked here so a slow connection is
      // not spent on a round trip that was always going to fail.
      setError(
        "Give a bit more detail — at least 10 characters, so whoever reviews this knows why it is needed.",
      );
      return;
    }

    setError(null);
    create.mutate(
      {
        ...(target === "asset" ? { assetId } : { categoryId }),
        reason: reason.trim(),
        neededBy,
        idempotencyKey,
      },
      {
        onSuccess() {
          toast.success("Request raised. An approver will see it.");
          navigation.goBack();
        },
        onError(err) {
          // The server's sentence is better than anything invented here — it
          // knows about duplicate pending requests and terminal assets.
          setError(
            err instanceof ApiError ? err.message : "Could not raise this request.",
          );
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.label, { color: colors.textMuted }]}>WHAT DO YOU NEED?</Text>

          {prefilled ? (
            // Arrived from an asset. Offering the category mode here would
            // discard the one thing we already know.
            <Text style={[styles.lead, { color: colors.text }]}>{prefilled.tag}</Text>
          ) : (
            <>
              <View style={[styles.segmented, { backgroundColor: colors.surfaceElevated }]}>
                {(["category", "asset"] as Target[]).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => {
                      setTarget(value);
                      setError(null);
                      // Clearing the other side keeps the payload honest: the
                      // server rejects a request that names both.
                      if (value === "category") {
                        setAssetId(null);
                        setAssetTag(null);
                      } else {
                        setCategoryId(null);
                      }
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: target === value }}
                    style={[
                      styles.segment,
                      target === value && { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentLabel,
                        { color: target === value ? colors.text : colors.textMuted },
                      ]}
                    >
                      {value === "category" ? "Any of a kind" : "A specific asset"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {target === "category" ? (
                <View style={styles.chips}>
                  {(categories.data?.results ?? []).map((category) => (
                    <Chip
                      key={category.id}
                      label={category.name}
                      selected={categoryId === category.id}
                      onPress={() => {
                        setCategoryId(categoryId === category.id ? null : category.id);
                        setError(null);
                      }}
                    />
                  ))}
                  {categories.isLoading ? (
                    <Text style={[styles.hint, { color: colors.textMuted }]}>
                      Loading categories…
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  <TextField
                    label="Search the register"
                    value={rawSearch}
                    onChangeText={setRawSearch}
                    placeholder="Name, tag or serial"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {assetTag ? (
                    <Text style={[styles.selected, { color: colors.text }]}>
                      Asking for {assetTag}
                    </Text>
                  ) : null}
                  {assetRows.map((asset) => (
                    <Pressable
                      key={asset.id}
                      onPress={() => {
                        setAssetId(asset.id);
                        setAssetTag(`${asset.asset_tag} — ${asset.name}`);
                        setError(null);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: assetId === asset.id }}
                      style={[
                        styles.assetRow,
                        {
                          backgroundColor: colors.surface,
                          borderColor: assetId === asset.id ? colors.primary : colors.border,
                          borderWidth: assetId === asset.id ? 2 : StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      <Text style={[styles.assetName, { color: colors.text }]} numberOfLines={1}>
                        {asset.name}
                      </Text>
                      <Text style={[styles.hint, { color: colors.textMuted }]} numberOfLines={1}>
                        {asset.asset_tag} · {(asset as { status_label?: string }).status_label}
                      </Text>
                    </Pressable>
                  ))}
                  {search.length > 1 && !assets.isLoading && !assetRows.length ? (
                    <EmptyState
                      icon="search-outline"
                      title="Nothing matched"
                      message="Try part of the name, tag or serial number."
                    />
                  ) : null}
                </View>
              )}
            </>
          )}
        </View>

        <TextField
          label="Why do you need it?"
          value={reason}
          onChangeText={(value) => {
            setReason(value);
            setError(null);
          }}
          placeholder="Mine will not hold a charge and I am on site all week."
          multiline
          numberOfLines={4}
          style={{ minHeight: 96, textAlignVertical: "top" }}
        />

        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.label, { color: colors.textMuted }]}>WHEN DO YOU NEED IT?</Text>
          <View style={styles.chips}>
            {WHEN_CHOICES.map((choice) => (
              <Chip
                key={choice.label}
                label={choice.label}
                selected={whenDays === choice.days}
                onPress={() => setWhenDays(choice.days)}
              />
            ))}
          </View>
        </View>

        {error ? (
          <Text style={[styles.error, { color: colors.danger }]} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}

        <Button label="Raise the request" onPress={submit} loading={create.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Statuses an asset cannot leave (SRS §11.2) — mirrors `assets/actions.ts`. */
function isTerminal(status: string): boolean {
  return ["retired", "lost", "disposed"].includes(status);
}

/** A plain `yyyy-mm-dd` in the device's own timezone, which is what the API wants. */
function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.2 },
  hint: { fontFamily: fonts.body, fontSize: 12 },
  selected: { fontFamily: fonts.bodySemi, fontSize: fontSizes.small },
  error: { fontFamily: fonts.body, fontSize: fontSizes.small },
  segmented: { flexDirection: "row", borderRadius: radius.sm, padding: 3 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.sm - 2 },
  segmentLabel: { fontFamily: fonts.bodySemi, fontSize: fontSizes.small },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  assetRow: { borderRadius: radius.md, padding: spacing.md, gap: 2 },
  assetName: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
});
