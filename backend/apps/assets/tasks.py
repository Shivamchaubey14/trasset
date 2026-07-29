"""
Scheduled jobs for assets (SRS §10.4).

``recalculate_all_depreciation`` is named by the beat schedule in
``config/celery.py`` and runs monthly (FR-8.4).
"""
import logging

from celery import shared_task

logger = logging.getLogger("trasset")

#: Assets are walked in batches so a large register never loads at once.
BATCH_SIZE = 500


@shared_task(ignore_result=True)
def recalculate_all_depreciation():
    """
    Recompute every asset's book value (FR-8.4).

    ``current_value`` is derived from elapsed time, so it drifts out of date on
    its own without anything changing. This brings the whole register current
    once a month.

    Rows whose value has not moved are skipped, so the monthly run does not
    rewrite the entire table — and does not fill the audit trail with thousands
    of no-op updates.
    """
    from apps.assets.models import Asset
    from apps.audit.services import suspend

    updated = 0
    examined = 0

    # This is bookkeeping, not a user action; auditing every row would bury the
    # real history under machine noise.
    with suspend():
        queryset = Asset.objects.only(
            "id", "purchase_cost", "salvage_value", "useful_life_years",
            "depreciation_method", "purchase_date", "current_value",
        )

        batch = []
        for asset in queryset.iterator(chunk_size=BATCH_SIZE):
            examined += 1
            fresh = asset.compute_current_value()
            if fresh != asset.current_value:
                asset.current_value = fresh
                batch.append(asset)

            if len(batch) >= BATCH_SIZE:
                Asset.objects.bulk_update(batch, ["current_value"])
                updated += len(batch)
                batch = []

        if batch:
            Asset.objects.bulk_update(batch, ["current_value"])
            updated += len(batch)

    logger.info("Depreciation recalculated: %s of %s assets changed",
                updated, examined)
    return {"examined": examined, "updated": updated}
