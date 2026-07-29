/**
 * Which actions an asset offers, given its state and the viewer's role.
 *
 * Mirrors `frontend/js/asset-detail.js` exactly — assign only from Available,
 * check in only from Assigned, retire only while not terminal, and nothing at
 * all for a role that cannot write. Divergence here would mean the phone
 * offering a button the API then refuses, which reads as a broken app rather
 * than a permission boundary.
 *
 * This is the *presentation* rule only. The server enforces the same
 * constraints independently (SEC-3, and the Day 8 state machine), so hiding a
 * button is a courtesy, never the control.
 *
 * Deliberately narrower than the web (§12.8): no Edit and no Delete. Editing an
 * asset is a form-shaped task that belongs on a large screen, and deleting is
 * not something anyone should do one-handed in a stock room.
 */
import type { AssetStatus } from "@/theme";

export type AssetAction = "assign" | "checkin" | "report" | "retire";

/** Statuses an asset cannot leave (SRS §11.2). */
const TERMINAL: AssetStatus[] = ["retired", "lost", "disposed"];

const MANAGER_ROLES = ["super_admin", "asset_manager"];

export interface ActionSpec {
  action: AssetAction;
  label: string;
  /** Primary gets the filled button; there is at most one. */
  primary: boolean;
  destructive?: boolean;
  /**
   * True when the action cannot be queued offline (§12.5). Retirement is a
   * decision with consequences that are hard to unwind, so it is online-only
   * rather than something that quietly applies hours later.
   */
  onlineOnly?: boolean;
}

export function isTerminal(status: AssetStatus): boolean {
  return TERMINAL.includes(status);
}

export function canWrite(roleName?: string | null): boolean {
  return MANAGER_ROLES.includes(roleName ?? "");
}

export function availableActions(
  status: AssetStatus,
  roleName?: string | null,
): ActionSpec[] {
  const actions: ActionSpec[] = [];

  // Anyone signed in may report a problem with an asset (FR-14.14). An
  // employee holding a broken laptop is exactly who notices first, and making
  // that a manager-only action means it never gets reported.
  const report: ActionSpec = {
    action: "report",
    label: "Report an issue",
    primary: false,
  };

  if (!canWrite(roleName)) {
    return isTerminal(status) ? [] : [report];
  }

  if (status === "available") {
    actions.push({ action: "assign", label: "Assign", primary: true });
  } else if (status === "assigned") {
    actions.push({ action: "checkin", label: "Check in", primary: true });
  }

  if (!isTerminal(status)) {
    actions.push(report);
    actions.push({
      action: "retire",
      label: "Retire",
      primary: false,
      destructive: true,
      onlineOnly: true,
    });
  }

  return actions;
}

/**
 * Why an asset offers no primary action, in words worth showing. "Under
 * maintenance" is not a failure state and should not read like one.
 */
export function stateExplanation(status: AssetStatus): string | null {
  switch (status) {
    case "under_maintenance":
      return "This asset is being worked on, so it cannot be assigned until the maintenance is completed.";
    case "retired":
      return "This asset has been retired and is no longer in service.";
    case "lost":
      return "This asset is recorded as lost.";
    case "disposed":
      return "This asset has been disposed of.";
    default:
      return null;
  }
}
