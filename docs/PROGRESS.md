# Trasset — Progress Log

> **This file is the source of truth for where the build stands.**
> Say **"resume from last"** and work restarts from the *Next up* section below.
> Update this file at the end of every working session.

**Started:** 2026-07-27
**Last updated:** 2026-07-28
**Plan:** [`Trasset_Build_Plan.md`](Trasset_Build_Plan.md) · **Contract:** [`Trasset_SRS.md`](Trasset_SRS.md)

> **Scope now spans two releases.** v1.0 is the web app (Days 1–30, in progress).
> v1.1 is a React Native mobile app (Days 31–60), specified in SRS §12. Mobile
> work has not started and is not blocked on anything except finishing v1.0.
**Repo:** https://github.com/Shivamchaubey14/trasset (public) · branches `main`, `dev`

---

## Status at a glance

| Phase | Days | Status |
|-------|------|--------|
| Phase 0 — Foundation | 1–5 | ✅ Complete |
| Phase 1 — Core Asset Engine | 6–12 | ✅ Complete (Days 6–12) |
| Phase 2 — Maintenance, Procurement, Reports | 13–18 | ✅ Complete (Days 13–18) |
| Phase 3 — Frontend | 19–26 | 🟡 Days 19–25 done · Day 26 done except browser QA |
| Phase 4 — Integration, Testing & Launch | 27–30 | 🟡 Days 27, 28 done · Days 29, 30 open |
| Hindi/English toggle (added on request) | — | 🟡 Engine + chrome done · page content pending |

**Backend test suite:** 559 tests, all passing · **Coverage:** 88.9% (target ≥ 70%, NFR-12)
**Performance:** every list endpoint under 400 ms at **10,000 assets**; worst p95 288 ms (NFR-1)
**Dependencies:** `pip-audit` clean — no known vulnerabilities
**OpenAPI schema:** 65 endpoints, 0 errors, 0 warnings (NFR-13)

> **Backend feature work is complete.** Every functional requirement in SRS §3
> has an implementation, except the `[L]`-priority printable label sheets
> (FR-9.3) and recurring maintenance schedules (FR-6.4), both deferred to v1.1.
**Query counts:** every list endpoint asserted flat — cost does not grow with rows (NFR-1)

> **Note on sequencing.** The plan runs backend-first (Days 1–18) then frontend
> (19–26). At the user's request the frontend was pulled forward once auth,
> users and masters were live, so those screens are real rather than mocked.
> Asset screens still wait on the Day 7 asset API.

---

## ▶ Next up — start here

> **From 2026-07-29 the mobile application is the main workstream**, at the
> user's direction. Deployment is incremental from here — "we will deploy as the
> things get done" — rather than the single Day 29 cutover the plan assumed.

**1. Phase 5 — mobile API groundwork (Days 31–35).** Start here. This is backend
work inside the existing Django project, so it needs no new toolchain:

- **Day 31** — mobile sessions and device registry (BE-1, BE-2).
- **Day 32** — idempotency keys on the mutating endpoints (BE-3).
- **Day 33** — delta sync, asset-tag lookup, per-device throttle (BE-4, BE-5).
- **Day 34** — push dispatch (BE-6).
- **Day 35** — stock-take API (BE-7, BE-8).

Then Phase 6 (Days 36–41) sets up the React Native app itself. Contract is
SRS §12; each day's Objective / Tasks / Definition of Done is in
`Trasset_Build_Plan.md`.

**2. Carried over from v1.0 — open, not abandoned:**

- **Day 29** deploy and **Day 30** docs + `v1.0` tag. Deploying is now
  incremental, so pull these forward whenever a piece is ready rather than
  waiting.
- **Browser QA of the whole web UI** — still nobody has driven it (see below).
- **Hindi page content** — the toggle works and the chrome is bilingual, but
  table headers, filters, modals, forms and the JS-built strings are still
  English. Detail in item 3.

**3. Finish the Hindi/English toggle** (user request, in progress — commit `b7977ef`).

Done and pushed: the translation engine `frontend/js/i18n.js` (`t`, `apply`,
`set`, `toggle`, `mount`, a Hindi dictionary, `localStorage` under
`trasset.lang`, and a `trasset:lang` event); the control mounted top-right on
the sign-in page and in the top bar of every app page; `html[lang="hi"]`
switching both font roles to Noto Sans Devanagari; the 180 ms fade on switch;
and `data-i18n` on the login page, the shell nav and top bar, and all 11 page
titles and subtitles.

What is left — the app is bilingual in its chrome but still English in its
content:
- Dynamic strings built in JavaScript: `js/ui.js` empty states, the pagination
  line, toasts and validation messages. Route them through `T.i18n.t()`.
- Per-page content on all 11 screens — table headers, filter and tab labels,
  modal titles, form labels, button text.
- Server-supplied display strings (status labels, role labels, category names).
  Role labels are already mapped through `role.*` keys; statuses need the same.
- Extend the dictionary in `js/i18n.js` as each of those lands.

Rule that keeps this safe: **the English stays in the markup as the fallback**,
so a missing key degrades to English, never to a raw key name.

**4. Browser QA — Day 26's one remaining blocker: somebody opening the app in a
browser.** The Hindi switch is now part of what needs looking at.

Everything on Day 26 that could be done without a browser is done (see below).
What remains needs a human at a screen:

