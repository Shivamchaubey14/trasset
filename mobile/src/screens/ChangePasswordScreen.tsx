/**
 * Change password (FR-1.4).
 *
 * Three fields because the server asks for three, and the third is not
 * ceremony: a mistyped new password that is confirmed by the same typo would
 * lock someone out of their own account with no way to tell what happened.
 *
 * Errors are shown **on the field the server named**. Django's password
 * validators produce genuinely useful sentences — too short, too common, too
 * like your email — and collapsing them into one banner throws away which
 * input to fix. `ApiError.errors` carries them per field, so they are placed
 * per field.
 *
 * The session deliberately survives. `PasswordChangeView` does not blacklist
 * the refresh token, so the phone stays signed in — which is right for a change
 * the user just made themselves on this device, and is why the toast says so
 * rather than dumping them at the sign-in screen.
 */
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/api";
import { Button, TextField, useToast } from "@/components";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { fonts, fontSizes, spacing, useTheme } from "@/theme";

type Field = "current_password" | "new_password" | "confirm_password";

export function ChangePasswordScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () =>
      api.post("/auth/password/change/", {
        current_password: current,
        new_password: next,
        confirm_password: confirm,
      }),
    onSuccess() {
      toast.success("Password changed. You are still signed in on this device.");
      navigation.goBack();
    },
    onError(error) {
      if (!(error instanceof ApiError)) {
        setFormError("Could not change your password.");
        return;
      }

      // Anything the server attributed to a field goes on that field; anything
      // it did not — including `non_field_errors` — becomes the form message.
      const placed: Partial<Record<Field, string>> = {};
      let leftover: string | null = null;

      for (const [key, value] of Object.entries(error.errors ?? {})) {
        const message = Array.isArray(value) ? value.join(" ") : String(value);
        if (key === "current_password" || key === "new_password" || key === "confirm_password") {
          placed[key] = message;
        } else if (!leftover) {
          leftover = message;
        }
      }

      setFieldErrors(placed);
      setFormError(
        Object.keys(placed).length ? null : leftover ?? error.message,
      );
    },
  });

  function submit() {
    // The two checks worth making before a round trip, because both have an
    // answer the server would only repeat.
    if (!current || !next || !confirm) {
      setFormError("Fill in all three fields.");
      return;
    }
    if (next !== confirm) {
      setFieldErrors({ confirm_password: "The two passwords do not match." });
      setFormError(null);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    change.mutate();
  }

  /** Typing in a field clears its error — a stale message reads as unfixable. */
  function edit(field: Field, setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
      setFormError(null);
    };
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
          Your new password must differ from the current one and meet the same
          rules the web app uses.
        </Text>

        <TextField
          label="Current password"
          value={current}
          onChangeText={edit("current_password", setCurrent)}
          error={fieldErrors.current_password}
          secure
          autoComplete="current-password"
          textContentType="password"
        />
        <TextField
          label="New password"
          value={next}
          onChangeText={edit("new_password", setNext)}
          error={fieldErrors.new_password}
          secure
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <TextField
          label="Confirm new password"
          value={confirm}
          onChangeText={edit("confirm_password", setConfirm)}
          error={fieldErrors.confirm_password}
          secure
          autoComplete="new-password"
          textContentType="newPassword"
        />

        {formError ? (
          <Text style={[styles.error, { color: colors.danger }]}>{formError}</Text>
        ) : null}

        <Button
          label="Change password"
          onPress={submit}
          loading={change.isPending}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: 20 },
  error: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.small },
});
