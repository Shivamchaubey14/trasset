"""Stock take vocabulary (SRS §12.4 BE-7, FR-14.18 – FR-14.21)."""
from django.db import models


class StockTakeStatus(models.TextChoices):
    IN_PROGRESS = "in_progress", "In progress"
    SUBMITTED = "submitted", "Submitted"
    CANCELLED = "cancelled", "Cancelled"


#: A session that can still take scans.
OPEN_STATUSES = (StockTakeStatus.IN_PROGRESS,)


class EntryState(models.TextChoices):
    """
    The three answers a stock take can give about one asset.

    They are not symmetrical: *found* is good news, *missing* means the
    register says it should be here and nobody could see it, and *unexpected*
    means it is here but the register thinks otherwise. The last two are the
    reason anyone runs a stock take at all.
    """

    FOUND = "found", "Found"
    MISSING = "missing", "Missing"
    UNEXPECTED = "unexpected", "Unexpected"


#: Colours for the reconciliation report, from the brand palette (SRS §7.1).
STATE_COLORS = {
    EntryState.FOUND: "#3BB77E",        # Nest Green
    EntryState.MISSING: "#E5484D",      # Coral
    EntryState.UNEXPECTED: "#FDC040",   # Cream Yolk
}

#: Per-scan outcomes reported back to the client (see the Day 17 import report,
#: which established that a batch answers for every item rather than failing
#: whole).
SCAN_RECORDED = "recorded"
SCAN_DUPLICATE = "duplicate"
SCAN_UNKNOWN = "unknown"
