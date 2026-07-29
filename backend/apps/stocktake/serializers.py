"""Stock take serializers (SRS §12.4 BE-7)."""
from rest_framework import serializers

from apps.masters.models import Location

from .constants import EntryState
from .models import StockTake, StockTakeEntry


class StockTakeAssetSerializer(serializers.Serializer):
    """Just enough of an asset to act on a finding from a phone."""

    id = serializers.IntegerField()
    asset_tag = serializers.CharField()
    name = serializers.CharField()
    status = serializers.CharField()
    serial_number = serializers.CharField()


class StockTakeEntrySerializer(serializers.ModelSerializer):
    asset = StockTakeAssetSerializer(read_only=True)
    state_label = serializers.CharField(source="get_state_display", read_only=True)
    state_color = serializers.CharField(read_only=True)
    expected_location_name = serializers.CharField(
        source="expected_location.name", read_only=True, default=None
    )
    scanned_by_name = serializers.CharField(
        source="scanned_by.full_name", read_only=True, default=None
    )

    class Meta:
        model = StockTakeEntry
        fields = (
            "id", "asset", "state", "state_label", "state_color",
            "scanned_at", "scanned_by_name",
            "expected_location", "expected_location_name", "note",
        )
        read_only_fields = fields


class StockTakeSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source="location.name", read_only=True)
    started_by_name = serializers.CharField(source="started_by.full_name", read_only=True)
    submitted_by_name = serializers.CharField(
        source="submitted_by.full_name", read_only=True, default=None
    )
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    is_open = serializers.BooleanField(read_only=True)
    counts = serializers.SerializerMethodField()

    class Meta:
        model = StockTake
        fields = (
            "id", "location", "location_name",
            "started_by", "started_by_name", "started_at",
            "status", "status_label", "is_open",
            "submitted_at", "submitted_by", "submitted_by_name",
            "notes", "counts", "created_at", "updated_at",
        )
        read_only_fields = fields

    def get_counts(self, obj) -> dict:
        return obj.counts()


class StockTakeCreateSerializer(serializers.Serializer):
    """Opening a session names a location and nothing else (FR-14.18)."""

    location_id = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(), source="location"
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ScanSerializer(serializers.Serializer):
    """One scan. The tag is what a camera reads off the label."""

    asset_tag = serializers.CharField(max_length=60)
    #: When the scan actually happened. An offline session is submitted long
    #: after the fact, so the server's clock is the wrong answer (FR-14.21).
    scanned_at = serializers.DateTimeField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class ScanBatchSerializer(serializers.Serializer):
    """A batch, because an offline session submits everything at once."""

    scans = ScanSerializer(many=True, allow_empty=False)


class ScanResultSerializer(serializers.Serializer):
    """What became of each scan — the batch answers per item, never whole."""

    asset_tag = serializers.CharField()
    outcome = serializers.CharField()
    detail = serializers.CharField()
    state = serializers.CharField(required=False)


class ScanResponseSerializer(serializers.Serializer):
    results = ScanResultSerializer(many=True)
    counts = serializers.DictField()


class StockTakeReportSerializer(serializers.Serializer):
    """
    The reconciliation (FR-14.20).

    Grouped by state rather than returned as one flat list: the whole point of
    the report is the three answers, and a reader should not have to filter to
    see them.
    """

    stock_take = StockTakeSerializer()
    counts = serializers.DictField()
    found = StockTakeEntrySerializer(many=True)
    missing = StockTakeEntrySerializer(many=True)
    unexpected = StockTakeEntrySerializer(many=True)

    @classmethod
    def build(cls, stock_take, context=None):
        entries = list(
            stock_take.entries.select_related(
                "asset", "expected_location", "scanned_by"
            )
        )
        by_state = {state: [] for state in EntryState.values}
        for entry in entries:
            by_state[entry.state].append(entry)

        return cls({
            "stock_take": stock_take,
            "counts": stock_take.counts(),
            "found": by_state[EntryState.FOUND],
            "missing": by_state[EntryState.MISSING],
            "unexpected": by_state[EntryState.UNEXPECTED],
        }, context=context or {})


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")