1. **Click through the whole app.** The standing gap. Every script is
   syntax-checked and every API call each page makes has been exercised, but
   nobody has driven the UI. This will generate the real punch list, and it
   should happen before Phase 4 rather than after.
2. **Responsive check down to 768px** (NFR-9). The breakpoints are written and
   the layout is built for it, but it has never been resized.
3. **Screen-reader spot check.** The structural work is done — focus trap,
   `aria-sort`, labelled controls, tablists — but no assistive technology has
   actually been pointed at it.

Run both servers, open `http://127.0.0.1:5500`, and note anything that looks
wrong. Small visual fixes are cheap now and get more expensive once Phase 4
starts.

**5. The rest of Phase 4:**
- **Day 27** — ✅ done: every journey walked per role against SRS §11.4.
- **Day 28** — ✅ done: SRS §9 security checklist, list endpoints load-tested at
  10,000 assets, `pip-audit` clean.
- **Day 29** — deploy: Nginx, Gunicorn, MySQL, Redis, Celery worker and beat,
  TLS, nightly backups. Now incremental — stand the environment up early and
  ship to it as pieces finish.
- **Day 30** — docs, seed real master data, tag v1.0.

Reusable groundwork: `BaseModelViewSet`, the envelope, the table/toolbar/modal
patterns in `js/masters.js`, `js/assets.js`, `js/audit.js` and `js/requests.js`,
`js/asset-form.js` for any dialog that mutates an asset, and
`audit.services.domain_action()` / `record()` to give a new business verb its own
audit row.

---

## Completed

### Day 1 — Project setup & environment ✅
- Directory tree at `D:\trasset` (`backend/`, `frontend/`, `docs/`).
- Python 3.13 virtualenv at `backend/venv`; dependencies pinned in `requirements.txt`.
- Django project with split settings — `config/settings/{base,dev,prod,test}.py`,
  all secrets read from `.env` via `django-environ` (SEC-10).
- MySQL database `trasset` created (utf8mb4) and connected.
- All eight app packages scaffolded per SRS §10.2 plus `common/` and `tests/`.
- `.gitignore`, `README.md`, `.env.example`.

**Note:** `mysqlclient` has no wheel for Python 3.13 on Windows, so
`config/__init__.py` falls back to PyMySQL via `install_as_MySQLdb()`.
`requirements.txt` still installs `mysqlclient` on Linux for production.

### Day 2 — Common layer & conventions ✅
- `common/renderers.py` — `EnvelopeJSONRenderer` wraps every response in
  `{success, message, data, errors}` (SRS §5.1), deriving the message from the
  view + HTTP method, overridable per response.
- `common/exceptions.py` — envelope error handler plus `Conflict` (409),
  `UnprocessableEntity` (422), `ServiceError`; unhandled errors are logged
  server-side and return a generic body (NFR-8).
- `common/pagination.py` — `StandardPagination` (25 default, 200 max) returning
  `count / page / page_size / total_pages / next / previous / results`.
- `common/permissions.py` + `common/roles.py` — role matrix driven by
  `read_roles` / `write_roles` / `action_roles` on each view (SEC-3).
- `common/models.py` — `TimeStampedModel`, `SoftDeleteModel`.
- `common/validators.py` — upload type/size validation (SEC-8), hex colour validator.
- `common/viewsets.py` — `BaseModelViewSet` / `BaseReadOnlyViewSet` with write throttling.
- `drf-spectacular` at `/api/schema/`, `/api/docs/`, `/api/redoc/`.
- `GET /api/v1/health/` liveness probe.

### Day 3 — Accounts: models & auth ✅
- Custom `User` (email login, one role, department, avatar, timezone,
  notification preference, lockout counters) and `Role`.
- Five roles seeded by data migration `accounts/0003_seed_roles.py`.
- Argon2 password hashing (SEC-1).
- `/auth/login/`, `/auth/refresh/`, `/auth/logout/` (blacklist), `/auth/me/`
  (GET + PATCH), `/auth/password/change/`, `/auth/password/reset/`,
  `/auth/password/reset/confirm/`.
- Login returns the token pair **and** the profile, so the UI paints in one round trip.
- Password reset answers identically for known and unknown emails — no account enumeration.

### Day 4 — RBAC & user management ✅
- `HasRolePermission` enforces the SRS §2.3 matrix server-side; the auditor
  read-only guard applies everywhere regardless of what a view declares.
- `UserViewSet` (Super Admin only); `DELETE` deactivates rather than destroys,
  self-deactivation returns 422.
- `POST /users/{id}/activate/`, `POST /users/{id}/unlock/`.
- `RoleViewSet` — read-only, pagination disabled (returns a bare array).
- Account lockout after 5 failed logins for 15 minutes (FR-1.5).
- Throttle scopes: `auth` on auth endpoints, `write` on all unsafe methods (SEC-7).

### Day 5 — Master data models & APIs ✅
- `Category` (icon, hex colour, `custom_fields` JSON), `Location` (address + geo),
  `Department` (head user, code), `Vendor`.
- CRUD ViewSets with search, filter, ordering and live `asset_count`; departments
  also report `member_count`.
- `custom_fields` validated and normalised on write (FR-3.8).
- Master deletion restricted to Super Admin; protected FKs surface as 409.
- `manage.py bootstrap --demo` seeds users, masters and 42 demo assets.

