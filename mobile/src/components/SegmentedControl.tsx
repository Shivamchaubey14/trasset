/**
 * Segmented control — one choice from a small, fixed set.
 *
 * Used where a switch would be wrong because there are three states rather
 * than two, and where a picker would be wrong because every option should be
 * readable without a tap. Appearance (System / Light / Dark) is the first case
 * of both.
 *
 * Selection is carried by fill, by weight *and* by `accessibilityState`, never
 * by colour alone (NFR-9) — the same rule `Chip` follows with its tick. The
 * fill uses `primary`/`onPrimary`, matching `Button` and `Chip`; see the note in
 * `scripts/verify-settings.ts` about what that pairing measures in light.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MIN_TARGET, fonts, radius, spacing, useTheme } from "@/theme";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Announced instead of `label` when the label alone is ambiguous aloud. */
  accessibilityLabel?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            style={({ pressed }) => [
              styles.segment,
              {
                backgroundColor: selected ? colors.primary : "transparent",
                opacity: pressed && !selected ? 0.6 : 1,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                {
                  // Weight carries the state as well as the fill, so the
                  // control still reads under a grayscale accessibility filter.
                  fontFamily: selected ? fonts.bodySemi : fonts.bodyMedium,
                  color: selected ? colors.onPrimary : colors.textMuted,
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const PADDING = 3;

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    borderRadius: radius.sm + PADDING,
    borderWidth: StyleSheet.hairlineWidth,
    padding: PADDING,
    gap: PADDING,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    // Full height rather than Chip's 34: this is the primary control of its
    // row, and the segments are the only targets in it.
    minHeight: MIN_TARGET - PADDING * 2,
    paddingHorizontal: spacing.sm,
  },
  label: { fontSize: 14 },
});
