# Trasset — Progress Log

> **This file is the source of truth for where the build stands.**
> Say **"resume from last"** and work restarts from the *Next up* section below.
> Update this file at the end of every working session.

**Started:** 2026-07-27
**Last updated:** 2026-07-28
**Plan:** [`Trasset_Build_Plan.md`](Trasset_Build_Plan.md) · **Contract:** [`Trasset_SRS.md`](Trasset_SRS.md)
**Repo:** https://github.com/Shivamchaubey14/trasset (public) · branches `main`, `dev`

---

## Status at a glance

| Phase | Days | Status |
|-------|------|--------|
| Phase 0 — Foundation | 1–5 | ✅ Complete |
| Phase 1 — Core Asset Engine | 6–12 | ✅ Complete (Days 6–12) |
| Phase 2 — Maintenance, Procurement, Reports | 13–18 | 🟡 Days 13, 14, 15 done · Days 16–18 open |
| Phase 3 — Frontend | 19–26 | 🟡 Days 19–23 done · Day 25 mostly done · every nav item now live except Reports |
| Phase 4 — Integration, Testing & Launch | 27–30 | ⬜ Not started |

**Backend test suite:** 371 tests, all passing · **Coverage:** 87.1% (target ≥ 70%, NFR-12)
**OpenAPI schema:** 55 endpoints, 0 errors, 0 warnings (NFR-13)
**Query counts:** every list endpoint asserted flat — cost does not grow with rows (NFR-1)

> **Note on sequencing.** The plan runs backend-first (Days 1–18) then frontend
> (19–26). At the user's request the frontend was pulled forward once auth,
> users and masters were live, so those screens are real rather than mocked.
> Asset screens still wait on the Day 7 asset API.

---

## ▶ Next up — start here

**Day 16 — Reports & exports** 🟢 (Day 15's dashboard API is already done)

1. Four report endpoints under `/reports/`, all filterable by date, department,
   location and category:
   - `asset-register` — the full inventory with current value
   - `depreciation` — cost, accumulated depreciation, book value per asset
   - `maintenance-cost` — spend by asset, category and vendor
   - `assignment` — who has held what, and for how long (the
     `AssetAssignment.days_held` field already carries this)
2. CSV and XLSX export via `openpyxl` (already in requirements), plus PDF for
   the register. **Note:** WeasyPrint/ReportLab are *not* installed — pick one
   and add it, or drop PDF to v1.1 and say so.
3. Exports must stream rather than build the whole file in memory — a 100k-row
   register is in scope per NFR-5.
4. Apply the `export` throttle scope, which is configured but currently unused.
5. Frontend `reports.html` with filters and one-click download; flip the last
   nav item in `js/shell.js`.

**DoD:** Each report returns correct data and downloads as CSV/XLSX.

**Then Day 17** (bulk import) and **Day 18** (notifications + Celery), which
finish the backend feature work.

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
- Maintenance, procurement and reports screens still show a "soon" badge in the
  sidebar; their backends aren't built.
- Audit rows are written but never pruned. A busy register will grow this table
  indefinitely — worth a retention policy (archive or partition by month) before
  production, and it pairs naturally with the Day 18 Celery work.
- The audit trail is append-only at the application layer. A DB superuser can
  still edit the table, so production should restrict grants on `audit_logs`.
- Notifications dropdown renders an empty state; the model arrives on Day 18.
- Attachment upload works via the API but has no UI yet — the detail page shows
  specifications and history, not a documents tab. Worth adding with Day 26.
- The asset form has no image upload control yet; `image` is accepted by the API.
- Celery is configured with a beat schedule, but the tasks it names don't exist
  yet; dev runs eagerly so nothing breaks.
- Redis not installed locally — not needed until Day 18.
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