### Day 6 — Asset model & tag generation ✅
- `Asset` per SRS §4.1 with the composite indexes from §4.3.
- `AssetTagCounter` + `next_asset_tag()` produce `TRA-YYYY-000001` sequentially,
  restarting each year, with `SELECT … FOR UPDATE` against concurrent creates.
- `Attachment` model with type/size validation (FR-3.7).
- State-machine and warranty helper properties.

### Day 7 — Asset CRUD API ✅
- `AssetListSerializer` (flat, cheap) vs `AssetDetailSerializer` (nested
  category / location / department / vendor / assignee / attachments).
- `AssetWriteSerializer` takes `*_id` fields per SRS §5.3 and returns the nested
  detail shape; validates duplicate tag and serial, salvage ≤ cost, warranty ≥
  purchase date, and a category's **required custom fields** (FR-3.8).
- Status is not directly writable — the serializer redirects callers to the
  assign / checkin / retire endpoints so history can't be bypassed.
- `AssetFilter`: multi-select status, category, location, department, vendor,
  assignee, `unassigned`, purchase/created/warranty date ranges, value band, a
  derived `warranty` filter (expiring / expired / active / none) and `active_only`.
- Search across tag, name, serial, model and manufacturer; ordering on 8 columns.
- `GET /assets/stats/` returns the summary cards and respects the active filters.
- `AttachmentViewSet` with type/size validation; deleting drops the stored file.
- A list page costs a flat 4 queries regardless of row count (asserted in tests).

### Day 8 — Assignment (check-out / check-in) ✅
- `AssetAssignment` model — immutable by construction: `save()` refuses updates
  and `delete()` raises, so history can only ever be appended (FR-4.3).
- `services/assignment.py` runs every transition in a transaction and re-reads
  the asset with `SELECT … FOR UPDATE`, so two managers racing on the same asset
  can't both win.
- `POST /assets/{id}/assign/` · `/checkin/` · `/retire/`, all returning the
  updated asset; `GET /assets/{id}/history/` returns the timeline.
- Guards return **409 Conflict** with a sentence that says what to do:
  already assigned, under maintenance, terminal status, not currently assigned,
  already retired, deleting while still assigned.
- Retiring an assigned asset auto-closes the assignment so no dangling holder
  is left behind.
- Check-in records `days_held` and can move the asset to a new location.

### Day 9 — Depreciation engine ✅
- `apps/assets/services/depreciation.py` — straight-line and declining balance
  per SRS §11.1, in `Decimal`, floored at salvage.
- `Asset.current_value` recomputed on save; `GET /assets/{id}/depreciation/`
  returns the year-by-year schedule.
- Verified against hand calculations: ₹78,000 cost / ₹8,000 salvage / 4 years
  gives ₹17,500 a year and lands exactly on salvage.
- **Still pending:** the monthly recalculation Celery task (Day 18).

### Day 28 — Security & performance hardening ✅
- **Dependency audit had never been run.** `pip-audit` found **17 known
  vulnerabilities**: 5 in Django 5.1.6, 1 in simplejwt 5.4.0, and 11 in Pillow
  11.1.0. Upgraded to Django 5.1.15, simplejwt 5.5.1 and Pillow 12.3.0 — audit
  now clean, all tests still passing. `requirements.txt` records that these are
  **security floors, not preferences**.
- `tests/test_security_checklist.py` — 32 tests asserting the SRS §9
  configuration itself, including production settings loaded directly so a
  regression in `prod.py` fails here rather than during a deploy: DEBUG off,
  HSTS, secure cookies, CORS not wildcarded, Argon2 (checked against *base*
  settings, since test settings swap in MD5), token rotation and blacklisting,
  upload allowlist excluding executables, throttling, bounded pagination.
- Bypass attempts, since Day 28 asks explicitly: a soft-deleted asset cannot be
  read, listed, reported or acted on; role escalation via `PATCH /auth/me/` is
  ignored; a scoped queryset cannot be widened by a crafted filter; a
  blacklisted refresh token cannot be reused; and a 500 leaks neither the
  exception message nor a traceback.
- **NFR-1 measured at the specified scale**, not at demo scale. Seeded 10,000
  assets and measured median and p95 over 10 runs per endpoint. Everything
  passed — worst p95 288 ms on the asset list, dashboard 229 ms, register
  report 205 ms. The seed data was removed afterwards.

**A real bug this uncovered:** `Asset.all_objects.filter(...).delete()`
soft-deletes rather than purging *and* returned a bare integer instead of
Django's `(count, {label: count})`. Any caller written the normal way —
`deleted, _ = qs.delete()` — crashes with a confusing unpacking error a long
way from the cause. It bit the cleanup step of the performance script. Fixed to
return Django's shape, documented that delete means soft-delete everywhere
including `all_objects`, and covered by tests.

### Day 27 — End-to-end journeys ✅
- `tests/test_journeys.py` — 27 tests walking whole tasks the way a person
  performs them, rather than endpoints in isolation.
- **Asset manager:** create → issue → breaks → maintenance → returns to the
  same holder → check in → dispose, then asserting the system agrees with
  itself afterwards: history has exactly the right two rows, the audit trail
  carries all four verbs, and the recipient was notified.
- **Employee:** request → approval → the asset actually moves → it appears in
  their own list. Plus: an employee is 403 on six manager-only endpoints, and
  sees zero of another person's requests or notifications.
