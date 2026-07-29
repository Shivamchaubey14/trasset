/**
 * Skeleton loader.
 *
 * A shape where the content will be, not a spinner. On a slow connection a
 * spinner says only "wait"; a skeleton says what is coming and stops the
 * layout jumping when it lands.
 *
 * Honours `prefers-reduced-motion` via the OS setting: a pulsing screen is
 * genuinely unpleasant for some people, and the skeleton still communicates
 * perfectly well without the animation.
 */
import React, { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

import { radius, spacing, useTheme } from "@/theme";

export function Skeleton({
  width = "100%",
  height = 14,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.9, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius.sm,
          backgroundColor: colors.border,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

/** A stand-in for one row of a list, so the page does not jump when data lands. */
export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={40} height={40} style={{ borderRadius: 20 }} />
      <View style={styles.rowText}>
        <Skeleton width="60%" height={13} />
        <Skeleton width="35%" height={11} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  rowText: { flex: 1, gap: spacing.sm },
});
