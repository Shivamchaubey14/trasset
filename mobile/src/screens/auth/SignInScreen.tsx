/**
 * Sign in (FR-14.1).
 *
 * The same credentials as the web, returning the same JWT pair — but with
 * `X-Client: mobile`, so the refresh token lasts 30 days instead of 7 (BE-1).
 */
import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { fonts, fontSizes, spacing, useTheme } from "@/theme";

export function SignInScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setFormError(null);

    // Validate locally first so an obvious mistake costs no round trip — the
    // point being felt most on a bad connection.
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = "Enter your email address.";
    if (!password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setBusy(true);
    try {
      await signIn(email, password);
    } catch (error) {
      if (error instanceof ApiError) {
        const field = error.firstFieldError();
        if (field) setFieldErrors({ [field.field]: field.message });
        // The server's sentence is more useful than anything invented here: it
        // distinguishes a wrong password from a locked account (FR-1.5).
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Text style={[styles.wordmark, { color: colors.primary }]}>
            Tr<Text style={{ color: colors.text }}>asset</Text>
          </Text>
          <Text style={[styles.tagline, { color: colors.textMuted }]}>
            Sign in to scan, assign and count.
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="Email"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setFieldErrors((prev) => ({ ...prev, email: "" }));
            }}
            error={fieldErrors.email || null}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder="you@company.com"
            editable={!busy}
          />

          <TextField
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setFieldErrors((prev) => ({ ...prev, password: "" }));
            }}
            error={fieldErrors.password || null}
            secure
            textContentType="password"
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={submit}
            placeholder="••••••••"
            editable={!busy}
          />

          {formError ? (
            <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
              <Text
                style={[styles.bannerText, { color: colors.danger }]}
                accessibilityLiveRegion="assertive"
              >
                {formError}
              </Text>
            </View>
          ) : null}

          <Button label="Sign in" onPress={submit} loading={busy} />
        </View>

        <Text style={[styles.footnote, { color: colors.textMuted }]}>
          Forgot your password? Reset it on the Trasset website — the link is
          emailed to you.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl, flexGrow: 1, justifyContent: "center" },
  brand: { gap: spacing.xs },
  wordmark: { fontFamily: fonts.head, fontSize: 40 },
  tagline: { fontFamily: fonts.body, fontSize: fontSizes.body },
  form: { gap: spacing.md },
  banner: {
    borderRadius: 8,
    borderLeftWidth: 3,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  bannerText: { fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: 20 },
  footnote: { fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: 20 },
});
