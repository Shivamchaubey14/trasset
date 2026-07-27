"""
Sequential asset-tag generation (FR-3.2).

Tags look like ``TRA-2026-000123``: prefix, purchase/creation year, then a
zero-padded counter that restarts each year.

Concurrency: the counter row is locked with ``SELECT ... FOR UPDATE`` inside
the caller's transaction, so two simultaneous creates cannot claim the same
number. The unique constraint on ``assets.asset_tag`` is the final backstop.
"""
from django.conf import settings
from django.db import transaction
from django.utils import timezone

TAG_PADDING = 6


def format_tag(year: int, sequence: int, prefix: str | None = None) -> str:
    prefix = prefix or settings.ASSET_TAG_PREFIX
    return f"{prefix}-{year}-{sequence:0{TAG_PADDING}d}"


@transaction.atomic
def next_asset_tag(year: int | None = None, prefix: str | None = None) -> str:
    """Reserve and return the next tag for ``year`` (defaults to this year)."""
    from apps.assets.models import AssetTagCounter

    year = year or timezone.now().year
    prefix = prefix or settings.ASSET_TAG_PREFIX

    counter, _ = AssetTagCounter.objects.select_for_update().get_or_create(
        prefix=prefix, year=year, defaults={"last_sequence": 0}
    )
    counter.last_sequence += 1
    counter.save(update_fields=["last_sequence", "updated_at"])

    return format_tag(year, counter.last_sequence, prefix)
