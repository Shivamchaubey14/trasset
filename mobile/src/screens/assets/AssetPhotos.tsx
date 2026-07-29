/**
 * Photos on an asset (FR-14.13).
 *
 * Capture is offered to managers only, matching the web and the API — the
 * attachment endpoint is `write_roles = MANAGERS`, so showing the button to
 * anybody else would be offering something the server then refuses.
 *
 * Everyone sees the photos, though. A picture of the damage is exactly what
 * the person holding the asset wants to check against.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Attachment } from "@/api";
import { canWrite } from "@/assets/actions";
import { capturePhoto, pickPhoto, useUploadPhoto } from "@/assets/photos";
import { useAuth } from "@/auth/AuthContext";
import { Card, useToast } from "@/components";
import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

/** The API stores every kind of document; this section shows the images. */
const IMAGE = /\.(jpe?g|png|webp)$/i;

export function AssetPhotos({
  assetId,
  attachments,
}: {
  assetId: number;
  attachments: Attachment[];
}) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const upload = useUploadPhoto();
  const [busy, setBusy] = useState(false);

  const photos = (attachments ?? []).filter(
    (item) => IMAGE.test(item.filename ?? "") || IMAGE.test(String(item.file ?? "")),
  );
  const mayAdd = canWrite(user?.role_name as string | undefined);

  async function add(source: "camera" | "library") {
    setBusy(true);
    try {
      const photo = source === "camera" ? await capturePhoto() : await pickPhoto();
      if (!photo) return; // cancelled, or permission declined — not an error

      await upload.mutateAsync({ assetId, photo });
      toast.success("Photo added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not upload that photo.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!photos.length && !mayAdd) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PHOTOS</Text>

      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {photos.map((photo) => (
            <Image
              key={photo.id}
              source={{ uri: String(photo.file) }}
              style={[styles.thumb, { backgroundColor: colors.surfaceElevated }]}
              accessibilityLabel={photo.description || photo.filename || "Asset photo"}
            />
          ))}
        </ScrollView>
      ) : (
        <Card>
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            No photos yet. A picture of the condition now is worth an argument
            later.
          </Text>
        </Card>
      )}

      {mayAdd ? (
        <View style={styles.actions}>
          <PhotoButton
            icon="camera-outline"
            label={busy ? "Working…" : "Take a photo"}
            onPress={() => add("camera")}
            disabled={busy}
          />
          <PhotoButton
            icon="images-outline"
            label="Choose one"
            onPress={() => add("library")}
            disabled={busy}
          />
        </View>
      ) : null}
    </View>
  );
}

function PhotoButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.photoButton,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={[styles.photoLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.2 },
  strip: { gap: spacing.sm, paddingRight: spacing.md },
  thumb: { width: 108, height: 108, borderRadius: radius.md },
  empty: { fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: 20 },
  actions: { flexDirection: "row", gap: spacing.sm },
  photoButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  photoLabel: { fontFamily: fonts.bodySemi, fontSize: fontSizes.small },
});