- **Department head:** approves within their department, sees nothing from
  another one, cannot create assets.
- **Auditor:** reads the whole estate and exports all four reports in both
  formats, yet is 403 on seven distinct write attempts.
- **Super admin:** stands up categories, locations and a user who can then sign
  in; deactivating a holder keeps their assignment history.
- **Procurement:** order → place → receive → three tagged assets exist and one
  can be issued immediately.
- **SRS §11.4 reconciliation**, which had never been tested: the dashboard KPIs
  are computed by entirely separate code from the asset register report. Six
  tests assert they agree — on count, book value, purchase value, the status
  breakdown summing to the total, and after a soft delete moves both numbers
  together. If they disagreed, one of them was lying to somebody making a
  decision.
- Cross-cutting invariants: a failed 409 leaves no history, audit or
  notification behind; an assignment is visible from all five angles; every
  error uses the standard envelope; pagination is uniform across eight lists.

### Day 26 (partial) — Documents tab & accessibility ✅
Everything on Day 26 that does not require a browser.

- **Documents tab on asset detail (FR-3.7).** The attachment API and its
  upload validation had been done since Day 7 with no UI at all. Now: list with
  type icon, size, uploader and age; open in a new tab; delete with the file
  removed from storage as well as the row; drag-and-drop or click-to-choose,
  multi-file, uploaded one at a time so a single rejection does not lose the
  batch; per-file errors reported by name. Write controls hidden for
  non-managers, and the API refuses them independently.
- **Modal focus trap.** Tab and Shift+Tab now cycle inside an open dialog.
  Without it a keyboard user tabbed straight past the last control into the page
  behind — still live, still interactive, invisible behind the backdrop. This
  was the most serious accessibility defect in the app.
- **`aria-sort` on every sortable column.** The arrow told a sighted user which
  column was sorted and which way; a screen-reader user got nothing. Wired
  through all seven tables plus the dynamically-built masters header.
- **Arrow-key navigation between tabs** on asset detail, with `aria-selected`
  kept in step — a tablist should be operable from the keyboard.
- Audited every icon-only control for an accessible name: **all named**.

**Correction:** PROGRESS previously claimed the settings screen was missing the
notification-preference toggle. It was not — the control and the serializer
field both existed. The note was stale, not the code.

### Day 18 — Notifications & scheduled jobs ✅
- `Notification` model with type-driven icon and colour, so the UI has no
  mapping table of its own. The related object is stored as plain type/id
  rather than a generic FK — a notification must outlive the thing it refers
  to, and must never keep a row alive by pointing at it.
- Wired into the events that already existed: asset assigned, asset checked in,
  request submitted (to the right approvers), request approved, request
  rejected, maintenance started, maintenance completed.
- **Nobody is notified about their own action.** A manager assigning to
  themselves does not need telling.
- **Notifying never breaks the action.** Failures are logged and swallowed —
  nobody should fail to issue a laptop because the mail server is down. There
  is a test that patches the notification layer to explode and asserts the
  assignment still succeeds.
- Approvers are resolved by scope: managers hear about every request, a
  department head only about their own department's.
- Email (FR-12.2) goes out for the events that warrant it, not all of them — an
  email per check-in would train people to ignore Trasset's mail. Respects
  `User.email_notifications`, which existed but was never read until now.
- Emails are queued with `transaction.on_commit`, so a rolled-back action
  cannot leave someone holding mail about something that never happened.
  Delivery is idempotent via `emailed_at`, so a retried task cannot double-send.
- Celery tasks, all three named by the existing beat schedule:
  `recalculate_all_depreciation` (monthly, FR-8.4), `scan_expiring_warranties`
  (daily, FR-7.3), `scan_due_maintenance` (daily, FR-6.5), plus a
  `purge_read_notifications` housekeeping task.
- The scans are **safe to run twice** — they check whether the same reminder
  already went out today. Beat firing twice does not spam anyone.
- Depreciation recalculation skips rows whose value has not moved and runs with
  auditing suspended, so a monthly job does not rewrite the whole table or bury
  the audit trail under thousands of machine updates.
- Notifications dropdown wired: unread badge, 60-second poll, mark-one-read on
  click-through, mark-all-read.

**Verified against real Redis**, not just eager mode: worker connected,
all five tasks registered, scans dispatched through the broker, notifications
created, and the resulting email tasks queued and delivered.

### Day 17 — Bulk import ✅
- `POST /assets/import/` takes CSV or XLSX and returns a **per-row report**:
  which rows are ready, which failed, and why, keyed by spreadsheet column and
  numbered to match the actual row in the file (row 2 is the first data row).
- **Validation is not duplicated.** Rows go through `AssetWriteSerializer`, the
  same serializer the API uses, so import rules and API rules cannot drift.
  Salvage-above-cost is rejected on import because it is rejected by the API.
- **Masters are matched by name**, case-insensitively — nobody types database
  ids into a spreadsheet. An unknown name is a row error that says what was not
  found and what to do about it.
- Three safety levels: `dry_run` writes nothing, the default aborts the whole
  file if any row is bad (returning **422** with the report), and `partial=true`
  imports the good rows and reports the rest.
