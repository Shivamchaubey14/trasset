"""
Stock take operations (SRS §12.4 BE-7).

Kept out of the views for the same reason assignment is: these are the rules,
and they need to hold whether they arrive from the API, a management command
or a test.
"""
import logging

from django.db import transaction
from django.utils import timezone

from apps.assets.models import Asset
from common.exceptions import Conflict

from .constants import (
    SCAN_DUPLICATE,
    SCAN_RECORDED,
    SCAN_UNKNOWN,
    EntryState,
    StockTakeStatus,
)
from .models import StockTake, StockTakeEntry

logger = logging.getLogger("trasset")


def start(location, user, notes=""):
    """
    Open a session for ``location``.

    Refuses a second open session for the same place: two people counting one
    store room at once produce two contradictory reports and no way to tell
    which is right.
    """
    existing = StockTake.objects.filter(
        location=location, status=StockTakeStatus.IN_PROGRESS
    ).select_related("started_by").first()

    if existing is not None:
        raise Conflict(
            f"A stock take of {location.name} is already in progress, started by "
            f"{existing.started_by.full_name}. Submit or cancel it first."
        )

    return StockTake.objects.create(location=location, started_by=user, notes=notes)


def _resolve(tag: str):
    """A scanned tag to an asset, case-insensitively (labels get mangled)."""
    return Asset.objects.filter(asset_tag__iexact=tag.strip()).first()


@transaction.atomic
def record_scans(stock_take, scans, user):
    """
    Apply a batch of scans, answering for each one (FR-14.19, FR-14.21).

    A batch is the normal case, not an optimisation: an offline session submits
    everything it collected in one call when signal returns.

    One bad tag does not fail the batch. A stock take is a physical activity
    that has already happened — refusing the whole submission because one label
    is from another system would lose an afternoon's counting, so every scan
    gets its own answer instead. This mirrors the Day 17 import report.
    """
    if not stock_take.is_open:
        raise Conflict(
            f"This stock take was already {stock_take.get_status_display().lower()}. "
            f"Start a new one to keep counting."
        )

    # Locked once for the batch rather than per scan, so two phones draining
    # their queues at the same moment cannot interleave into duplicate entries.
    stock_take = StockTake.objects.select_for_update().get(pk=stock_take.pk)

    seen = set(stock_take.entries.values_list("asset_id", flat=True))
    expected = set(stock_take.expected_assets().values_list("id", flat=True))

    results = []
    for scan in scans:
        tag = scan.get("asset_tag", "")
        asset = _resolve(tag)

        if asset is None:
            results.append({"asset_tag": tag, "outcome": SCAN_UNKNOWN,
                            "detail": "No asset carries that tag."})
            continue

        if asset.pk in seen:
            # Scanning the same shelf twice is ordinary. The first scan stands;
            # re-stamping the time would misreport when it was actually seen.
            results.append({"asset_tag": asset.asset_tag, "outcome": SCAN_DUPLICATE,
                            "detail": "Already scanned in this session."})
            continue

        state = EntryState.FOUND if asset.pk in expected else EntryState.UNEXPECTED
        StockTakeEntry.objects.create(
            stock_take=stock_take,
            asset=asset,
            state=state,
            scanned_at=scan.get("scanned_at") or timezone.now(),
            scanned_by=user,
            expected_location=asset.location,
            note=scan.get("note", "")[:255],
        )
        seen.add(asset.pk)
        results.append({"asset_tag": asset.asset_tag, "outcome": SCAN_RECORDED,
                        "detail": EntryState(state).label, "state": state})

    return results


@transaction.atomic
def submit(stock_take, user):
    """
    Close the session and reconcile (FR-14.20).

    **Idempotent by design**, because this call will be replayed: an offline
    client submits when signal returns, and the reply is exactly what a flaky
    connection loses. A second submit returns the existing reconciliation
    rather than reconciling again — which would otherwise write a second set of
    missing entries, or worse, recompute them against a register that has moved
    on since.
    """
    stock_take = StockTake.objects.select_for_update().get(pk=stock_take.pk)

    if stock_take.status == StockTakeStatus.SUBMITTED:
        return stock_take
    if stock_take.status == StockTakeStatus.CANCELLED:
        raise Conflict("This stock take was cancelled and cannot be submitted.")

    scanned_ids = set(
        stock_take.entries.filter(state=EntryState.FOUND).values_list("asset_id", flat=True)
    )

    # Everything the register expected here that nobody saw. Written down now,
    # so the finding survives somebody moving the asset tomorrow.
    unaccounted = stock_take.expected_assets().exclude(pk__in=scanned_ids)
    StockTakeEntry.objects.bulk_create([
        StockTakeEntry(
            stock_take=stock_take,
            asset=asset,
            state=EntryState.MISSING,
            scanned_at=None,
            expected_location=asset.location,
        )
        for asset in unaccounted
    ])

    stock_take.status = StockTakeStatus.SUBMITTED
    stock_take.submitted_at = timezone.now()
    stock_take.submitted_by = user
    stock_take.save(update_fields=["status", "submitted_at", "submitted_by", "updated_at"])

    counts = stock_take.counts()
    logger.info("Stock take %s submitted: %s found, %s missing, %s unexpected",
                stock_take.pk, counts["found"], counts["missing"], counts["unexpected"])
    return stock_take


def cancel(stock_take, reason=""):
    """Abandon a session. Its scans stay for the record, but it counts nothing."""
    if stock_take.status != StockTakeStatus.IN_PROGRESS:
        raise Conflict(
            f"This stock take was already {stock_take.get_status_display().lower()}."
        )

    stock_take.status = StockTakeStatus.CANCELLED
    if reason:
        stock_take.notes = f"{stock_take.notes}\nCancelled: {reason}".strip()
    stock_take.save(update_fields=["status", "notes", "updated_at"])
    return stock_take
