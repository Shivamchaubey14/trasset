/**
 * Photo capture and upload (FR-14.13).
 *
 * **Resize before upload, always.** A modern phone camera produces a 12-megapixel
 * JPEG of 4–8 MB. Sending that over mobile data from a stock room is slow
 * enough to look broken, expensive for whoever is paying for the connection,
 * and pointless — the picture exists to show a scratch on a laptop lid, and
 * 1600px does that as well as 4032px. The API's own ceiling is 10 MB (SEC-8),
 * so an unresized burst of photos would also start bouncing.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { api } from "@/api";
import type { Attachment } from "@/api";

/** Long edge. Enough to read a serial number off a label, far short of 12 MP. */
const MAX_EDGE = 1600;
const QUALITY = 0.7;

export interface CapturedPhoto {
  uri: string;
  name: string;
  /** After resize, so the UI can show what it is about to send. */
  sizeBytes?: number;
}

/**
 * Shrink to something sendable. Returns the original on failure rather than
 * throwing — a photo that is too big is better than no photo at all, and the
 * server's own limit is the backstop.
 */
async function shrink(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_EDGE } }],
      { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    return uri;
  }
}

function filenameFor(uri: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = uri.split(".").pop()?.split("?")[0] ?? "jpg";
  return `photo-${stamp}.${extension.length <= 4 ? extension : "jpg"}`;
}

/** Take a new photo. Returns null when the user backs out or declines. */
export async function capturePhoto(): Promise<CapturedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 1, // captured at full quality, then shrunk deliberately below
    exif: false, // no need to ship GPS coordinates to the server (MNFR-8)
  });
  if (result.canceled || !result.assets?.length) return null;

  const uri = await shrink(result.assets[0].uri);
  return { uri, name: filenameFor(uri) };
}

/** Choose an existing photo — a picture taken before the app was opened. */
export async function pickPhoto(): Promise<CapturedPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets?.length) return null;

  const uri = await shrink(result.assets[0].uri);
  return { uri, name: filenameFor(uri) };
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      assetId,
      photo,
      description,
    }: {
      assetId: number;
      photo: CapturedPhoto;
      description?: string;
    }) => {
      const form = new FormData();
      form.append("asset", String(assetId));
      form.append("description", description ?? "");
      // React Native's FormData takes this shape for a file; the platform
      // reads the URI and sets the multipart boundary itself, which is why the
      // client never sets Content-Type on an upload.
      form.append("file", {
        uri: photo.uri,
        name: photo.name,
        type: "image/jpeg",
      } as unknown as Blob);

      return api.upload<Attachment>("/attachments/", form);
    },

    onSuccess(_attachment, { assetId }) {
      // The detail screen lists attachments off the asset record.
      queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
    },
  });
}
