/**
 * Temporary screen body for tabs whose real content lands in Phases 7–8.
 *
 * It exists so the navigation shell can be walked and reviewed now, and so
 * every tab proves the theme, fonts and safe-area handling before any real
 * screen is written. Delete it as each screen arrives.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

type Props = {
  title: string;
  subtitle: string;
  /** What this screen will do once built — from SRS §12.3. */
  planned: string[];
  day: string;
};

export function Placeholder({ title, subtitle, planned, day }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: spacing.md,
        paddingTop: insets.top + spacing.md,
        gap: spacing.md,
      }}
    >
      <View>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.cardHead, { color: colors.textMuted }]}>
          PLANNED — {day}
        </Text>
        {planned.map((item) => (
          <View key={item} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.rowText, { color: colors.text }]}>{item}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.head, fontSize: fontSizes.h1 },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.body,
    marginTop: spacing.xs,
    lineHeight: fontSizes.body * 1.5,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  rowText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSizes.body,
    lineHeight: fontSizes.body * 1.5,
  },
});
