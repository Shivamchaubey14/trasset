"""Audit vocabulary (SRS §4.1, FR-13.1)."""
from django.db import models


class AuditAction(models.TextChoices):
    """What happened. Domain verbs sit alongside the generic CRUD ones so the
    log reads like a story rather than a stream of 'update' rows."""

    CREATE = "create", "Created"
    UPDATE = "update", "Updated"
    DELETE = "delete", "Deleted"
    RESTORE = "restore", "Restored"

    ASSIGN = "assign", "Assigned"
    CHECKIN = "checkin", "Checked in"
    RETIRE = "retire", "Retired"

    REQUEST = "request", "Requested"
    APPROVE = "approve", "Approved"
    REJECT = "reject", "Rejected"
    CANCEL = "cancel", "Cancelled"

    LOGIN = "login", "Signed in"
    LOGIN_FAILED = "login_failed", "Sign-in failed"
    LOGOUT = "logout", "Signed out"
    PASSWORD_CHANGE = "password_change", "Password changed"
    PASSWORD_RESET = "password_reset", "Password reset"


#: Colours the audit table uses for action pills, kept inside the brand palette.
ACTION_COLORS = {
    AuditAction.CREATE: "#3BB77E",
    AuditAction.UPDATE: "#253D4E",
    AuditAction.DELETE: "#E5484D",
    AuditAction.RESTORE: "#3BB77E",
    AuditAction.ASSIGN: "#253D4E",
    AuditAction.CHECKIN: "#3BB77E",
    AuditAction.RETIRE: "#7B8794",
    AuditAction.REQUEST: "#FDC040",
    AuditAction.APPROVE: "#3BB77E",
    AuditAction.REJECT: "#E5484D",
    AuditAction.CANCEL: "#7B8794",
    AuditAction.LOGIN: "#3BB77E",
    AuditAction.LOGIN_FAILED: "#E5484D",
    AuditAction.LOGOUT: "#7B8794",
    AuditAction.PASSWORD_CHANGE: "#FDC040",
    AuditAction.PASSWORD_RESET: "#FDC040",
}

#: Models whose changes are recorded. Add "app_label.ModelName" to extend.
TRACKED_MODELS = (
    "assets.Asset",
    "accounts.User",
    "masters.Category",
    "masters.Location",
    "masters.Department",
    "masters.Vendor",
)

#: Never written to the log — secrets, or noise that changes on every save.
EXCLUDED_FIELDS = frozenset({
    "password",
    "last_login",
    "failed_login_attempts",
    "locked_until",
    "created_at",
    "updated_at",
})
