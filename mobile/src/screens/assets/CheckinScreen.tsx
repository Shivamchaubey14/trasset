/**
 * Check an asset back in (FR-14.11, FR-4.2).
 *
 * Simpler than assigning — there is no "to whom" — but it carries the one
 * thing check-in is uniquely placed to record: **what condition it came back
 * in**. Nobody else will ever be closer to that fact than the person holding
 * it right now, so the notes field is prominent rather than tucked away.
 *
 * Location is optional and offered because equipment routinely comes back to a
 * different room from the one it left (FR-4.2 supports it server-side).
 */
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/api";
import type { Location, Page } from "@/api";
import { newIdempotencyKey, useCheckinAsset } from "@/assets/mutations";
import { Button, Chip, ConflictSheet, TextField, useToast } from "@/components";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { fonts, fontSizes, spacing, useTheme } from "@/theme";

export function CheckinScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const route = useRoute<RouteProp<RootStackParamList, "Checkin">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { assetId, assetTag, holderName } = route.params;

  const [notes, setNotes] = useState("");
  const [locationId, setLocationId] = useState<number | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [idempotencyKey] = useState(newIdempotencyKey);

  const checkin = useCheckinAsset();

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<Page<Location>>("/locations/", { page_size: 100 }),
    staleTime: 10 * 60_000,
  });

  function submit() {
    checkin.mutate(
      { assetId, notes, locationId, idempotencyKey },
      {
        onSuccess(outcome) {
          // Told apart on purpose. "Checked in" when nothing has reached the
          // server yet is the lie FR-14.27 exists to prevent — the person walks
          // away believing it is done.
          if (outcome.queued) toast.show(`${assetTag} will check in when you are back online`);
          else toast.success(`${assetTag} checked in`);
          navigation.goBack();
        },
        onError(error) {
          if (error instanceof ApiError && error.isConflict) {
            setConflict(error.message);
            return;
          }
          toast.error(
            error instanceof ApiError ? error.message : "Could not check this asset in.",
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
          gap: spacing.md,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.lead, { color: colors.textMuted }]}>
          {holderName
            ? `${assetTag} is currently held by ${holderName}.`
            : `Checking in ${assetTag}.`}
        </Text>

        <TextField
          label="Condition notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Any damage, missing accessories, or nothing at all"
          multiline
          numberOfLines={3}
          style={{ minHeight: 72, textAlignVertical: "top" }}
        />

        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.label, { color: colors.textMuted }]}>
            RETURNED TO (OPTIONAL)
          </Text>
          <View style={styles.chips}>
            {(locations.data?.results ?? []).map((location) => (
              <Chip
                key={location.id}
                label={location.name}
                selected={locationId === location.id}
                onPress={() => setLocationId(locationId === location.id ? null : location.id)}
              />
            ))}
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Leave this alone to keep the asset where the register already has it.
          </Text>
        </View>

        <Button label="Check in" onPress={submit} loading={checkin.isPending} />
      </ScrollView>

      <ConflictSheet
        visible={Boolean(conflict)}
        message={conflict ?? ""}
        onResolve={() => {
          setConflict(null);
          navigation.goBack();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.body, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.5 },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  hint: { fontFamily: fonts.body, fontSize: 12 },
});
