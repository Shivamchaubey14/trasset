/**
 * Component gallery (Day 39 DoD).
 *
 * Every primitive, rendered in light *and* dark on one screen. Two reasons it
 * earns its place rather than being a toy:
 *
 * 1. A contrast problem is obvious side by side and invisible when you have to
 *    change an OS setting and relaunch to compare.
 * 2. It is the first place a new primitive gets used, so anything awkward to
 *    use shows up here before it is wired into thirty screens.
 *
 * Development only — reached from Profile, and only when `__DEV__`.
 */
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Avatar,
  Button,
  Card,
  EmptyState,
  OfflineBanner,
  SegmentedControl,
  Skeleton,
  SkeletonRow,
  StatusPill,
  TextField,
  useToast,
} from "@/components";
import {
  type AssetStatus,
  ThemeProvider,
  fonts,
  fontSizes,
  spacing,
  useTheme,
} from "@/theme";

const STATUSES: AssetStatus[] = [
  "available",
  "assigned",
  "under_maintenance",
  "retired",
  "lost",
  "disposed",
];

export function GalleryScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
    >
      {/* Nested providers force a scheme, so both themes sit side by side. */}
      <ThemeProvider scheme="light">
        <Panel label="Light" topInset={insets.top} />
      </ThemeProvider>
      <ThemeProvider scheme="dark">
        <Panel label="Dark" />
      </ThemeProvider>
    </ScrollView>
  );
}

function Panel({ label, topInset = 0 }: { label: string; topInset?: number }) {
  const { colors, series } = useTheme();
  const toast = useToast();
  const [text, setText] = useState("");
  // Local state rather than the real theme preference: a gallery should not
  // change the app's settings as a side effect of being looked at.
  const [segment, setSegment] = useState("system");

  return (
    <View
      style={{
        backgroundColor: colors.bg,
        padding: spacing.md,
        paddingTop: topInset + spacing.md,
        gap: spacing.lg,
      }}
    >
      <Text style={[styles.panelTitle, { color: colors.text }]}>{label}</Text>

      <Section title="Buttons">
        <Button label="Primary" onPress={() => toast.success("Primary pressed")} />
        <Button label="Secondary" variant="secondary" onPress={() => toast.show("Secondary")} />
        <Button label="Ghost" variant="ghost" onPress={() => toast.error("Something failed")} />
        <Button label="Loading" onPress={() => {}} loading />
        <Button label="Disabled" onPress={() => {}} disabled />
      </Section>

      <Section title="Status pills">
        <View style={styles.wrap}>
          {STATUSES.map((status) => (
            <StatusPill key={status} status={status} />
          ))}
        </View>
      </Section>

      <Section title="Avatars">
        <View style={[styles.wrap, { alignItems: "center" }]}>
          <Avatar name="Karan Verma" size={48} />
          <Avatar name="Priya Nair" size={40} />
          <Avatar name="Trasset Administrator" size={32} />
          {/* A deliberately broken URL, to show the fallback rather than an empty box. */}
          <Avatar name="Broken Image" uri="https://example.invalid/nope.png" size={40} />
        </View>
      </Section>

      <Section title="Card">
        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Dell Latitude 5440</Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
            TRA-2026-000019 · Head Office
          </Text>
          <View style={{ height: spacing.sm }} />
          <StatusPill status="assigned" small />
        </Card>
        <Card elevated>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
            Elevated surface — used for rows on top of another card.
          </Text>
        </Card>
      </Section>

      <Section title="Input">
        <TextField
          label="Asset tag"
          value={text}
          onChangeText={setText}
          placeholder="TRA-2026-000001"
          autoCapitalize="characters"
        />
        <TextField
          label="Password"
          value="wrong-one"
          onChangeText={() => {}}
          secure
          error="That password is incorrect."
        />
      </Section>

      <Section title="Segmented control">
        <SegmentedControl
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          value={segment}
          onChange={setSegment}
          accessibilityLabel="Appearance (demo)"
        />
      </Section>

      <Section title="Offline banner">
        <OfflineBanner visible />
        <OfflineBanner visible pendingCount={3} cachedAt={new Date(Date.now() - 8 * 60_000)} />
      </Section>

      <Section title="Skeletons">
        <Skeleton width="70%" height={18} />
        <SkeletonRow />
        <SkeletonRow />
      </Section>

      <Section title="Empty states">
        <Card padded={false}>
          <EmptyState
            title="No assets yet"
            message="Assets you are holding will appear here."
          />
        </Card>
        <Card padded={false}>
          <EmptyState
            tone="error"
            title="Could not load"
            message="The server did not respond."
            actionLabel="Try again"
            onAction={() => toast.show("Retrying…")}
          />
        </Card>
        <Card padded={false}>
          <EmptyState
            tone="offline"
            title="You are offline"
            message="Recently viewed assets are still available."
          />
        </Card>
      </Section>

      <Section title="Category / chart series">
        <View style={styles.wrap}>
          {series.map((colour, index) => (
            <View key={colour} style={styles.swatchBox}>
              <View style={[styles.swatch, { backgroundColor: colour }]} />
              <Text style={[styles.swatchLabel, { color: colors.textMuted }]}>{index + 1}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Type scale">
        <Text style={{ fontFamily: fonts.head, fontSize: fontSizes.h1, color: colors.text }}>
          H1 Quicksand
        </Text>
        <Text style={{ fontFamily: fonts.head, fontSize: fontSizes.h2, color: colors.text }}>
          H2 Quicksand
        </Text>
        <Text style={{ fontFamily: fonts.head, fontSize: fontSizes.h3, color: colors.text }}>
          H3 Quicksand
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: fontSizes.body, color: colors.text }}>
          Body Lexend — the quick brown fox jumps over the lazy dog.
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: fontSizes.small, color: colors.textMuted }}>
          Small Lexend, secondary colour — checked at 4.5:1 on every surface.
        </Text>
      </Section>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panelTitle: { fontFamily: fonts.head, fontSize: fontSizes.h2 },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.2 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cardTitle: { fontFamily: fonts.head, fontSize: fontSizes.h3 },
  cardMeta: { fontFamily: fonts.body, fontSize: fontSizes.small },
  swatchBox: { alignItems: "center", gap: 2 },
  swatch: { width: 30, height: 30, borderRadius: 6 },
  swatchLabel: { fontFamily: fonts.body, fontSize: 10 },
});
