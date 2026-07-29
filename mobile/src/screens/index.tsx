/**
 * Tab roots. Each is a placeholder until its phase arrives — the shell is
 * what Day 36 delivers, not the content.
 */
import React from "react";

import { Placeholder } from "@/components/Placeholder";

export function ScanScreen() {
  return (
    <Placeholder
      day="Day 40"
      title="Scan"
      subtitle="The reason the app exists. Point the camera at a label and land on the asset."
      planned={[
        "QR and 1D barcode scanning with expo-camera (FR-14.6, FR-14.7)",
        "Resolve through GET /assets/by-tag/ — one call, one asset (BE-6)",
        "Haptic feedback on a hit: the user is often not looking at the screen",
        "Manual entry when a label is damaged (FR-14.8)",
        "Entry point for a stock take, with a banner to resume an open session",
      ]}
    />
  );
}

export function AssetsScreen() {
  return (
    <Placeholder
      day="Days 41–42"
      title="Assets"
      subtitle="What you hold, and the register when you need to look something up."
      planned={[
        "My assets (FR-14.12)",
        "Register search by name, tag or serial — a deliberately narrower filter set than the web",
        "Asset detail: status, holder, location, warranty, value (FR-14.10)",
        "Assign and check in with the same 409 guards as the API (FR-14.11)",
      ]}
    />
  );
}

export function RequestsScreen() {
  return (
    <Placeholder
      day="Day 45"
      title="Requests"
      subtitle="Raise a request, or approve one between meetings."
      planned={[
        "Raise a request for a specific asset or a category (FR-14.16)",
        "Approvals inbox with approve and reject-with-reason (FR-14.17)",
        "Role-aware: the same screen reads differently for an employee and an approver",
      ]}
    />
  );
}

export function NotificationsScreen() {
  return (
    <Placeholder
      day="Day 46"
      title="Alerts"
      subtitle="Mirrors the in-app notification list, and opens the right record when a push is tapped."
      planned={[
        "Register this device for push against POST /auth/devices/ (BE-2)",
        "Deep links from a tapped push — trasset://assets/12 (FR-14.23, BE-3)",
        "Foreground, background and cold-start handling",
        "In-app list mirroring /notifications/ with unread badges (FR-14.24)",
      ]}
    />
  );
}

export function ProfileScreen() {
  return (
    <Placeholder
      day="Day 47"
      title="Profile"
      subtitle="Your account, your preferences, and anything waiting to sync."
      planned={[
        "Profile and password change",
        "Notification preferences — email and push are separate consents (BE-3)",
        "Theme override; dark mode follows the system until then",
        "Offline queue: what is pending, what failed, and why (FR-14.27)",
        "Sign out — blacklists the refresh token and deregisters the device",
      ]}
    />
  );
}
