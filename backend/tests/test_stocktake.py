"""
Stock take — SRS §12.4 BE-7, FR-14.18 – FR-14.21 (Day 35).

The DoD: a session opens, accepts a batch of scans, and submits a
reconciliation of found, missing and unexpected.

What makes this feature worth a native app is that it happens in a stock room
with no signal, so the tests lean on the things that follow from that — batches
rather than single calls, client-supplied scan times, a replayed submit, and a
report that does not quietly rewrite itself once the register moves on.
"""
from datetime import timedelta

from django.utils import timezone

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset
from apps.masters.models import Category, Location
from apps.stocktake.constants import EntryState, StockTakeStatus
from apps.stocktake.models import StockTake, StockTakeEntry

from .base import TrassetAPITestCase

URL = "/api/v1/stock-takes/"


class StockTakeTestCase(TrassetAPITestCase):
    def setUp(self):
        super().setUp()
        self.category = Category.objects.create(name="Laptops", color="#3BB77E")
        self.store_room = Location.objects.create(name="Store Room")
        self.head_office = Location.objects.create(name="Head Office")
        self.login(self.manager)

    def make_asset(self, name, location=None, **kwargs):
        return Asset.objects.create(
            name=name, category=self.category,
            location=location or self.store_room,
            status=kwargs.pop("status", AssetStatus.AVAILABLE),
            purchase_cost="1000.00", **kwargs
        )

    def start(self, location=None, expect=201):
        response = self.client.post(
            URL, {"location_id": (location or self.store_room).pk}, format="json"
        )
        self.assertEqual(response.status_code, expect, response.data)
        return response

    def scan(self, stock_take_id, *tags, scanned_at=None):
        scans = [{"asset_tag": tag} for tag in tags]
        if scanned_at:
            for scan in scans:
                scan["scanned_at"] = scanned_at.isoformat()
        return self.client.post(f"{URL}{stock_take_id}/scan/", {"scans": scans},
                                format="json")

    def submit(self, stock_take_id):
        return self.client.post(f"{URL}{stock_take_id}/submit/", {}, format="json")


class SessionTests(StockTakeTestCase):
    """FR-14.18 — a session is scoped to a location."""

    def test_a_session_opens_against_a_location(self):
        response = self.start()

        body = self.assertEnvelope(response)
        self.assertEqual(body["data"]["location_name"], "Store Room")
        self.assertEqual(body["data"]["status"], StockTakeStatus.IN_PROGRESS)
        self.assertTrue(body["data"]["is_open"])
        self.assertEqual(body["data"]["started_by"], self.manager.pk)

    def test_the_expected_count_is_known_from_the_start(self):
        """The app shows progress against a target, so it needs the target."""
        self.make_asset("One")
        self.make_asset("Two")

        counts = self.start().json()["data"]["counts"]

        self.assertEqual(counts["expected"], 2)
        self.assertEqual(counts["found"], 0)
        self.assertEqual(counts["missing"], 2)

    def test_two_open_sessions_for_one_location_are_refused(self):
        """Two people counting the same room produce two contradictory reports
        and no way to tell which is right."""
        self.start()
        response = self.client.post(URL, {"location_id": self.store_room.pk},
                                    format="json")

        self.assertEqual(response.status_code, 409)
        body = self.assertEnvelope(response, success=False)
        self.assertIn("already in progress", str(body["errors"]))

    def test_a_different_location_can_be_counted_at_the_same_time(self):
        self.start()
        self.start(location=self.head_office)

        self.assertEqual(StockTake.objects.count(), 2)

    def test_a_location_can_be_counted_again_once_the_first_is_submitted(self):
        first = self.start().json()["data"]["id"]
        self.submit(first)

        self.start()

        self.assertEqual(StockTake.objects.count(), 2)

    def test_open_sessions_can_be_listed_on_their_own(self):
        """What the app asks for on launch: is there a count to resume?"""
        submitted = self.start().json()["data"]["id"]
        self.submit(submitted)
        open_one = self.start(location=self.head_office).json()["data"]["id"]

        response = self.client.get(URL, {"open_only": "true"})

        ids = [row["id"] for row in response.json()["data"]["results"]]
        self.assertEqual(ids, [open_one])

    def test_open_only_false_leaves_the_list_alone(self):
        submitted = self.start().json()["data"]["id"]
        self.submit(submitted)

        response = self.client.get(URL, {"open_only": "false"})

        self.assertEqual(response.json()["data"]["count"], 1)

    def test_terminal_assets_are_not_expected(self):
        """Nobody should be sent looking for something that was disposed of."""
        self.make_asset("Live one")
        self.make_asset("Gone", status=AssetStatus.DISPOSED)

        counts = self.start().json()["data"]["counts"]

        self.assertEqual(counts["expected"], 1)

    def test_the_status_cannot_be_edited_directly(self):
        """A session becomes 'submitted' by reconciling, not by assertion."""
        stock_take = self.start().json()["data"]["id"]

        response = self.client.patch(f"{URL}{stock_take}/",
                                     {"status": "submitted"}, format="json")

        self.assertEqual(response.status_code, 405)


