/**
 * Tab roots. Each is a placeholder until its phase arrives — the shell is
 * what Day 36 delivers, not the content.
 */
import React from "react";

import { Placeholder } from "@/components/Placeholder";

export { ProfileScreen } from "./ProfileScreen";
export { ScanScreen } from "./scan/ScanScreen";

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

