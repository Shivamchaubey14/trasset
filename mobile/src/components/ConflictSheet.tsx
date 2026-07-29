/**
 * A 409, presented as something to resolve (SRS §12.5).
 *
 * The scenario: you scanned an asset, chose a holder, and while you were
 * choosing, somebody else issued it. The server refuses with a sentence that
 * already says what happened and what to do — "TRA-2026-000019 is already
 * assigned to Karan Verma. Check it in before assigning it again."
 *
 * Two things this must not do. It must not read as an error the user caused:
 * they did nothing wrong, the world moved. And it must not simply dismiss,
 * leaving them looking at a screen showing state that is now false — so the
 * only way out refreshes.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

import { Button } from "./Button";

export function ConflictSheet({
  visible,
  message,
  onResolve,
  resolveLabel = "See the current state",
}: {
  visible: boolean;
  /** The server's sentence. It is more specific than anything we could write. */
  message: string;
  onResolve: () => void;
  resolveLabel?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onResolve}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          {/* Cream Yolk, not Coral: this is a state to reconcile, not a
              failure. Colouring it red would tell the user they broke
              something they did not. */}
          <View style={[styles.badge, { backgroundColor: `${colors.accent}22` }]}>
            <Ionicons name="git-compare-outline" size={22} color={colors.accent} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Someone got there first
          </Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>{message}</Text>

          <Button label={resolveLabel} onPress={onResolve} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: radius.md * 2,
    borderTopRightRadius: radius.md * 2,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.head, fontSize: fontSizes.h3 },
  body: {
    fontFamily: fonts.body,
    fontSize: fontSizes.body,
    lineHeight: fontSizes.body * 1.5,
    marginBottom: spacing.sm,
  },
});
