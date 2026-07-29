/**
 * Tab roots. Each is a placeholder until its phase arrives — the shell is
 * what Day 36 delivers, not the content.
 */
import React from "react";

import { Placeholder } from "@/components/Placeholder";

export { AssetsScreen } from "./assets/AssetsScreen";
export { ProfileScreen } from "./ProfileScreen";
export { ScanScreen } from "./scan/ScanScreen";

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

