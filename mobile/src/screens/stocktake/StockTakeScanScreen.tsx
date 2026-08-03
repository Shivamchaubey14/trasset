/**
 * The counting loop (FR-14.9, FR-14.19).
 *
 * The DoD is a hundred assets scanned in sequence **without leaving the
 * screen**, and everything here follows from that one requirement:
 *
 * * **The camera never closes and nothing is pushed.** A scan updates a tally
 *   and a list in place. The moment a scan navigates somewhere, counting
 *   becomes scan-tap-back-scan and a hundred labels is an afternoon.
 * * **No request per scan.** Reconciliation is local against the list
 *   downloaded when the session opened, so the loop runs at the speed of the
 *   camera rather than the network — and runs at all with no network.
 * * **Duplicates are recognised, not counted.** A camera reads the same label
 *   many times a second; the session returns its state unchanged by reference
 *   for a repeat, so React does no work for the common case.
 * * **The buzz is the feedback that matters.** The user is looking at a shelf,
 *   not at the phone (SRS §12.6). Three different haptics mean three different
 *   things, so the screen can stay unread: a tick for a hit, a warning for
 *   something that does not belong here, and nothing at all for a repeat —
 *   silence is the correct answer to "you already have that one".
 */
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, EmptyState, useToast } from "@/components";
import { useOnline } from "@/net/online";
import { queueSubmission, submissionSummary } from "@/stocktake/submit";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { type ScanOutcome, counts } from "@/stocktake/session";
import { scan as applyScan, setSession, undo, useSession } from "@/stocktake/store";
import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

const BARCODE_TYPES = [
  "qr", "ean13", "ean8", "code39", "code93", "code128",
  "itf14", "upc_a", "upc_e", "datamatrix",
] as const;

/** How long the last outcome stays on screen before fading back to neutral. */
const FLASH_MS = 900;