- Tolerates what spreadsheets actually contain: a UTF-8 BOM from Excel,
  `₹1,78,000.00` in a cost column, `15/01/2026` as well as ISO dates, blank
  spacer rows in XLSX, and unknown extra columns (ignored, not fatal).
- Catches duplicates **within the file**, which the serializer cannot see
  because it only checks the database.
- `GET /assets/import/template/` builds its example row from **this
  installation's** master data, preferring a name matching the column's own
  example — so the row you download actually imports, filed under Laptops
  rather than whichever category sorts first.
- `GET /assets/import/columns/` exposes the column reference so the wizard can
  explain itself without hard-coding the schema.
- Import wizard on the assets screen: choose file → read the report → commit.
  The dry run is not optional; nobody should discover what an import does by
  running it.
- `MAX_ROWS` caps a file at 5000.

**Known cost:** a committed row is about ten queries — four foreign-key checks
from the serializer, three for tag generation, the insert, and two for the audit
record. That is the price of reusing the API's validation, and `MAX_ROWS` bounds
the total, but a materially larger import belongs in a Celery job. Pinned by a
test so it cannot quietly get worse.

### Day 16 — Reports & exports ✅
- Four reports — asset register, depreciation, maintenance cost, assignment —
  each a class in `apps/reports/reports.py` declaring its queryset, columns and
  totals. Everything else (filtering, pagination, CSV, XLSX) is shared, so a
  fifth report is a class, not another endpoint.
- All four accept `date_from`, `date_to`, `department`, `location` and
  `category` (FR-11.4). Each report maps those onto its own field paths, so
  filtering maintenance by department reaches through to the asset.
- **The frontend is report-agnostic.** The table is built from the column
  metadata the API returns, so adding a report on the backend makes it appear in
  the UI with no frontend change.
- Exports (FR-10.2): **CSV streams** row by row via `StreamingHttpResponse` —
  nothing larger than one row is ever held. **XLSX** uses openpyxl's
  `write_only` workbook, which flushes to a temp file as rows are appended;
  memory stays flat for a 100k-row register (NFR-5).
- CSV carries a UTF-8 BOM so Excel on Windows doesn't mangle the rupee sign and
  accented names. XLSX gets real dates and numbers with formats, and totals go
  on a **separate Summary sheet** as numbers, so they can be summed and can't be
  mistaken for a data row.
- The `export` throttle scope — configured since Day 2 but never used — is now
  applied to download requests.
- **PDF is deferred to v1.1** by decision. `?export=pdf` returns a 400 naming
  the valid choices rather than silently handing back CSV; there is a test for it.

**Note on the query parameter:** it is `?export=csv`, not `?format=csv`. DRF
reserves `format` for content negotiation and returns **404** when no renderer
matches the value — which is exactly what happened first time, across 19 tests.

### Day 14 — Procurement (purchase orders) ✅
- `PurchaseOrder` + `PurchaseOrderItem` with `PO-2026-000001` numbering. The
  sequence generator in `apps/assets/services/tagging.py` was generalised into
  `next_sequence(prefix, year)` so PO numbers reuse the same locked-counter
  mechanism as asset tags — one implementation, separate sequences per prefix
  (asserted by test).
- **`total_amount` is derived from the line items, never accepted from the
  client** — a caller claiming an order is worth ₹1 is ignored. Tested.
- **Receiving creates one asset per unit (FR-7.2).** Quantity 3 of "Dell
  Latitude 5440" becomes three separate asset records, each with its own tag,
  because they are three physical things that get assigned and maintained
  independently. Assets inherit the order's vendor, location, department and
  unit cost, and the order's `warranty_months` is stamped as an expiry date
  (FR-7.3).
- **Partial receipt is a real state.** Suppliers ship part of an order, so
  `receive` takes per-line quantities and the order sits in *Partially received*
  with the outstanding balance visible. Omitting `lines` receives everything left.
- Lines can be flagged `create_assets=False` for consumables — 20 HDMI cables
  are received without polluting the asset register.
- Guards: can't receive against a draft or a closed order, can't receive more
  than outstanding, can't edit line items once goods have arrived (it would lose
  the received quantities), can't delete an order with receipts against it.
- `.distinct()` on the queryset because search spans line items, which would
  otherwise return an order once per matching line.
- Procurement screen with an inline line-item editor that totals as you type,
  expandable line detail per order, and a receive dialog that says up front how
  many assets it will create.

### Day 13 — Maintenance management ✅
- `MaintenanceRecord` with type, schedule, technician/vendor, cost estimate vs
  actual, and notes (FR-6.1).
- **Scheduling does not take the asset out of service.** An asset booked for
  next Tuesday is still usable today; it only moves to `Under Maintenance` when
  the work actually starts (FR-6.2). A `start_now` flag books and starts in one
  call for same-day work.
- **`asset_status_before` is the field that matters.** Completing restores the
  asset to where it came from, so a laptop that was *Assigned* when it went in
  for a screen repair goes back to its holder rather than into the Available
  pool — which is what a naive "restore to Available" would do (FR-6.3). Two
  edge cases handled: if the holder was cleared while it sat in the workshop it
  falls back to Available, and if something else moved the asset meanwhile the
  completion leaves that alone rather than overwriting it.
- Guards: can't double-book an asset (one open record at a time), can't
  complete work that never started, can't start/complete/cancel a settled
  record — all 409 with a sentence saying what to do.