class ScanTests(StockTakeTestCase):
    """FR-14.19, FR-14.21 — batches, because the session was offline."""

    def test_a_batch_of_scans_is_recorded_in_one_call(self):
        first = self.make_asset("One")
        second = self.make_asset("Two")
        stock_take = self.start().json()["data"]["id"]

        response = self.scan(stock_take, first.asset_tag, second.asset_tag)

        self.assertEqual(response.status_code, 200, response.data)
        body = self.assertEnvelope(response)
        self.assertEqual([r["outcome"] for r in body["data"]["results"]],
                         ["recorded", "recorded"])
        self.assertEqual(body["data"]["counts"]["found"], 2)

    def test_the_running_counts_come_back_with_every_batch(self):
        present = self.make_asset("Present")
        self.make_asset("Absent")
        elsewhere = self.make_asset("Elsewhere", location=self.head_office)
        stock_take = self.start().json()["data"]["id"]

        counts = self.scan(stock_take, present.asset_tag,
                           elsewhere.asset_tag).json()["data"]["counts"]

        self.assertEqual(counts["found"], 1)
        self.assertEqual(counts["unexpected"], 1)
        self.assertEqual(counts["missing"], 1)

    def test_an_asset_from_another_location_is_unexpected_not_found(self):
        stray = self.make_asset("Stray", location=self.head_office)
        stock_take = self.start().json()["data"]["id"]

        self.scan(stock_take, stray.asset_tag)

        entry = StockTakeEntry.objects.get(asset=stray)
        self.assertEqual(entry.state, EntryState.UNEXPECTED)

    def test_scanning_the_same_asset_twice_does_not_double_count(self):
        """Scanning the same shelf twice is ordinary behaviour, not an error."""
        asset = self.make_asset("One")
        stock_take = self.start().json()["data"]["id"]

        response = self.scan(stock_take, asset.asset_tag, asset.asset_tag)

        outcomes = [r["outcome"] for r in response.json()["data"]["results"]]
        self.assertEqual(outcomes, ["recorded", "duplicate"])
        self.assertEqual(StockTakeEntry.objects.filter(asset=asset).count(), 1)

    def test_a_duplicate_across_batches_is_also_absorbed(self):
        asset = self.make_asset("One")
        stock_take = self.start().json()["data"]["id"]

        self.scan(stock_take, asset.asset_tag)
        response = self.scan(stock_take, asset.asset_tag)

        self.assertEqual(response.json()["data"]["results"][0]["outcome"], "duplicate")
        self.assertEqual(StockTakeEntry.objects.count(), 1)

    def test_an_unknown_tag_is_reported_without_failing_the_batch(self):
        """A stock take has already happened by the time it is submitted.
        Rejecting the whole batch over one stray label loses an afternoon."""
        asset = self.make_asset("One")
        stock_take = self.start().json()["data"]["id"]

        response = self.scan(stock_take, asset.asset_tag, "NOT-A-TAG")

        self.assertEqual(response.status_code, 200)
        outcomes = [r["outcome"] for r in response.json()["data"]["results"]]
        self.assertEqual(outcomes, ["recorded", "unknown"])
        self.assertEqual(StockTakeEntry.objects.count(), 1)

    def test_tags_are_matched_case_insensitively(self):
        asset = self.make_asset("One")
        stock_take = self.start().json()["data"]["id"]

        response = self.scan(stock_take, asset.asset_tag.lower())

        self.assertEqual(response.json()["data"]["results"][0]["outcome"], "recorded")

    def test_the_scan_time_comes_from_the_client_not_the_server(self):
        """An offline session is submitted hours later; the server clock would
        say the whole count happened in one second (FR-14.21)."""
        asset = self.make_asset("One")
        stock_take = self.start().json()["data"]["id"]
        earlier = timezone.now() - timedelta(hours=3)

        self.scan(stock_take, asset.asset_tag, scanned_at=earlier)

        entry = StockTakeEntry.objects.get(asset=asset)
        self.assertLess(entry.scanned_at, timezone.now() - timedelta(hours=2))

    def test_the_scan_time_falls_back_to_now_when_not_supplied(self):
        asset = self.make_asset("One")
        stock_take = self.start().json()["data"]["id"]

        self.scan(stock_take, asset.asset_tag)

        entry = StockTakeEntry.objects.get(asset=asset)
        self.assertGreater(entry.scanned_at, timezone.now() - timedelta(minutes=1))

    def test_an_empty_batch_is_rejected(self):
        stock_take = self.start().json()["data"]["id"]

        response = self.client.post(f"{URL}{stock_take}/scan/", {"scans": []},
                                    format="json")

        self.assertEqual(response.status_code, 400)

    def test_scanning_into_a_submitted_session_is_refused(self):
        asset = self.make_asset("One")
        stock_take = self.start().json()["data"]["id"]
        self.submit(stock_take)

        response = self.scan(stock_take, asset.asset_tag)

        self.assertEqual(response.status_code, 409)
        self.assertIn("already submitted",
                      str(self.assertEnvelope(response, success=False)["errors"]))