export function StockTakeScanScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const session = useSession();
  const online = useOnline();

  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<{ outcome: ScanOutcome; tag: string } | null>(null);
  const [sending, setSending] = useState(false);
  const toast = useToast();

  // Refs rather than state: the camera callback fires far faster than React
  // re-renders, and a state flag would be stale for the next dozen frames.
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKey = useRef<string>("");
  const lastAt = useRef(0);

  const onBarcode = useCallback(
    ({ data }: { data: string }) => {
      const tag = (data ?? "").trim();
      if (!tag) return;

      // A cheap guard *before* touching the store: the same label held in
      // frame produces a callback every frame, and while the session would
      // answer "duplicate" harmlessly, doing it 30 times a second is wasted
      // work on a device that is also running a camera.
      const now = Date.now();
      const key = tag.toUpperCase();
      if (key === lastKey.current && now - lastAt.current < 1200) return;
      lastKey.current = key;
      lastAt.current = now;

      const outcome = applyScan(tag, now);

      // Three haptics for three meanings, so the screen need not be read.
      if (outcome === "found") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (outcome === "unexpected") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      setFlash({ outcome, tag });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
    },
    [],
  );

  /**
   * Hand the count over.
   *
   * It goes to the mutation queue rather than the network, so this works
   * identically with a full signal and with none at all — which is the whole
   * point of the day. The queue drains when it can, retries on its own, and
   * keeps a refusal for a person rather than dropping it.
   *
   * The session is only cleared **after** both calls are on disk. Clearing it
   * first would open a window where a crash loses a count that had not yet been
   * queued anywhere.
   */
  const send = useCallback(async () => {
    if (!session) return;
    setSending(true);
    try {
      await queueSubmission(session);
      toast.success(submissionSummary(session, online));
      setSession(null);
      navigation.replace("StockTakeReport", { id: session.stockTakeId });
    } catch {
      // Only a storage failure can land here — the network is not involved.
      // The count stays exactly as it was rather than being thrown away.
      toast.error("Could not save the count on this phone. Nothing was lost — try again.");
    } finally {
      setSending(false);
    }
  }, [navigation, online, session, toast]);

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <EmptyState
          icon="clipboard-outline"
          title="No stock take open"
          message="Start one from the scan tab and the count will appear here."
          actionLabel="Start a stock take"
          onAction={() => navigation.replace("StartStockTake")}
        />
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: spacing.md }}>
        <EmptyState
          icon="camera-outline"
          title="The camera is needed to count"
          message="Trasset reads asset labels through the camera. Nothing is recorded or uploaded."
          actionLabel="Allow the camera"
          onAction={() => void requestPermission()}
        />
      </View>
    );
  }

  const tally = counts(session);
  const flashColour =
    flash?.outcome === "found"
      ? colors.primary
      : flash?.outcome === "unexpected"
        ? colors.accent
        : flash?.outcome === "duplicate"
          ? colors.slate
          : colors.danger;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {/* --- running tally: the reason to look up ------------------------- */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text
          accessibilityRole="header"
          style={[styles.location, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {session.locationName}
        </Text>

        {/*
          One accessible element, not six. Read individually a screen reader
          announces "14", "Found", "1", "Missing" — numbers with no subjects.
          Grouped, it reads the sentence a person actually wants.

          It is also a live region, because this is the one screen where the
          user is looking at a shelf rather than the phone: the tally changing
          *is* the feedback, and without an announcement a blind user has the
          haptic but no running total.
        */}
        <View
          accessible
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
          accessibilityLabel={
            `${tally.found} found, ${tally.missing} missing, ` +
            `${tally.unexpected} unexpected. ` +
            `${tally.found} of ${tally.expected} expected.`
          }
        >
          <View style={styles.tally}>
            <Tally label="Found" value={tally.found} colour={colors.primary} />
            <Tally label="Missing" value={tally.missing} colour={colors.danger} />
            <Tally label="Unexpected" value={tally.unexpected} colour={colors.accent} />
          </View>
          <Text style={[styles.progress, { color: colors.textMuted }]}>
            {tally.found} of {tally.expected} expected · {tally.scanned} scanned
          </Text>
        </View>
      </View>

      {/* --- the camera, which never closes ------------------------------- */}
      <View style={[styles.cameraWrap, { borderColor: flash ? flashColour : colors.border }]}>
        {isFocused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={onBarcode}
          />
        ) : null}

        {flash ? (
          <View style={[styles.flash, { backgroundColor: flashColour }]}>
            <Ionicons
              name={
                flash.outcome === "found"
                  ? "checkmark-circle"
                  : flash.outcome === "duplicate"
                    ? "repeat"
                    : flash.outcome === "unexpected"
                      ? "alert-circle"
                      : "help-circle"
              }
              size={18}
              color={colors.onPrimary}
            />
            <Text style={[styles.flashText, { color: colors.onPrimary }]} numberOfLines={1}>
              {flash.outcome === "duplicate"
                ? `Already counted — ${flash.tag}`
                : flash.outcome === "unexpected"
                  ? `Not from here — ${flash.tag}`
                  : flash.tag}
            </Text>
          </View>
        ) : null}
      </View>

      {/* --- what has just been counted ----------------------------------- */}
      <FlatList
        data={session.scans}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
        ListEmptyComponent={
          <EmptyState
            icon="scan-outline"
            title="Nothing counted yet"
            message="Point the camera at a label. The count stays on this screen."
          />
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.scanRow,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderLeftColor: item.outcome === "found" ? colors.primary : colors.accent,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.tag, { color: colors.text }]}>{item.tag}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                {item.asset ? item.asset.name : "Not expected at this location"}
              </Text>
            </View>
            <Pressable
              onPress={() => undo(item.key)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.tag}`}
            >
              <Ionicons name="close-circle-outline" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
        )}
      />

      <View style={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.md }}>
        <Button
          label={
            online
              ? `Submit ${tally.scanned} ${tally.scanned === 1 ? "scan" : "scans"}`
              : `Finish — send ${tally.scanned} later`
          }
          onPress={send}
          loading={sending}
          disabled={tally.scanned === 0 || sending}
          accessibilityHint={
            online
              ? "Closes the count and reconciles it against the register."
              : "Saves the count on this phone. It sends by itself when you have signal."
          }
        />
      </View>
    </View>
  );
}

function Tally({ label, value, colour }: { label: string; value: number; colour: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.tallyCell}>
      <Text style={[styles.tallyValue, { color: colour }]}>{value}</Text>
      <Text style={[styles.tallyLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  location: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.small },
  tally: { flexDirection: "row", gap: spacing.lg },
  tallyCell: { alignItems: "flex-start" },
  tallyValue: { fontFamily: fonts.head, fontSize: fontSizes.h2 },
  tallyLabel: { fontFamily: fonts.body, fontSize: 11 },
  progress: { fontFamily: fonts.body, fontSize: fontSizes.small },
  cameraWrap: {
    height: 200,
    margin: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  flash: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  flashText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: fontSizes.small },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    padding: spacing.sm,
  },
  tag: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
  meta: { fontFamily: fonts.body, fontSize: fontSizes.small },
});
