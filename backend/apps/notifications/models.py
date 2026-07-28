"""In-app notifications (SRS §4.1, FR-12.1)."""
from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel

from .constants import TYPE_STYLES, NotificationType


class NotificationQuerySet(models.QuerySet):
    def unread(self):
        return self.filter(is_read=False)

    def for_user(self, user):
        return self.filter(user=user)

    def mark_all_read(self):
        return self.filter(is_read=False).update(
            is_read=True, read_at=timezone.now()
        )


class Notification(TimeStampedModel):
    """
    One thing a person should know about.

    ``related_object_type`` / ``related_object_id`` are stored as plain values
    rather than a generic foreign key: a notification must survive the thing it
    refers to being deleted, and it should never keep a row alive just by
    pointing at it. ``link`` carries where to go, so the UI needs no lookup
    table of its own.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=32, choices=NotificationType.choices)
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)

    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    related_object_type = models.CharField(max_length=60, blank=True)
    related_object_id = models.CharField(max_length=40, blank=True)
    link = models.CharField(
        max_length=255, blank=True,
        help_text="Frontend path this notification points at.",
    )

    #: Whether an email was sent for this one — so a retry cannot double-send.
    emailed_at = models.DateTimeField(null=True, blank=True)

    objects = NotificationQuerySet.as_manager()

    class Meta:
        db_table = "notifications"
        ordering = ("-created_at", "-id")
        indexes = [
            # SRS §4.3
            models.Index(fields=["user", "is_read"], name="idx_notif_user_read"),
            models.Index(fields=["user", "-created_at"], name="idx_notif_user_date"),
        ]

    def __str__(self):
        return f"{self.get_type_display()} → {self.user_id}"

    def mark_read(self):
        if self.is_read:
            return self
        self.is_read = True
        self.read_at = timezone.now()
        self.save(update_fields=["is_read", "read_at", "updated_at"])
        return self

    @property
    def icon(self) -> str:
        return TYPE_STYLES.get(self.type, ("bell", "#7B8794"))[0]

    @property
    def color(self) -> str:
        return TYPE_STYLES.get(self.type, ("bell", "#7B8794"))[1]
