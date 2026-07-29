"""
Delta sync for list endpoints (SRS §12.4, BE-5).

``?updated_since=<timestamp>`` narrows a list to what has changed since the
client last looked. Re-downloading the whole register on every launch is not
viable over mobile data, and a phone in a stock room may be on a very poor
connection when it does it.

Three details make this work in practice rather than only in principle:

* **Deleted rows are included while syncing.** A client that only ever hears
  about live rows never learns that anything went away, so a disposed asset
  sits in its local database for ever. Soft-deleted rows come back with
  ``is_deleted: true`` for the client to drop.
* **Results are ordered oldest-change-first.** The client checkpoints on the
  ``updated_at`` of the last row it saw, so the order has to be the one the
  checkpoint is taken from — otherwise paging through a delta while rows are
  being written skips changes.
* **The comparison is inclusive.** ``>=`` re-sends the boundary row on the next
  sync, which costs one row; ``>`` would drop any change written in the same
  microsecond as the checkpoint. Repeating a row is free for a client that
  applies changes by primary key — missing one is silent data loss.
"""
from datetime import datetime, time

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes
from rest_framework import serializers

UPDATED_SINCE_PARAM = "updated_since"

#: Documented on each list endpoint that supports it (NFR-13).
UPDATED_SINCE_PARAMETER = OpenApiParameter(
    name=UPDATED_SINCE_PARAM,
    type=OpenApiTypes.DATETIME,
    location=OpenApiParameter.QUERY,
    required=False,
    description=(
        "Return only rows changed at or after this time, oldest change first, "
        "for delta sync. Accepts an ISO-8601 timestamp or a plain date. "
        "Soft-deleted rows are included so a client can drop them locally — "
        "check `is_deleted`. Checkpoint on the `updated_at` of the last row "
        "you received."
    ),
)


def parse_updated_since(raw: str):
    """Read a client-supplied checkpoint, or fail with a usable message."""
    value = parse_datetime(raw)
    if value is None:
        as_date = parse_date(raw)
        if as_date is not None:
            value = datetime.combine(as_date, time.min)

    if value is None:
        raise serializers.ValidationError({
            UPDATED_SINCE_PARAM: [
                "Enter an ISO-8601 timestamp such as 2026-07-29T09:15:00Z, "
                "or a date such as 2026-07-29."
            ]
        })

    if timezone.is_naive(value):
        value = timezone.make_aware(value)
    return value


class DeltaSyncMixin:
    """Adds ``?updated_since=`` to a list endpoint."""

    def delta_since(self):
        """
        The requested checkpoint, or ``None``.

        Deliberately restricted to ``list``. Honouring the parameter on a
        detail route would let a crafted query string reach a soft-deleted
        record through ``delta_queryset`` below — the very thing the Day 28
        bypass tests assert is impossible.
        """
        if getattr(self, "action", None) != "list":
            return None
        raw = (self.request.query_params.get(UPDATED_SINCE_PARAM) or "").strip()
        if not raw:
            return None
        return parse_updated_since(raw)

    def delta_manager(self, model):
        """
        The manager to build this request's queryset from.

        While syncing, soft-deleted rows have to be visible or deletions never
        reach the client. Everywhere else the default manager hides them.
        """
        if self.delta_since() is not None and hasattr(model, "all_objects"):
            return model.all_objects
        return model.objects

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        since = self.delta_since()
        if since is None:
            return queryset
        # `pk` breaks ties so paging is deterministic when several rows share a
        # timestamp — a bulk update can easily produce hundreds that do.
        return queryset.filter(updated_at__gte=since).order_by("updated_at", "pk")