- Cancelling in-progress work puts the asset straight back into service.
- Filters for status, type, vendor, category, date range, `open_only` and
  `overdue`; stats endpoint reports actual vs estimated spend.
- Maintenance screen with overdue rows marked in Coral, in-progress in Cream
  Yolk, and cost variance shown against the estimate. The complete dialog states
  where the asset will end up, since that is the non-obvious part.
- Everyone can read maintenance — an employee holding a laptop should see it is
  going in on Tuesday — but only managers can book, start, complete or cancel.

### Day 12 — Backend test & hardening pass ✅
Not a paperwork exercise — it found three real problems.

- **N+1 on `/asset-requests/`.** `AssetRequestSerializer` nests a full
  `AssetListSerializer` for both `asset` and `fulfilled_asset`, each reaching
  category, location, department and assignee, but only some were joined.
  Measured 6 queries at 1 row growing to 15 — now flat.
- **The throttle tests were testing nothing.** DRF binds `throttle_classes` and
  `SimpleRateThrottle.THROTTLE_RATES` at *import* time, so `override_settings`
  never reaches views that are already imported. The first version of the test
  file "passed" while no throttling was active at all. Test settings now keep
  the throttle class wired with `None` rates (DRF treats that as unlimited) and
  the tests patch `THROTTLE_RATES` directly. 429 is now genuinely observed on
  the `auth` and `write` scopes, including the asset lifecycle actions.
- **Three dead permission classes removed** — `IsAssetManager`,
  `IsManagerOrReadOnly` and `IsOwnerOrManager` were defined but never used.
  `IsOwnerOrManager` was the risky one: it only implemented
  `has_object_permission`, so used alone it would have left list endpoints
  returning everyone's rows. A comment now records why per-owner access is done
  by narrowing `get_queryset` instead.

Also added:
- `tests/test_performance.py` — every list endpoint asserts its query count does
  **not grow with row count**, which is the invariant that actually regresses.
  Exact-count assertions were deliberately avoided as too brittle.
- `tests/test_validators.py` — upload validation (SEC-8) went from 0 tests to
  27, covering executables, double extensions (`invoice.pdf.exe`), SVG,
  content-type mismatch, and the size ceiling at and over the limit.
  `common/validators.py` 56% → **100%**.
- `tests/test_permission_internals.py` — anonymous and role-less users, the
  per-action override, and the auditor read-only guard holding even when a view
  declares `write_roles = ALL`. `common/permissions.py` 66% → **100%**.
- All SRS §4.3 indexes verified present in the live MySQL schema by reading
  `INFORMATION_SCHEMA`, not just trusting the model `Meta`.

Coverage 83.3% → **85.1%**; 224 → **292 tests**.

### Day 11 — Asset requests & approvals ✅
- `AssetRequest` names **either** a specific asset or a category, so someone can
  ask for "a laptop" without first browsing the register (FR-4.4).
- Approval delegates to the existing `assignment.assign()` **inside the same
  transaction**. If the asset was taken between the request and the decision,
  `assign` raises 409 and the whole approval rolls back — the request stays
  pending rather than being marked approved with nothing handed over. Covered by
  a test.
- Approving a category request requires the approver to choose the asset; they
  can also substitute an equivalent item, recorded as `fulfilled_asset`.
- Guards: a decided request can't be decided again (409); only the requester can
  withdraw one; a reason is required to reject.
- **Visibility is scoped in `get_queryset`, not by a client filter** — employees
  see only their own, department heads see their department's, managers see
  everything. Tested that a crafted `?requester=` can't widen it.
- The requester is taken from the token, never the payload.
- Duplicate pending requests for the same asset are refused.
- `AssetRequest` is deliberately **not** in `TRACKED_MODELS`: every transition is
  a named business event, so Requested / Approved / Rejected / Cancelled are
  recorded explicitly rather than as generic Created-then-Updated pairs.
- Requests screen reads as "My requests" for employees and "Approvals" for
  approvers, with pending rows marked in Cream Yolk.
- Demo users now sit in departments — the head and employee share one, so the
  department-head approval path is actually demonstrable in the seeded data.

### Day 10 — Audit logging ✅
- `AuditLog` per SRS §4.1, append-only by construction: `save()` refuses updates
  and `delete()` raises, and the viewset exposes no write routes (405 on
  POST/PATCH/DELETE). Application-level guarantee — production should also
  restrict DB grants on the table.
- `AuditContextMiddleware` binds the request; the **user is resolved lazily**
  rather than cached, because DRF authenticates inside the view and
  `request.user` at middleware time would be the anonymous session user.
- `pre_save` snapshots the stored row so `post_save` can diff it. One extra
  SELECT per update on tracked models; nothing on create.
- Foreign keys are logged by display name, so a row reads
  `location: Head Office → Store Room` rather than `2 → 4`.
- `domain_action()` context manager gives a save a business verb, so assigning
  writes one **Assigned** row instead of a generic Updated — used by
  `assignment.assign/checkin/retire`.
- Soft deletes are translated into a Deleted row rather than an `is_deleted`
  field change.
- Auth events recorded too (SEC-9): sign-in, **failed sign-in** (no actor, email
  only), sign-out, password change and reset. Passwords are in `EXCLUDED_FIELDS`
  and asserted absent from the trail by test.
