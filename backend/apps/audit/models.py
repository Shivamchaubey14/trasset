"""Immutable audit trail (SRS §4.1, FR-13.1, FR-13.2, SEC-9)."""
from django.conf import settings
from django.db import models

from .constants import ACTION_COLORS, AuditAction


class AuditLog(models.Model):
    """
    One row per recorded action.

    Rows are append-only: ``save()`` refuses updates and ``delete()`` raises,
    so the trail cannot be rewritten from application code (FR-13.2). Note this
    is an application-level guarantee — a database superuser can still touch the
    table, so production should also restrict DB grants on it.

    ``created_at`` uses ``auto_now_add`` and there is deliberately no
    ``updated_at``: an audit row has no second state.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
        null=True,
        blank=True,
        help_text="Null for anonymous or system actions.",
    )
    #: Kept as text so the row still reads correctly after a user is deleted.
    user_display = models.CharField(max_length=200, blank=True)

    action = models.CharField(max_length=24, choices=AuditAction.choices, db_index=True)
    entity_type = models.CharField(max_length=60, db_index=True)
    entity_id = models.CharField(max_length=40, blank=True)
    #: Human label for the record, e.g. "TRA-2026-000014 — Dell Latitude 5440".
    entity_label = models.CharField(max_length=255, blank=True)

    changes = models.JSONField(
        default=dict, blank=True,
        help_text="{field: {'from': old, 'to': new}} plus any action context.",
    )

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    request_path = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ("-created_at", "-id")
        verbose_name = "audit log"
        indexes = [
            # SRS §4.3
            models.Index(fields=["entity_type", "entity_id"], name="idx_audit_entity"),
            models.Index(fields=["user", "-created_at"], name="idx_audit_user_date"),
            models.Index(fields=["action", "-created_at"], name="idx_audit_action_date"),
        ]

    def __str__(self):
        return f"{self.get_action_display()} {self.entity_type} #{self.entity_id}"

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise ValueError("Audit records are immutable and cannot be edited.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Audit records are immutable and cannot be deleted.")

    @property
    def action_color(self) -> str:
        return ACTION_COLORS.get(self.action, "#7B8794")

    @property
    def changed_fields(self) -> list:
        """Field names that actually moved, ignoring any context keys."""
        return [
            key for key, value in (self.changes or {}).items()
            if isinstance(value, dict) and "from" in value
        ]
