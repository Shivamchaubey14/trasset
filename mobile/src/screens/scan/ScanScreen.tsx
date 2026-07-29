/**
 * Scan (FR-14.6 – FR-14.9) — the reason the app exists.
 *
 * Design notes that are not obvious from the code:
 *
 * * **Haptics on a hit.** The user is usually holding the phone at a shelf and
 *   looking at the *asset*, not the screen (SRS §12.6). The buzz is the
 *   feedback that matters; the visual confirmation is secondary.
 * * **A scan is locked while one is resolving.** A camera fires the same code
 *   many times a second, and without the lock a single label would launch a
 *   dozen requests and push a dozen screens.
 * * **Every failure is a state with a way out**, never a silent no-op. A user
 *   pointing a camera at a label that will not resolve has no idea whether the
 *   app saw it at all unless it says so.
 */
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, EmptyState } from "@/components";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { isScannable } from "@/scan/parse";
import { type ScanOutcome, resolveScan } from "@/scan/resolve";
import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** QR for Trasset's own labels, 1D for manufacturer barcodes (FR-14.7). */
const BARCODE_TYPES = [
  "qr",
  "ean13",
  "ean8",
  "code39",
  "code93",
  "code128",
  "itf14",
  "upc_a",
  "upc_e",
  "datamatrix",
] as const;

export function ScanScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();

  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);

  // A ref, not state: the camera callback fires faster than React re-renders,
  // so a state flag would let several scans through before the first lands.
  const locked = useRef(false);

  const handleScan = useCallback(
    async (raw: string) => {
      if (locked.current || !isScannable(raw)) return;
      locked.current = true;
      setBusy(true);

      // Fires before the request, because the user needs to know the *scan*
      // registered — whether it resolves is a separate question.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      const result = await resolveScan(raw);
      setBusy(false);

      if (result.status === "found") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setOutcome(null);
        locked.current = false;
        navigation.navigate("Asset", { id: result.asset.id, asset: result.asset });
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setOutcome(result);
    },
    [navigation],
  );

  const resume = useCallback(() => {
    setOutcome(null);
    locked.current = false;
  }, []);

  // --- permissions ---------------------------------------------------------
  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  if (!permission.granted) {
    // Two different situations wearing the same face. If we can still ask, ask.
    // If the user has already said no once, the OS will not show the dialog
    // again — sending them to Settings is the only honest option, and saying
    // so beats a button that appears to do nothing.
    const canAsk = permission.canAskAgain;

    return (
      <View style={[styles.center, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <EmptyState
          icon="camera-outline"
          title="Trasset needs the camera"
          message={
            canAsk
              ? "Scanning an asset's label is how you look it up, assign it, or count it during a stock take."
              : "Camera access was turned down earlier. Open Settings to allow it, then come back."
          }
          actionLabel={canAsk ? "Allow camera" : "Open Settings"}
          onAction={canAsk ? requestPermission : () => Linking.openSettings()}
        />
        <Button
          label="Enter a tag instead"
          variant="ghost"
          onPress={() => navigation.navigate("ManualEntry")}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Unmounted when the tab is not focused: leaving the camera running in
          the background drains the battery and, on some Android devices, locks
          the sensor so other apps cannot use it. */}
      {isFocused && AppState.currentState === "active" ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={outcome || busy ? undefined : ({ data }) => handleScan(data)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />
      )}

      {/* Reticle */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={[styles.reticle, { borderColor: busy ? colors.accent : "#FFFFFF" }]} />
        <Text style={styles.hint}>
          {busy ? "Looking it up…" : "Point at the label on the asset"}
        </Text>
      </View>

      {/* Manual entry is always reachable — a damaged or missing label is
          common, and a scanner with no fallback is a dead end (FR-14.8). */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          onPress={() => navigation.navigate("ManualEntry")}
          style={[styles.manualButton, { backgroundColor: colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Enter a tag or serial by hand"
        >
          <Ionicons name="keypad-outline" size={18} color={colors.text} />
          <Text style={[styles.manualLabel, { color: colors.text }]}>Enter by hand</Text>
        </Pressable>
      </View>

      {outcome && outcome.status !== "found" ? (
        <ScanFailure outcome={outcome} onDismiss={resume} onManual={() => {
          resume();
          navigation.navigate("ManualEntry");
        }} />
      ) : null}
    </View>
  );
}

/**
 * What happened, and what to do about it. Distinguishing these matters: "not
 * in Trasset" and "you are offline" call for completely different actions from
 * the person holding the phone.
 */
function ScanFailure({
  outcome,
  onDismiss,
  onManual,
}: {
  outcome: ScanOutcome;
  onDismiss: () => void;
  onManual: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { title, message } = describe(outcome);

  return (
    <View style={[styles.sheetBackdrop, { paddingBottom: insets.bottom }]}>
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sheetBody, { color: colors.textMuted }]}>{message}</Text>

        {outcome.status !== "error" ? (
          <View style={[styles.codeBox, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.code, { color: colors.textMuted }]} numberOfLines={2}>
              {outcome.scan.raw}
            </Text>
          </View>
        ) : null}

        <Button label="Scan again" onPress={onDismiss} />
        <Button label="Enter by hand" variant="ghost" onPress={onManual} />
      </View>
    </View>
  );
}

function describe(outcome: ScanOutcome): { title: string; message: string } {
  switch (outcome.status) {
    case "notFound":
      return outcome.scan.kind === "tag"
        ? {
            title: "No asset with that tag",
            message:
              "The label scanned correctly, but nothing in Trasset carries this tag. It may have been disposed of, or the label may belong to another system.",
          }
        : {
            title: "Not recognised",
            message:
              "That barcode does not match any asset's serial number. Trasset's own labels are QR codes — try the label on the asset itself, or enter the tag by hand.",
          };
    case "ambiguous":
      return {
        title: "More than one match",
        message: `${outcome.count} assets share that serial number, so it is not safe to guess. Search for it instead.`,
      };
    case "error":
      return outcome.offline
        ? {
            title: "You are offline",
            message:
              "The scan registered, but the asset could not be looked up. Recently viewed assets are still available from the Assets tab.",
          }
        : { title: "Could not look it up", message: outcome.message };
    default:
      return { title: "", message: "" };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  reticle: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderRadius: radius.md * 2,
    backgroundColor: "transparent",
  },
  hint: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.body,
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
  actions: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  manualButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  manualLabel: { fontFamily: fonts.bodySemi, fontSize: fontSizes.small },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.md * 2,
    borderTopRightRadius: radius.md * 2,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: { fontFamily: fonts.head, fontSize: fontSizes.h3 },
  sheetBody: { fontFamily: fonts.body, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.5 },
  codeBox: { borderRadius: radius.sm, padding: spacing.sm, marginVertical: spacing.xs },
  code: { fontFamily: fonts.body, fontSize: fontSizes.small },
});
