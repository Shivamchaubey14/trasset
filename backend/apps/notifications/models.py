"""In-app notifications (SRS §4.1, FR-12.1)."""
from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel

from .constants import (
    DEEP_LINK_SCHEME,
    DEEP_LINK_TARGETS,
    TYPE_STYLES,
    NotificationType,
)


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

    #: When push was *dispatched* — not proof of delivery. One notification can
    #: go to several devices, each with its own task and its own fate, so this
    #: records that the fan-out happened rather than that every handset got it.
    pushed_at = models.DateTimeField(null=True, blank=True)

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
    def deep_link(self) -> str:
        """
        Where a tapped push should open (FR-14.23).

        ``link`` cannot serve for this — it holds a web path like
        ``asset-detail.html?id=12``, which means nothing to a native app. The
        related object is what both clients actually have in common, so the
        target is derived from it.
        """
        target = DEEP_LINK_TARGETS.get(self.related_object_type)
        if target and self.related_object_id:
            return f"{DEEP_LINK_SCHEME}://{target}/{self.related_object_id}"
        return f"{DEEP_LINK_SCHEME}://notifications"

    def push_payload(self) -> dict:
        """The ``data`` an app routes on when the notification is tapped."""
        return {
            "notification_id": str(self.pk),
            "type": self.type,
            "deep_link": self.deep_link,
            "related_object_type": self.related_object_type,
            "related_object_id": self.related_object_id,
            # Kept so a web view opened from the app lands in the same place.
            "link": self.link,
        }

    @property
    def icon(self) -> str:
        return TYPE_STYLES.get(self.type, ("bell", "#7B8794"))[0]

    @property
    def color(self) -> str:
        return TYPE_STYLES.get(self.type, ("bell", "#7B8794"))[1]
