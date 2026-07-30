/**
 * Who may do what with an asset request (FR-14.16, FR-14.17).
 *
 * Mirrors the server exactly — `AssetRequestViewSet.action_roles` puts approve
 * and reject behind `Roles.APPROVERS`, and leaves creating a request open to
 * everyone signed in. As with `assets/actions.ts`, this is the *presentation*
 * rule only: the server enforces the same boundary independently (SEC-3), so
 * hiding a button is a courtesy and never the control.
 *
 * **Approvals are deliberately not queueable offline** (SRS §12.5). Assigning
 * an asset can be replayed safely; approving a request hands equipment to a
 * named person and sends them a notification, which is hard to unwind if it
 * turns out to have been applied hours later against a stale view of the world.
 * So a decision requires a live connection, and says so.
 */
import { isApprover, isReadOnly } from "@/auth/roles";
import type { RequestStatus } from "@/theme";

export function canApprove(roleName?: string | null): boolean {
  return isApprover(roleName);
}

/**
 * Anyone signed in may raise a request — except an auditor.
 *
 * `AssetRequestViewSet` declares `write_roles = Roles.ALL`, which reads as
 * "everyone", but that is not the whole rule: `HasRolePermission` refuses every
 * unsafe method for a read-only role *before* it consults what the view
 * declares ("An auditor is read-only everywhere, no matter what a view
 * declares"). Reading `write_roles` alone and concluding an auditor may post is
 * the mistake this comment exists to prevent — it would put a Request button in
 * front of the one role guaranteed to get a 403 from it.
 */
export function canRaise(roleName?: string | null): boolean {
  return !isReadOnly(roleName);
}

/** Only the requester, and only while nobody has decided it. */
export function canCancel(
  status: RequestStatus,
  requesterId: number | null | undefined,
  viewerId: number | null | undefined,
): boolean {
  return status === "pending" && Boolean(viewerId) && requesterId === viewerId;
}

/**
 * Whether this request still needs a decision from an approver.
 *
 * Distinct from `canApprove`: the role question and the state question are
 * different, and a settled request offers nothing to anybody.
 */
export function isDecidable(status: RequestStatus, roleName?: string | null): boolean {
  return status === "pending" && canApprove(roleName);
}

/**
 * Why a settled request offers no actions, in words worth showing.
 *
 * "Cancelled" is not a failure and should not read like one.
 */
export function stateExplanation(status: RequestStatus): string | null {
  switch (status) {
    case "approved":
      return "This request was approved and the asset handed over.";
    case "rejected":
      return "This request was turned down.";
    case "cancelled":
      return "This request was withdrawn by the person who raised it.";
    default:
      return null;
  }
}
