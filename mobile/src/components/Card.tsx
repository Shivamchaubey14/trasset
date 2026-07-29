/**
 * Card — the web's white surface with a 12px radius (SRS §7.3), adapted.
 *
 * The web separates a card from the page with a soft shadow. That cue is much
 * weaker on a dark surface, so elevation is carried by *value* here — a border
 * plus a lighter surface — and the shadow is a light-mode extra rather than
 * the mechanism.
 */
import React from "react";
import { StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";

import { radius, spacing, useTheme } from "@/theme";

interface Props extends ViewProps {
  /** Raised surface, for rows sitting on top of another card. */
  elevated?: boolean;
  padded?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export function Card({ elevated, padded = true, style, children, ...rest }: Props) {
  const { colors, dark } = useTheme();

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: elevated ? colors.surfaceElevated : colors.surface,
          borderColor: colors.border,
          padding: padded ? spacing.md : 0,
        },
        !dark && styles.shadow,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  shadow: {
    shadowColor: "#253D4E",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
