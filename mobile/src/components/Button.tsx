/**
 * Button. Minimal on purpose — it predates the full primitive set, and is
 * what the sign-in form needs and no more.
 */
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";

import { MIN_TARGET, fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /**
   * What happens when it is pressed, for a screen reader.
   *
   * Only where the label cannot say it on its own — "Finish" does not convey
   * that a count will send by itself later. A hint on an obvious button is
   * noise read aloud on every focus, so most buttons should not have one.
   */
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const background =
    variant === "primary" ? colors.primary : variant === "secondary" ? colors.surface : "transparent";
  const foreground =
    variant === "primary" ? colors.onPrimary : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background,
          borderColor: variant === "secondary" ? colors.border : "transparent",
          borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth : 0,
          // Pressed state rather than hover — there is no cursor here.
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={[styles.label, { color: foreground }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TARGET,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  label: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
});