- Saves that change nothing write no row.
- `suspend()` context manager keeps seeding and migrations out of the trail;
  `bootstrap` uses it.
- `GET /audit-logs/` (Admin + Auditor only) with filters for action, entity type,
  entity id, user and date range, plus search and `/summary/` counts.
- Audit screen with expandable per-row diffs, action pills coloured from the
  palette, and summary cards.

### Day 9.1 — QR codes ✅ (pulled forward)
- `GET /assets/{id}/qr/` returns a PNG encoding the asset's detail URL
  (FR-9.1), cacheable for a day since tags never change.
- `asset-detail.html?tag=TRA-…` resolves a scanned tag to the asset (FR-9.2).

### Day 15 — Dashboard stats API ✅
- `GET /dashboard/stats/` returns every KPI and chart dataset in one call:
  totals, book value, accumulated depreciation, status counts, warranty windows,
  by-category breakdown, 12-month cumulative value, monthly additions, recent
  assets and expiring warranties.
- Built from database aggregates, not per-row Python (NFR-1).
- Readable by every role — auditors and employees see the same figures.

### Day 19 — Design system & shell ✅
- `css/variables.css` — the full brand palette, type scale, 8px spacing,
  elevation, motion and layout tokens. Nothing else hard-codes a colour.
- `css/base.css` — reset, focus-visible rings, skip link, utilities.
- `css/components.css` — buttons (5 variants), cards, KPI tiles, status pills,
  avatars, forms with inline validation, tables (zebra + sticky header + hover
  actions + sortable), pagination, tabs, modals, toasts, skeletons, empty
  states, dropdowns.
- `css/layout.css` — 240px Ink sidebar with green active state, sticky top bar
  with global search, responsive drawer below 1024px, print styles.
- `js/shell.js` renders the sidebar and top bar on every page from one nav model.
  Screens not built yet appear greyed with a "soon" badge rather than 404-ing.
- Quicksand + Lexend from Google Fonts; jQuery and Chart.js vendored locally so
  the app works offline.

### Day 20 — API client & auth flow ✅
- `js/api.js` — attaches the JWT, unwraps the envelope, refreshes on 401 with a
  single-flight promise so parallel 401s trigger one refresh, and normalises
  errors into `ApiError` with field-level detail.
- Access token in memory only; refresh token in `localStorage` so a reload keeps
  the session. Trade-off documented in the file.
- `js/auth.js` — route guard, session helpers (`isManager`, `isAdmin`,
  `canWrite`), logout, and redirect-if-already-signed-in.
- `index.html` — split-panel login with brand aside, inline validation,
  show/hide password, session-expiry notice, and click-to-fill demo accounts.

### Day 21 — Dashboard UI ✅
- Six KPI tiles in Quicksand numerals, each colour-coded to the palette.
- Four Chart.js charts: cumulative value line with gradient fill, status
  doughnut, category bar, monthly additions bar — all reading their colours from
  the CSS custom properties.
- Recently-added and warranty-expiring tables; warranties under 7 days flip from
  Cream Yolk to Coral.
- Skeleton loaders on first paint, empty states, and a refresh action.

### Day 25 (partial) — Masters & users UI ✅
- `masters.html` / `js/masters.js` — one tabbed screen covering categories,
  locations, departments and vendors. Table, search, state filter, sorting,
  pagination and a modal form are all driven by a per-entity config, so adding a
  master means adding a config entry, not another screen.
- Colour picker paired with a hex field for categories; user picker for
  department heads.
- `users.html` / `js/users.js` — role summary tiles, user table with avatars and
  relative last-sign-in, create/edit modal, deactivate/reactivate. Non-admins get
  a plain "Super Admin only" panel instead of a bare 403.
- `settings.html` — profile editing and password change, both wired to the API.
- Write controls are hidden for auditors and employees; the API enforces the same
  rules independently (SEC-3).

**Still to do on Day 25:** asset request flow, approvals inbox, and the
notifications dropdown (needs the Day 11 and Day 18 backends).

### Day 22 — Asset list UI ✅
- Six summary cards that re-aggregate as filters change, so the numbers always
  describe what's on screen.
- Table with sortable columns, status pills, category colour dots, assignee
  avatars and warranty pills that turn Cream Yolk near expiry and Slate once past.
- Filters for status, category, location and warranty state, plus debounced
  search and a "Clear filters" button that only appears when something is set.
- Row actions adapt to state: Available offers Assign, Assigned offers Check in.
- Add/Edit modal in `js/asset-form.js`, shared with the detail page.
- **Category-driven custom fields** — changing category swaps the extra inputs
  live and preserves whatever was already typed (FR-3.8).
- Top-bar global search now hands off here via `assets.html?q=…`.

### Day 23 — Asset detail UI ✅
- Header with live status pill and state-aware actions (Assign / Check in /
  Edit / Retire / Delete), each hidden unless the role permits it.
- Overview panel, valuation card with a retained-value progress bar, and an
  assignment card showing the holder and how long they've had it.
- Tabs: **History** as a timeline with check-out/check-in dots, actor, notes and
  days held; **Specifications** rendering custom fields against their category
  labels; **Depreciation** with a Chart.js book-value curve against a dashed
  salvage floor, plus the year-by-year table.
- QR label fetched with the bearer token and inlined as a blob, with a print
  action and print CSS that strips the chrome.

---

## Verified working

