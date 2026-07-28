"""
Sequential identifier generation (FR-3.2).

Asset tags look like ``TRA-2026-000123``: prefix, year, then a zero-padded
counter that restarts each year. Purchase orders use the same mechanism with a
``PO`` prefix, so the two share one implementation and one counter table.

Concurrency: the counter row is locked with ``SELECT ... FOR UPDATE`` inside the
caller's transaction, so two simultaneous creates cannot claim the same number.
The unique constraint on the target column is the final backstop.
"""
from django.conf import settings
from django.db import transaction
from django.utils import timezone

PADDING = 6


def format_sequence(prefix: str, year: int, sequence: int) -> str:
    return f"{prefix}-{year}-{sequence:0{PADDING}d}"


@transaction.atomic
def next_sequence(prefix: str, year: int | None = None) -> str:
    """
    Reserve and return the next identifier for ``prefix`` in ``year``.

    The counter model still carries its original ``AssetTagCounter`` name; it is
    a general per-prefix sequence and is used for purchase orders too.
    """
    from apps.assets.models import AssetTagCounter

    year = year or timezone.now().year

    counter, _ = AssetTagCounter.objects.select_for_update().get_or_create(
        prefix=prefix, year=year, defaults={"last_sequence": 0}
    )
    counter.last_sequence += 1
    counter.save(update_fields=["last_sequence", "updated_at"])

    return format_sequence(prefix, year, counter.last_sequence)


# --- Asset tags -------------------------------------------------------------
def format_tag(year: int, sequence: int, prefix: str | None = None) -> str:
    return format_sequence(prefix or settings.ASSET_TAG_PREFIX, year, sequence)


def next_asset_tag(year: int | None = None, prefix: str | None = None) -> str:
    """Next asset tag, e.g. ``TRA-2026-000123``."""
    return next_sequence(prefix or settings.ASSET_TAG_PREFIX, year)
