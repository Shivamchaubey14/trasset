/**
 * Avatar — an image when there is one, initials when there is not.
 *
 * Initials are the fallback rather than a generic person glyph because a list
 * of identical grey silhouettes tells the reader nothing, while two letters
 * distinguish holders at a glance.
 */
import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { fonts, useTheme } from "@/theme";

export function initialsOf(name?: string | null, fallback = "?"): string {
  if (!name?.trim()) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || fallback;
}

export function Avatar({
  name,
  uri,
  size = 40,
}: {
  name?: string | null;
  uri?: string | null;
  size?: number;
}) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);

  const box = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  // A broken image URL degrades to initials rather than to an empty square —
  // on bad signal that is the common case, not the exception.
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[box, { backgroundColor: colors.surfaceElevated }]}
        onError={() => setFailed(true)}
        accessibilityLabel={name ? `${name}'s photo` : "Avatar"}
      />
    );
  }

  return (
    <View
      style={[box, styles.center, { backgroundColor: colors.primary }]}
      accessible
      accessibilityLabel={name ?? "Unknown user"}
    >
      <Text
        style={[
          styles.initials,
          { color: colors.onPrimary, fontSize: Math.round(size * 0.38) },
        ]}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: fonts.head },
});