class SubmitTests(StockTakeTestCase):
    """FR-14.20 — the reconciliation."""

    def test_submitting_reconciles_found_missing_and_unexpected(self):
        """The Day 35 definition of done."""
        found = self.make_asset("Found one")
        missing = self.make_asset("Missing one")
        unexpected = self.make_asset("Stray", location=self.head_office)
        stock_take = self.start().json()["data"]["id"]
        self.scan(stock_take, found.asset_tag, unexpected.asset_tag)

        response = self.submit(stock_take)

        self.assertEqual(response.status_code, 200, response.data)
        data = self.assertEnvelope(response)["data"]

        self.assertEqual(data["counts"], {
            "expected": 2, "found": 1, "missing": 1, "unexpected": 1, "scanned": 2,
        })
        self.assertEqual([e["asset"]["asset_tag"] for e in data["found"]],
                         [found.asset_tag])
        self.assertEqual([e["asset"]["asset_tag"] for e in data["missing"]],
                         [missing.asset_tag])
        self.assertEqual([e["asset"]["asset_tag"] for e in data["unexpected"]],
                         [unexpected.asset_tag])

    def test_the_message_summarises_the_outcome(self):
        self.make_asset("Missing one")
        stock_take = self.start().json()["data"]["id"]

        body = self.submit(stock_take).json()

        self.assertIn("1 missing", body["message"])

    def test_missing_entries_are_written_down_not_computed(self):
        """A report that changes after the fact is worse than no report. Once
        submitted, moving the asset must not rewrite history."""
        missing = self.make_asset("Missing one")
        stock_take = self.start().json()["data"]["id"]
        self.submit(stock_take)

        # Somebody finds it and moves it in response to the finding.
        missing.location = self.head_office
        missing.save(update_fields=["location"])

        report = self.client.get(f"{URL}{stock_take}/report/").json()["data"]

        self.assertEqual(report["counts"]["missing"], 1)
        self.assertEqual(report["missing"][0]["expected_location_name"], "Store Room")

    def test_submitting_twice_returns_the_same_reconciliation(self):
        """Idempotent because it will be replayed: an offline client submits
        when signal returns, and the reply is what a flaky link loses."""
        self.make_asset("Missing one")
        stock_take = self.start().json()["data"]["id"]

        first = self.submit(stock_take)
        second = self.submit(stock_take)

        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(second.json()["data"]["counts"],
                         first.json()["data"]["counts"])
        self.assertEqual(
            StockTakeEntry.objects.filter(state=EntryState.MISSING).count(), 1
        )

    def test_a_replayed_submit_does_not_move_the_submitted_time(self):
        stock_take = self.start().json()["data"]["id"]
        self.submit(stock_take)
        first_time = StockTake.objects.get(pk=stock_take).submitted_at

        self.submit(stock_take)

        self.assertEqual(StockTake.objects.get(pk=stock_take).submitted_at, first_time)

    def test_an_empty_location_reconciles_to_nothing(self):
        stock_take = self.start().json()["data"]["id"]

        counts = self.submit(stock_take).json()["data"]["counts"]

        self.assertEqual(counts, {"expected": 0, "found": 0, "missing": 0,
                                  "unexpected": 0, "scanned": 0})

    def test_the_session_records_who_submitted_it(self):
        stock_take = self.start().json()["data"]["id"]
        self.login(self.admin)

        self.submit(stock_take)

        self.assertEqual(StockTake.objects.get(pk=stock_take).submitted_by, self.admin)

    def test_the_report_is_readable_afterwards(self):
        asset = self.make_asset("One")
        stock_take = self.start().json()["data"]["id"]
        self.scan(stock_take, asset.asset_tag)
        self.submit(stock_take)

        response = self.client.get(f"{URL}{stock_take}/report/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["counts"]["found"], 1)


class CancelTests(StockTakeTestCase):
    def test_a_session_can_be_abandoned(self):
        stock_take = self.start().json()["data"]["id"]

        response = self.client.post(f"{URL}{stock_take}/cancel/",
                                    {"reason": "Wrong room"}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(StockTake.objects.get(pk=stock_take).status,
                         StockTakeStatus.CANCELLED)

    def test_a_cancelled_session_cannot_be_submitted(self):
        stock_take = self.start().json()["data"]["id"]
        self.client.post(f"{URL}{stock_take}/cancel/", {}, format="json")

        response = self.submit(stock_take)

        self.assertEqual(response.status_code, 409)

    def test_cancelling_frees_the_location_for_another_count(self):
        stock_take = self.start().json()["data"]["id"]
        self.client.post(f"{URL}{stock_take}/cancel/", {}, format="json")

        self.start()

        self.assertEqual(StockTake.objects.filter(
            status=StockTakeStatus.IN_PROGRESS).count(), 1)

    def test_a_submitted_session_cannot_be_cancelled(self):
        stock_take = self.start().json()["data"]["id"]
        self.submit(stock_take)

        response = self.client.post(f"{URL}{stock_take}/cancel/", {}, format="json")

        self.assertEqual(response.status_code, 409)


class OfflineReplayTests(StockTakeTestCase):
    """§12.5 — the whole session arrives at once, possibly more than once."""

    def test_a_whole_offline_session_replays_without_double_counting(self):
        first = self.make_asset("One")
        second = self.make_asset("Two")
        stock_take = self.start().json()["data"]["id"]
        scanned_at = timezone.now() - timedelta(hours=2)

        self.scan(stock_take, first.asset_tag, second.asset_tag, scanned_at=scanned_at)
        # The reply was lost, so the phone sends the batch again.
        replay = self.scan(stock_take, first.asset_tag, second.asset_tag,
                           scanned_at=scanned_at)
        self.submit(stock_take)
        self.submit(stock_take)

        self.assertEqual([r["outcome"] for r in replay.json()["data"]["results"]],
                         ["duplicate", "duplicate"])
        self.assertEqual(StockTakeEntry.objects.count(), 2)
        self.assertEqual(
            StockTakeEntry.objects.filter(state=EntryState.FOUND).count(), 2
        )

    def test_an_idempotency_key_replays_the_stored_scan_response(self):
        """BE-4 covers this endpoint too, since it is an ordinary write."""
        asset = self.make_asset("One")
        stock_take = self.start().json()["data"]["id"]
        payload = {"scans": [{"asset_tag": asset.asset_tag}]}

        first = self.client.post(f"{URL}{stock_take}/scan/", payload, format="json",
                                 HTTP_IDEMPOTENCY_KEY="scan-key-1")
        second = self.client.post(f"{URL}{stock_take}/scan/", payload, format="json",
                                  HTTP_IDEMPOTENCY_KEY="scan-key-1")

        self.assertEqual(second.content, first.content)
        self.assertEqual(second["Idempotent-Replay"], "true")


class PermissionTests(StockTakeTestCase):
    def test_an_employee_cannot_start_one(self):
        self.login(self.employee)
        response = self.client.post(URL, {"location_id": self.store_room.pk},
                                    format="json")

        self.assertEqual(response.status_code, 403)

    def test_an_employee_cannot_read_them(self):
        self.start()
        self.login(self.employee)

        self.assertEqual(self.client.get(URL).status_code, 403)

    def test_an_auditor_may_read_but_not_write(self):
        """Reconciling the register against reality is exactly the evidence an
        auditor is looking for — but the read-only guard still holds."""
        stock_take = self.start().json()["data"]["id"]
        self.login(self.auditor)

        self.assertEqual(self.client.get(URL).status_code, 200)
        self.assertEqual(
            self.client.get(f"{URL}{stock_take}/report/").status_code, 200
        )
        self.assertEqual(
            self.client.post(URL, {"location_id": self.store_room.pk},
                             format="json").status_code, 403
        )
        self.assertEqual(self.submit(stock_take).status_code, 403)

    def test_anonymous_callers_get_nothing(self):
        self.logout()
        self.assertEqual(self.client.get(URL).status_code, 401)

    def test_only_a_super_admin_may_delete_a_session(self):
        stock_take = self.start().json()["data"]["id"]

        self.assertEqual(
            self.client.delete(f"{URL}{stock_take}/").status_code, 403
        )
        self.login(self.admin)
        self.assertEqual(
            self.client.delete(f"{URL}{stock_take}/").status_code, 200
        )
