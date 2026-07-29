/**
 * Filter chip. A toggle that looks like a tag.
 *
 * Selection is shown by fill *and* a tick, not by colour alone — the same
 * reason the tab icons switch between filled and outlined (NFR-9).
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { fonts, radius, spacing, useTheme } from "@/theme";

export function Chip({
  label,
  selected,
  onPress,
  count,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {selected ? (
        <Ionicons name="checkmark" size={13} color={colors.onPrimary} />
      ) : null}
      <Text
        style={[
          styles.label,
          { color: selected ? colors.onPrimary : colors.text },
        ]}
      >
        {label}
        {typeof count === "number" ? ` (${count})` : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    // 34px tall rather than 44: chips sit in a row of their own and are not
    // the primary target on the screen, and full-height chips push the list
    // below the fold.
    paddingVertical: 8,
  },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13 },
});
