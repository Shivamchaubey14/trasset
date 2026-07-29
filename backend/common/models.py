"""Base models shared across every Trasset app, plus the idempotency ledger."""
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    """Adds UTC ``created_at`` / ``updated_at`` to a model (SRS §2.5)."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ("-created_at",)


class SoftDeleteQuerySet(models.QuerySet):
    """QuerySet that understands the ``is_deleted`` flag."""

    def alive(self):
        return self.filter(is_deleted=False)

    def dead(self):
        return self.filter(is_deleted=True)

    def delete(self):
        """
        Soft-delete in bulk rather than issuing a real DELETE.

        Returns the same ``(count, {label: count})`` shape as Django's own
        ``QuerySet.delete()``. It would be easy to return the raw integer from
        ``update()`` instead, but then any caller written against Django's
        contract — ``deleted, _ = qs.delete()`` — blows up with a confusing
        unpacking error.

        Note this applies to ``all_objects`` too: *delete means soft-delete
        everywhere in this codebase*. Use :meth:`hard_delete` to actually purge.
        """
        count = self.update(is_deleted=True, deleted_at=timezone.now())
        return count, {self.model._meta.label: count}

    def hard_delete(self):
        """Really remove the rows. There is no undo."""
        return super().delete()


class SoftDeleteManager(models.Manager.from_queryset(SoftDeleteQuerySet)):
    """Default manager — hides soft-deleted rows."""

    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class AllObjectsManager(models.Manager.from_queryset(SoftDeleteQuerySet)):
    """Escape hatch — includes soft-deleted rows (admin, audit, reports)."""


class SoftDeleteModel(models.Model):
    """
    Soft delete keeps history intact (FR-3.4).

    ``objects``     → live rows only
    ``all_objects`` → every row, including deleted
    """

    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True

    def delete(self, using=None, keep_parents=False):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at", "updated_at"]
                  if hasattr(self, "updated_at") else ["is_deleted", "deleted_at"])

    def restore(self):
        self.is_deleted = False
        self.deleted_at = None
        self.save(update_fields=["is_deleted", "deleted_at"])

    def hard_delete(self, using=None, keep_parents=False):
        super().delete(using=using, keep_parents=keep_parents)


class IdempotencyKey(TimeStampedModel):
    """
    One row per ``Idempotency-Key`` a client has used (SRS §12.4, BE-4).

    A phone that queues a check-out while offline cannot tell, when the network
    drops mid-request, whether the server applied it — the *response* is what
    went missing, not necessarily the request. So it retries, and without this
    the retry either applies twice or (given the Day 8 guards) comes back 409
    "already assigned to Karan Verma": the action succeeded, the user did
    nothing wrong, and they are shown an error.

    The row doubles as a lease and as a cache. While ``status_code`` is null
    the request is still in flight and the key is claimed; once set, the stored
    envelope is replayed verbatim to anyone sending the key again.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="idempotency_keys",
    )
    key = models.CharField(max_length=128)

    #: "POST /api/v1/assets/12/assign/" — recorded for support and debugging.
    endpoint = models.CharField(max_length=255)

    #: SHA-256 of method, path and body. A key coming back with a *different*
    #: fingerprint is a client bug, not a retry, and is refused rather than
    #: quietly answered with the first request's response.
    fingerprint = models.CharField(max_length=64)

    #: Null while the request is running. Set on completion, which is also what
    #: marks the key replayable.
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)

    #: The rendered response envelope, stored as text rather than JSON so that
    #: a replay is byte-identical. MySQL's native JSON type normalises object
    #: key order, which would hand the client the same data in a different
    #: shape on the retry than it got the first time.
    response_body = models.TextField(blank=True, default="")

    #: How long this claim holds the key. A worker that dies mid-request would
    #: otherwise lock the action out until the 24-hour purge, which for an
    #: offline queue means a stuck item the user cannot clear.
    lease_expires_at = models.DateTimeField(db_index=True)

    class Meta:
        db_table = "idempotency_keys"
        ordering = ("-created_at",)
        constraints = [
            # This constraint is the concurrency control: two copies of the
            # same queued action racing on reconnect both try to insert, and
            # the database picks the winner.
            models.UniqueConstraint(
                fields=["user", "key"], name="uniq_idempotency_user_key"
            ),
        ]

    def __str__(self):
        return f"{self.key} ({self.endpoint})"

    @property
    def is_complete(self) -> bool:
        return self.status_code is not None

    @property
    def lease_is_live(self) -> bool:
        return self.lease_expires_at > timezone.now()

    @staticmethod
    def new_lease_expiry():
        return timezone.now() + timedelta(seconds=settings.IDEMPOTENCY_LEASE_SECONDS)

    def complete(self, status_code: int, body: str):
        self.status_code = status_code
        self.response_body = body
        self.save(update_fields=["status_code", "response_body", "updated_at"])
