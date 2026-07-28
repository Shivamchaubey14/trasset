"""Abstract base models shared across every Trasset app."""
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
