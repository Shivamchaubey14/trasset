/**
 * Status pill (SRS §7.3).
 *
 * The colour comes from the theme's status map, so *Assigned* is Ink on light
 * and a lifted Steel on dark — the meaning is identical, the value is not,
 * because Ink on a dark surface is invisible.
 *
 * The label is always rendered. Colour alone is not a status indicator: it
 * fails for anyone who cannot distinguish the hues, and it fails completely
 * for a screen reader (NFR-9).
 *
 * **The label is the normal text colour, not the status colour.** The first
 * version of this component put the status colour as text on a tint of itself,
 * which measured 1.45:1 for Cream Yolk on light — a third of the 4.5:1
 * requirement, and unreadable in practice. Every warm hue fails that way,
 * because a tint of a colour is by definition close to the colour. So the
 * colour now lives in the dot and the tint, where it is decorative and free to
 * be subtle, and the *meaning* lives in the word, where it is legible.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  type AssetStatus,
  type RequestStatus,
  fonts,
  radius,
  useTheme,
} from "@/theme";

/**
 * Both vocabularies, in one map.
 *
 * An asset is available/assigned/…; a request is pending/approved/…. The key
 * sets are disjoint, so one pill serves both and the caller does not have to
 * say which kind it is holding.
 */
const LABELS: Record<AssetStatus | RequestStatus, string> = {
  available: "Available",
  assigned: "Assigned",
  under_maintenance: "Under maintenance",
  retired: "Retired",
  lost: "Lost",
  disposed: "Disposed",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export function StatusPill({
  status,
  label,
  small,
}: {
  status: AssetStatus | RequestStatus;
  /** Override when the server supplies its own display label. */
  label?: string;
  small?: boolean;
}) {
  const { colors, status: statusColors } = useTheme();
  const colour = statusColors[status];
  const text = label ?? LABELS[status] ?? status;

  return (
    <View
      style={[
        styles.pill,
        small && styles.small,
        // A tint rather than a solid fill: a row of saturated blocks fights the
        // content it is meant to annotate. Kept faint so the label reads at
        // essentially its contrast against the card itself.
        { backgroundColor: `${colour}1F`, borderColor: `${colour}44` },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${text}`}
    >
      <View style={[styles.dot, { backgroundColor: colour }]} />
      <Text style={[styles.label, small && styles.labelSmall, { color: colors.text }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  small: { paddingHorizontal: 8, paddingVertical: 3, gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontFamily: fonts.bodySemi, fontSize: 12 },
  labelSmall: { fontSize: 11 },
});
