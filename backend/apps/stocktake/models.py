"""
Stock take (SRS §12.4 BE-7, FR-14.18 – FR-14.21).

A stock take is a point-in-time claim about what was physically present at a
location. That word — *point-in-time* — drives the whole design: the entries
are written down at submit and never recomputed, because an asset that moves
next week must not silently rewrite last week's count. A report that changes
after the fact is worse than no report.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel

from .constants import STATE_COLORS, EntryState, StockTakeStatus


class StockTake(TimeStampedModel):
    """One counting session, scoped to a location (FR-14.18)."""

    location = models.ForeignKey(
        "masters.Location",
        on_delete=models.PROTECT,
        related_name="stock_takes",
    )
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_takes",
    )
    status = models.CharField(
        max_length=20,
        choices=StockTakeStatus.choices,
        default=StockTakeStatus.IN_PROGRESS,
        db_index=True,
    )

    started_at = models.DateTimeField(default=timezone.now)
    submitted_at = models.DateTimeField(null=True, blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="submitted_stock_takes",
        null=True, blank=True,
    )

    notes = models.TextField(blank=True)

    class Meta:
        db_table = "stock_takes"
        ordering = ("-started_at", "-id")
        indexes = [
            models.Index(fields=["location", "status"], name="idx_stocktake_loc_status"),
        ]

    def __str__(self):
        return f"Stock take of {self.location} ({self.get_status_display()})"

    @property
    def is_open(self) -> bool:
        return self.status == StockTakeStatus.IN_PROGRESS

    def expected_assets(self):
        """
        What the register says should be at this location.

        Terminal assets are excluded: nobody should be sent looking for
        something that was disposed of, and counting it as missing every time
        would bury the entries that matter.
        """
        from apps.assets.constants import TERMINAL_STATUSES
        from apps.assets.models import Asset

        return (
            Asset.objects.filter(location=self.location)
            .exclude(status__in=TERMINAL_STATUSES)
        )

    def counts(self) -> dict:
        """
        Live tally for the app's running header (FR-14.19).

        While the session is open, *missing* is provisional — it means "not
        scanned yet", not "gone". It only becomes a finding at submit.
        """
        by_state = dict(
            self.entries.values_list("state").annotate(n=models.Count("id"))
        )
        found = by_state.get(EntryState.FOUND, 0)
        unexpected = by_state.get(EntryState.UNEXPECTED, 0)

        if self.is_open:
            missing = max(self.expected_assets().count() - found, 0)
        else:
            missing = by_state.get(EntryState.MISSING, 0)

        return {
            "expected": found + missing,
            "found": found,
            "missing": missing,
            "unexpected": unexpected,
            "scanned": found + unexpected,
        }


class StockTakeEntry(TimeStampedModel):
    """
    One asset's outcome in one session.

    ``expected_location`` is a snapshot rather than a join: the report has to
    keep saying where the asset was *supposed* to be on the day, even after
    somebody moves it in response to the very finding this row recorded.
    """

    stock_take = models.ForeignKey(
        StockTake,
        on_delete=models.CASCADE,
        related_name="entries",
    )
    asset = models.ForeignKey(
        "assets.Asset",
        on_delete=models.PROTECT,
        related_name="stock_take_entries",
    )
    state = models.CharField(max_length=20, choices=EntryState.choices, db_index=True)

    #: When the scan happened, which for an offline session is not when the
    #: server heard about it (FR-14.21).
    scanned_at = models.DateTimeField(null=True, blank=True)
    scanned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="stock_take_scans",
        null=True, blank=True,
    )

    expected_location = models.ForeignKey(
        "masters.Location",
        on_delete=models.SET_NULL,
        related_name="stock_take_entries",
        null=True, blank=True,
    )
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "stock_take_entries"
        ordering = ("state", "asset__asset_tag")
        constraints = [
            # An asset appears at most once per session — scanning the same
            # shelf twice is normal and must not double-count it.
            models.UniqueConstraint(
                fields=["stock_take", "asset"], name="uniq_stocktake_asset"
            ),
        ]

    def __str__(self):
        return f"{self.asset_id} — {self.get_state_display()}"

    @property
    def state_color(self) -> str:
        return STATE_COLORS.get(self.state, "#7B8794")
