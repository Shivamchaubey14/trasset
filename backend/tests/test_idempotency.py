"""
Idempotent writes — SRS §12.4 BE-4, §12.5 (Day 32).

The scenario these protect is a phone draining its offline queue: the request
reached the server, the response did not reach the phone, and the phone
retries. Without a key the retry either applies twice or trips a state-machine
guard and reports failure for something that actually worked.
"""
from datetime import timedelta
from unittest import mock

from django.utils import timezone

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset, AssetAssignment
from apps.masters.models import Category, Location
from common.models import IdempotencyKey
from common.tasks import purge_idempotency_keys

from .base import TrassetAPITestCase

KEY = "b8f1c0de-0000-4000-8000-000000000001"


class IdempotencyTestMixin:
    """Fixtures for an asset that can be checked out."""

    def setUp(self):
        super().setUp()
        self.category = Category.objects.create(name="Laptops", color="#3BB77E")
        self.location = Location.objects.create(name="Head Office")
        self.asset = Asset.objects.create(
            name="Dell Latitude 5440",
            category=self.category,
            location=self.location,
            status=AssetStatus.AVAILABLE,
            purchase_cost="78000.00",
        )
        self.assign_url = f"/api/v1/assets/{self.asset.pk}/assign/"
        self.login(self.manager)

    def assign(self, key=KEY, assignee=None, **extra):
        headers = {"HTTP_IDEMPOTENCY_KEY": key} if key else {}
        headers.update(extra)
        return self.client.post(
            self.assign_url,
            {"user_id": (assignee or self.employee).pk, "notes": "For onboarding"},
            format="json",
            **headers,
        )


class ReplayTests(IdempotencyTestMixin, TrassetAPITestCase):
    """The DoD: one assign sent twice with one key, one check-out, two
    identical responses."""

    def test_a_replayed_assign_checks_out_once_and_answers_the_same(self):
        first = self.assign()
        self.assertEqual(first.status_code, 200, first.data)

        second = self.assign()

        self.assertEqual(second.status_code, 200, second.data)
        self.assertJSONEqual(second.content, first.json())
        self.assertEqual(AssetAssignment.objects.filter(asset=self.asset).count(), 1)

    def test_the_replayed_body_is_byte_identical(self):
        """Not merely equivalent JSON. The stored envelope is kept as text
        precisely because MySQL's JSON type reorders object keys, which would
        hand the retry the same data in a different shape."""
        first = self.assign()
        second = self.assign()

        self.assertEqual(second.content, first.content)

    def test_the_replay_is_flagged_in_the_headers(self):
        """Same body, but a client draining a queue can tell it was a replay."""
        self.assign()
        second = self.assign()

        self.assertEqual(second["Idempotent-Replay"], "true")

    def test_without_a_key_the_second_assign_is_a_conflict(self):
        """What BE-4 exists to prevent: the action worked, yet the caller is
        told it failed."""
        self.assertEqual(self.assign(key=None).status_code, 200)
        second = self.assign(key=None)

        self.assertEqual(second.status_code, 409)
        self.assertEqual(AssetAssignment.objects.filter(asset=self.asset).count(), 1)

    def test_the_asset_is_not_moved_twice(self):
        self.assign()
        self.assign()

        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, AssetStatus.ASSIGNED)
        self.assertEqual(self.asset.assigned_to, self.employee)

    def test_a_replay_writes_no_second_audit_row(self):
        """The replay must not re-execute anything, side effects included."""
        from apps.audit.models import AuditLog

        self.assign()
        before = AuditLog.objects.count()
        self.assign()

        self.assertEqual(AuditLog.objects.count(), before)

    def test_the_envelope_survives_a_replay(self):
        """Including the endpoint's own specific message, not a generic one."""
        first = self.assign()
        second = self.assign()

        body = self.assertEnvelope(second)
        self.assertEqual(body["message"], first.json()["message"])
        self.assertIn("assigned to", body["message"])

    def test_a_replayed_create_makes_one_row(self):
        response = self.client.post(
            "/api/v1/categories/", {"name": "Monitors", "color": "#FDC040"},
            format="json", HTTP_IDEMPOTENCY_KEY=KEY,
        )
        self.assertEqual(response.status_code, 201, response.data)

        replay = self.client.post(
            "/api/v1/categories/", {"name": "Monitors", "color": "#FDC040"},
            format="json", HTTP_IDEMPOTENCY_KEY=KEY,
        )

        self.assertEqual(replay.status_code, 201)
        self.assertJSONEqual(replay.content, response.json())
        self.assertEqual(Category.objects.filter(name="Monitors").count(), 1)

    def test_a_replayed_delete_removes_one_row_and_repeats_its_answer(self):
        category = Category.objects.create(name="Printers", color="#7B8794")
        url = f"/api/v1/categories/{category.pk}/"
        self.login(self.admin)

        first = self.client.delete(url, HTTP_IDEMPOTENCY_KEY=KEY)
        self.assertEqual(first.status_code, 200, first.data)

        second = self.client.delete(url, HTTP_IDEMPOTENCY_KEY=KEY)

        self.assertEqual(second.status_code, 200)
        self.assertJSONEqual(second.content, first.json())


