/**
 * Text input with a label and inline error, mirroring the web's form pattern
 * (SRS §7.3: top labels, focus ring in Nest Green, validation in Coral).
 */
import { Ionicons } from "@expo/vector-icons";
import React, { forwardRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

import { MIN_TARGET, fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  /** Renders a show/hide toggle and starts masked. */
  secure?: boolean;
}

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, secure, style, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>

      <View
        style={[
          styles.field,
          { backgroundColor: colors.surface, borderColor },
          // A focus ring rather than a colour change alone: colour by itself
          // is not a sufficient signal (NFR-9).
          focused && !error ? { borderWidth: 2 } : null,
        ]}
      >
        <TextInput
          ref={ref}
          style={[styles.input, { color: colors.text }, style]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secure && !revealed}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          {...rest}
        />

        {secure ? (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.small },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: MIN_TARGET,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSizes.body,
    paddingVertical: spacing.sm,
  },
  error: { fontFamily: fonts.body, fontSize: fontSizes.small },
});