**Backend** (live server, real requests)
```
GET  /api/v1/health/                          → 200 enveloped
POST /api/v1/auth/login/                      → 200 tokens + profile
GET  /api/v1/auth/me/                         → 200 profile
GET  /api/v1/dashboard/stats/                 → 200 KPIs + 4 chart datasets
GET  /api/v1/categories/?page=1&page_size=15  → 200 paginated, asset_count annotated
GET  /api/v1/roles/                           → 200 bare array (pagination off)
POST /api/v1/categories/  (manager)           → 201
PATCH/DELETE category                          → 200 / 200
DELETE category with 12 assets                 → 409 (PROTECT honoured)
POST /api/v1/categories/  (auditor/employee)  → 403
GET  /api/v1/users/       (employee → admin)  → 403 / 200
GET  /api/v1/categories/  (no token)          → 401
POST bad colour / bad custom_fields            → 400 with field-level errors
OPTIONS preflight from :5500                   → 200, CORS headers present

GET  /api/v1/assets/?page_size=3               → 200, 42 assets, 14 pages
GET  /api/v1/assets/?status=available&warranty=expiring → 200, filters compose
GET  /api/v1/assets/?search=latitude           → 200, 3 matches
GET  /api/v1/assets/stats/                     → 200, cards match the table
POST /api/v1/assets/  (SRS §5.3 payload)       → 201, tag TRA-2026-000014 generated
POST /assets/{id}/assign/                      → 200 "assigned to Karan Verma"
POST /assets/{id}/assign/  again               → 409 "already assigned to …"
POST /assets/{id}/assign/  as employee         → 403
POST /assets/{id}/checkin/                     → 200
POST /assets/{id}/checkin/  again              → 409 "not currently assigned"
POST /assets/{id}/retire/  {status: disposed}  → 200
POST /assets/{id}/assign/  after disposal      → 409
DELETE assigned asset as admin                 → 409 "still assigned to …"
GET  /assets/{id}/history/                     → 200, 2 immutable rows
GET  /assets/{id}/depreciation/                → 200, ends exactly at salvage
GET  /assets/{id}/qr/                          → 200 image/png, 895 bytes

GET  /api/v1/audit-logs/  (auditor / admin)    → 200
GET  /api/v1/audit-logs/  (manager / employee) → 403 "Only Super Admins and Auditors…"
POST/PATCH/DELETE /audit-logs/                 → 405, no write route exists
GET  /audit-logs/summary/                      → 200 totals + per-action counts
assign → one "Assigned" row, FK diff by name, _context carries notes
failed login → "Sign-in failed" row, no actor, attempted password absent

POST /asset-requests/  (employee)              → 201
POST /asset-requests/  duplicate pending       → 400
POST /asset-requests/  no asset and no category→ 400
POST /asset-requests/  (auditor)               → 403 read-only
POST /asset-requests/{id}/approve/ (employee)  → 403
POST /asset-requests/{id}/approve/ (dept head) → 200, asset assigned
POST approve a category request with no choice → 409 "Choose which asset…"
POST approve/reject an already-decided one     → 409
list scoping: employee 3 · head 3 · manager 3 · auditor 0
audit trail reads: Requested → Approved
```

**Frontend** — all 21 files serve over HTTP; every JS file and inline block
passes a syntax check. Not yet clicked through in a browser (see below).

---

## Deferred / known gaps

- **Browser click-through not done.** The pages were verified by serving them,
  syntax-checking every script, and exercising the exact API calls each page
  makes — but nobody has driven the real UI yet. Expect small visual fixes on
  first run.
- Audit rows are written but never pruned. A busy register will grow this table
  indefinitely — worth a retention policy (archive or partition by month) before
  production. `purge_read_notifications` shows the shape; audit needs its own,
  and needs deciding rather than defaulting, since an audit trail is usually
  kept for a stated period.
- The audit trail is append-only at the application layer. A DB superuser can
  still edit the table, so production should restrict grants on `audit_logs`.
- The asset form has no image upload control yet; `image` is accepted by the API.
  The Documents tab covers attachments, but the asset's own photo still cannot
  be set from the UI.
- Redis is installed and running locally; Celery worker and beat have been
  verified against it. Dev still defaults to eager execution so the app runs
  without a broker.
- `value_over_time` is built from purchase dates (how the register grew), not a
  historical revaluation. Worth revisiting if finance wants true month-end book values.

---

## Local environment

| Item | Value |
|------|-------|
| Project root | `D:\trasset` |
| Python | 3.13.9 (`backend\venv`) |
| MySQL | 8.0.44 on `127.0.0.1:3306`, database `trasset` |
| Django | 5.1.6 · DRF 3.15.2 |
| API | `http://127.0.0.1:8000/api/v1/` |
| Swagger | `http://127.0.0.1:8000/api/docs/` |
| Admin | `http://127.0.0.1:8000/admin/` |
| Frontend | `http://127.0.0.1:5500/` |

**Run both servers**
```
cd D:\trasset\backend  && venv\Scripts\python.exe manage.py runserver
cd D:\trasset\frontend && python -m http.server 5500
```

**Test**
```
cd D:\trasset\backend && venv\Scripts\python.exe manage.py test tests
```

Demo logins — all use `Trasset@2026`:
`admin@` · `manager@` · `head@` · `employee@` · `auditor@` `trasset.local`