class KeyMisuseTests(IdempotencyTestMixin, TrassetAPITestCase):
    def test_a_key_reused_for_a_different_payload_is_refused(self):
        """A client bug, not a retry. Answering with the first response would
        hide it and hand back a result for an action nobody asked for."""
        self.assign()
        response = self.assign(assignee=self.head)

        self.assertEqual(response.status_code, 409)
        body = self.assertEnvelope(response, success=False)
        self.assertIn("already been used for a different request",
                      str(body["errors"]))

    def test_a_key_reused_on_a_different_endpoint_is_refused(self):
        """The path is part of the fingerprint, so one key cannot be spent on
        two different actions."""
        self.assign()
        response = self.client.post(
            "/api/v1/categories/", {"name": "Monitors", "color": "#FDC040"},
            format="json", HTTP_IDEMPOTENCY_KEY=KEY,
        )

        self.assertEqual(response.status_code, 409)

    def test_keys_are_scoped_per_user(self):
        """One person's key must never replay another person's response."""
        self.assign()
        self.assertEqual(IdempotencyKey.objects.count(), 1)

        second_asset = Asset.objects.create(
            name="HP EliteBook", category=self.category, location=self.location,
            status=AssetStatus.AVAILABLE, purchase_cost="65000.00",
        )
        self.login(self.admin)
        response = self.client.post(
            f"/api/v1/assets/{second_asset.pk}/assign/",
            {"user_id": self.employee.pk}, format="json",
            HTTP_IDEMPOTENCY_KEY=KEY,
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(IdempotencyKey.objects.count(), 2)

    def test_safe_methods_ignore_the_header(self):
        self.client.get("/api/v1/assets/", HTTP_IDEMPOTENCY_KEY=KEY)
        self.client.get("/api/v1/assets/", HTTP_IDEMPOTENCY_KEY=KEY)

        self.assertEqual(IdempotencyKey.objects.count(), 0)

    def test_a_blank_key_is_treated_as_absent(self):
        self.assertEqual(self.assign(key="   ").status_code, 200)
        self.assertEqual(IdempotencyKey.objects.count(), 0)

    def test_an_unauthenticated_request_claims_nothing(self):
        self.logout()
        response = self.assign()

        self.assertEqual(response.status_code, 401)
        self.assertEqual(IdempotencyKey.objects.count(), 0)

    def test_a_rejected_request_is_not_cached(self):
        """A 403 is about the caller, not the action. Storing it would answer a
        later, legitimate attempt with the refusal."""
        self.login(self.employee)
        response = self.assign()

        self.assertEqual(response.status_code, 403)
        self.assertEqual(IdempotencyKey.objects.count(), 0)


class InFlightTests(IdempotencyTestMixin, TrassetAPITestCase):
    """
    Two copies of the same queued action arriving together is normal on a
    flaky reconnect. The unique constraint decides which one runs.

    These use asset *creation* rather than an assign, because creation has no
    state-machine guard of its own — so whether the second request executed is
    visible directly in the row count, rather than masked by a 409 the guards
    would have produced anyway.
    """

    def create_asset(self, key=KEY):
        headers = {"HTTP_IDEMPOTENCY_KEY": key} if key else {}
        return self.client.post(
            "/api/v1/assets/",
            {
                "name": "HP EliteBook 840",
                "category_id": self.category.pk,
                "location_id": self.location.pk,
                "purchase_date": "2026-01-15",
                "purchase_cost": "78000.00",
            },
            format="json",
            **headers,
        )

    def hold_the_key_in_flight(self, lease_expires_at=None):
        """
        Rewind the stored key to how it looked while the first request was
        still running, keeping the fingerprint the real request produced.
        """
        IdempotencyKey.objects.update(
            status_code=None,
            response_body="",
            lease_expires_at=lease_expires_at or IdempotencyKey.new_lease_expiry(),
        )

    def test_a_duplicate_arriving_mid_flight_is_told_to_wait(self):
        self.assertEqual(self.create_asset().status_code, 201)
        self.hold_the_key_in_flight()

        response = self.create_asset()

        self.assertEqual(response.status_code, 409)
        self.assertIn("still being processed",
                      str(self.assertEnvelope(response, success=False)["errors"]))
        # The point of the 409: the duplicate did not run.
        self.assertEqual(Asset.objects.filter(name="HP EliteBook 840").count(), 1)

    def test_a_stale_lease_is_taken_over_and_the_action_runs(self):
        """A worker that died mid-request would otherwise wedge this action in
        the queue until the daily purge."""
        self.assertEqual(self.create_asset().status_code, 201)
        self.hold_the_key_in_flight(
            lease_expires_at=timezone.now() - timedelta(minutes=5)
        )

        response = self.create_asset()

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(IdempotencyKey.objects.count(), 1)

        record = IdempotencyKey.objects.get()
        self.assertEqual(record.status_code, 201)
        self.assertGreater(record.lease_expires_at, timezone.now())

    def test_a_completed_key_is_replayed_rather_than_re_leased(self):
        first = self.assign()
        IdempotencyKey.objects.update(
            lease_expires_at=timezone.now() - timedelta(minutes=5)
        )

        second = self.assign()

        self.assertEqual(second.status_code, 200)
        self.assertJSONEqual(second.content, first.json())
        self.assertEqual(AssetAssignment.objects.filter(asset=self.asset).count(), 1)


class FailureCachingTests(IdempotencyTestMixin, TrassetAPITestCase):
    def test_a_validation_failure_is_replayed(self):
        """A 400 is deterministic — the same payload fails the same way — so
        replaying it saves re-running the work and keeps the queue honest."""
        first = self.client.post(
            self.assign_url, {"user_id": 999999}, format="json",
            HTTP_IDEMPOTENCY_KEY=KEY,
        )
        self.assertEqual(first.status_code, 400)

        second = self.client.post(
            self.assign_url, {"user_id": 999999}, format="json",
            HTTP_IDEMPOTENCY_KEY=KEY,
        )

        self.assertEqual(second.status_code, 400)
        self.assertJSONEqual(second.content, first.json())

    def test_a_server_error_is_not_cached(self):
        """The fault may already be over; the client must be able to retry for
        real rather than be handed the same 500 for ever."""
        with mock.patch(
            "apps.assets.services.assignment.assign",
            side_effect=RuntimeError("database went away"),
        ):
            failed = self.assign()

        self.assertEqual(failed.status_code, 500)
        self.assertEqual(IdempotencyKey.objects.count(), 0)

        # The same key now works, because nothing was stored against it.
        retried = self.assign()
        self.assertEqual(retried.status_code, 200, retried.data)


class PurgeTests(IdempotencyTestMixin, TrassetAPITestCase):
    def test_keys_past_their_ttl_are_purged(self):
        self.assign()
        self.assertEqual(IdempotencyKey.objects.count(), 1)

        IdempotencyKey.objects.update(
            created_at=timezone.now() - timedelta(hours=25)
        )
        purged = purge_idempotency_keys()

        self.assertEqual(purged, 1)
        self.assertEqual(IdempotencyKey.objects.count(), 0)

    def test_keys_inside_the_ttl_are_kept(self):
        self.assign()
        IdempotencyKey.objects.update(
            created_at=timezone.now() - timedelta(hours=23)
        )

        self.assertEqual(purge_idempotency_keys(), 0)
        self.assertEqual(IdempotencyKey.objects.count(), 1)

    def test_a_purged_key_lets_the_action_run_again(self):
        """Deliberate: past the TTL a repeat is a new action, not a retry."""
        self.assign()
        self.client.post(f"/api/v1/assets/{self.asset.pk}/checkin/", {}, format="json")
        IdempotencyKey.objects.all().delete()

        response = self.assign()
        self.assertEqual(response.status_code, 200, response.data)
