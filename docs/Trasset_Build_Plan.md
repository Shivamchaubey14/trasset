# Trasset — Build Plan

**Goal:** Ship Trasset in two releases — **v1.0** (DRF + MySQL API and web dashboard) in 30 working days, then **v1.1** (React Native mobile app for iOS and Android) over a further 30.
**Assumptions:** 1–2 developers, ~6–7 focused hours/day. Fonts: Quicksand + Lexend. Palette: Nest Green `#3BB77E`, Cream Yolk `#FDC040`, Ink `#253D4E`.

> **How to use this plan:** Each day has an **Objective**, concrete **Tasks**, and a **Definition of Done (DoD)**. Commit at the end of every day. Keep the SRS open as your contract. If you fall behind, protect the "High priority (MVP)" items and defer the `[M]/[L]` ones.

> **Why mobile comes second, not in parallel:** the app consumes the same API as
> the web client (SRS §10.5). Building it against an API still in flux means
> rewriting the client every time an endpoint moves. Days 31–35 harden the API
> for mobile *before* a line of React Native is written.

---

## Legend
- 🟢 Backend (DRF/MySQL) · 🔵 Web frontend (HTML/CSS/JS/jQuery) · 📱 Mobile (React Native) · 🟡 DevOps/Testing/Docs

---

## Phase 0 — Foundation (Days 1–5)

### Day 1 — Project setup & environment 🟢🟡
**Objective:** A running Django project connected to MySQL, in version control.
**Tasks:**
- Create Git repo with `main`/`dev` branches; add `.gitignore`, `README.md`.
- Set up Python 3.11 virtualenv; install `django`, `djangorestframework`, `mysqlclient`, `django-environ`, `django-cors-headers`, `djangorestframework-simplejwt`, `django-filter`, `drf-spectacular`.
- Create the `trasset` project with split settings (`base/dev/prod`) and env-var config.
- Create the MySQL database and user; connect Django to it; run initial migrate.
- Scaffold the app folders from SRS §10.2 (`accounts, assets, masters, maintenance, procurement, reports, notifications, audit`, plus `common`).
**DoD:** `python manage.py runserver` works; admin loads; MySQL connection confirmed; first commit pushed.

### Day 2 — Common layer & conventions 🟢
**Objective:** Shared building blocks so every app is consistent.
**Tasks:**
- Build the standard response envelope renderer + custom exception handler (SRS §5.1).
- Add base pagination class (default 25), base permissions, and a `TimeStampedModel` abstract base.
- Configure DRF settings: JWT auth, pagination, filter backends, throttling, spectacular schema.
- Wire `drf-spectacular` → `/api/docs/` (Swagger) and `/api/schema/`.
**DoD:** A throwaway test endpoint returns the standard envelope; Swagger UI renders.

### Day 3 — Accounts: models & auth 🟢
**Objective:** Users, roles, and JWT login.
**Tasks:**
- Custom `User` model (email login) + `Role` model; seed the 5 roles via a data migration.
- Implement login, refresh, logout (blacklist), `/auth/me/` (SRS §5.2).
- Password change + reset-request/confirm endpoints.
- Register `User` in admin; create a superuser.
**DoD:** You can log in via API and get access/refresh tokens; `/auth/me/` returns the profile.

### Day 4 — RBAC & user management 🟢
**Objective:** Role-based permissions enforced server-side.
**Tasks:**
- Implement DRF permission classes mapping roles → allowed actions (SRS §2.3).
- Build Users CRUD (Super Admin only) + Roles list endpoint.
- Add account lockout after failed logins and auth throttling.
- Write unit tests for auth + permission matrix.
**DoD:** An Employee token is `403` on admin endpoints; permission tests pass.

### Day 5 — Master data models & APIs 🟢
**Objective:** Categories, Locations, Departments, Vendors.
**Tasks:**
- Create the four master models (SRS §4.1) with migrations.
- Build CRUD ViewSets + serializers + routers for each, with search/filter/order.
- Add category `custom_fields` (JSON) support.
- Seed a few sample categories/locations/departments/vendors.
**DoD:** All master endpoints CRUD correctly and appear in Swagger; masters tests pass.

---

## Phase 1 — Core Asset Engine (Days 6–12)

### Day 6 — Asset model & tag generation 🟢
**Objective:** The central asset entity.
**Tasks:**
- Implement the full `Asset` model (SRS §4.1) with enums, soft delete, indexes.
- Auto-generate sequential `TRA-YYYY-000001` tags on create.
- Add `Attachment` model.
- Migrations + admin registration.
**DoD:** Assets can be created in admin; tags auto-generate uniquely.

### Day 7 — Asset CRUD API 🟢
**Objective:** Full asset REST surface.
**Tasks:**
- Asset serializer(s): list (lightweight) vs detail (nested category/location/vendor/assignee).
- ViewSet with create/list/retrieve/update/soft-delete.
- Filtering by status, category, location, department, assignee, date ranges; search by tag/name/serial; ordering.
- Image + attachment upload endpoints with validation.
**DoD:** Assets fully CRUD via API with filters, search, pagination; validation errors are structured.

### Day 8 — Assignment (check-out / check-in) 🟢
**Objective:** Assign assets and record history.
**Tasks:**
- `AssetAssignment` model + history endpoint.
- `/assets/{id}/assign/`, `/checkin/`, `/retire/` actions inside DB transactions with status guards (can't assign non-available, etc. → `409`).
- `/assets/{id}/history/` returns combined assignment + maintenance timeline.
**DoD:** Assign/checkin/retire flows work and enforce state rules; history is accurate and immutable.

### Day 9 — Depreciation engine 🟢
**Objective:** Automatic valuation.
**Tasks:**
- Implement straight-line + declining-balance formulas (SRS §11.1) as a service.
- Compute `current_value` on save and expose `/assets/{id}/depreciation/` (year-by-year schedule).
- Unit tests covering both methods and salvage floor.
**DoD:** Depreciation schedule matches hand-calculated values in tests.

### Day 10 — Audit logging 🟢
**Objective:** Immutable trail of who did what.
**Tasks:**
- `AuditLog` model + signals/middleware capturing create/update/delete/assign with user, IP, changes (JSON).
- `/audit-logs/` read-only endpoint (Admin/Auditor), filterable by entity.
**DoD:** Every asset action produces an audit entry; endpoint lists them; auditors are read-only.

### Day 11 — Asset requests & approvals 🟢
**Objective:** Employees request, managers approve.
**Tasks:**
- `AssetRequest` model + endpoints: create (employee), list, approve/reject (manager) — approval triggers assignment.
- Guard rules and status transitions.
**DoD:** Full request → approve → auto-assign loop works with correct permissions.

### Day 12 — Backend test & hardening pass 🟡
**Objective:** Stabilise the API core.
**Tasks:**
- Raise test coverage of assets/assignment/depreciation to ≥ 70%.
- Add throttling on write endpoints; validate all serializers; review query counts (avoid N+1 with `select_related`/`prefetch_related`).
- Confirm indexes from SRS §4.3 exist.
**DoD:** Test suite green; Swagger reflects all endpoints; no obvious N+1 on list endpoints.

---

## Phase 2 — Maintenance, Procurement, Reports (Days 13–18)

### Day 13 — Maintenance management 🟢
**Objective:** Schedule and complete maintenance.
**Tasks:**
- `MaintenanceRecord` model + CRUD.
- Scheduling flips asset to `Under Maintenance`; `/maintenance/{id}/complete/` captures actual cost and restores status.
- Filter by asset/status/date.
**DoD:** Maintenance lifecycle updates asset status correctly; costs recorded.

### Day 14 — Procurement (Purchase Orders) 🟢
**Objective:** POs and warranty tracking.
**Tasks:**
- `PurchaseOrder` + `PurchaseOrderItem` models and CRUD.
- `/purchase-orders/{id}/receive/` optionally auto-creates assets from line items.
- Warranty-expiry flag logic (assets expiring ≤ 30 days).
**DoD:** POs CRUD; receiving can generate assets; warranty flags computed.

### Day 15 — Dashboard stats API 🟢
**Objective:** Power the dashboard in one call.
**Tasks:**
- `/dashboard/stats/`: KPI totals (assets, total value, assigned/available, under maintenance, expiring warranties) + chart datasets (by category, by status, value over time, assignment trend).
- Optimise with aggregated ORM queries.
**DoD:** A single endpoint returns all dashboard data quickly (< 400 ms on seed data).

### Day 16 — Reports & exports 🟢
**Objective:** Business reports with export.
**Tasks:**
- Report endpoints: asset-register, depreciation, maintenance-cost, assignment — all filterable.
- CSV/XLSX export (openpyxl) and PDF export (WeasyPrint/ReportLab) for the register.
**DoD:** Each report returns correct data and downloads as CSV/XLSX (and PDF for register).

### Day 17 — Bulk import/export 🟢
**Objective:** Onboard data fast.
**Tasks:**
- `/assets/import/`: accept CSV/XLSX, validate row-by-row, return a per-row success/error report; provide a downloadable template.
- `/assets/export/`: export current filtered list.
**DoD:** A sample file imports with a clear validation report; bad rows are rejected with reasons.

### Day 18 — Notifications + async jobs 🟢🟡
**Objective:** Reminders and alerts.
**Tasks:**
- `Notification` model + list / mark-read endpoints.
- Set up Celery + Redis. Scheduled jobs: monthly depreciation recalculation, daily warranty + maintenance-due scan → create notifications and queue emails.
- Configure SMTP email backend.
**DoD:** Triggering an assignment creates a notification; a scheduled task runs and produces reminders/emails in dev.

---

## Phase 3 — Frontend (Days 19–26)

### Day 19 — Design system & shell 🔵
**Objective:** The visual foundation.
**Tasks:**
- Set up `variables.css` (palette + Quicksand/Lexend via Google Fonts), `base.css`, `components.css`, `layout.css` from SRS §7.
- Build the app shell: Ink sidebar (nav with green active state), top bar (global search, notifications bell, profile), content area.
- Build reusable components: buttons, cards, status pills, tables, modals, toasts, form inputs, skeleton loaders.
**DoD:** A static shell renders with correct fonts/colours and all base components styled.

### Day 20 — API client & auth flow 🔵
**Objective:** Frontend talks to the API securely.
**Tasks:**
- `api.js`: central fetch/AJAX wrapper attaching JWT, parsing the envelope, auto-refreshing on `401`, surfacing errors as toasts.
- Login page: form, validation, token storage (in-memory + refresh handling), redirect to dashboard; logout.
- Route guard: redirect to login when unauthenticated.
**DoD:** Log in from the UI, land on the dashboard, token auto-refresh works, logout clears session.

### Day 21 — Dashboard UI 🔵
**Objective:** The landing experience.
**Tasks:**
- KPI cards (Quicksand numbers) fed by `/dashboard/stats/`.
- Charts with Chart.js: doughnut (status), bar (by category), line (value over time), plus recent activity list — all palette-consistent.
- Loading skeletons + empty states.
**DoD:** Dashboard shows live data and charts; responsive down to tablet.

### Day 22 — Asset list UI 🔵
**Objective:** Browse and manage assets.
**Tasks:**
- Asset table: sortable columns, status pills, filters (status/category/location/department), search box, pagination.
- "Add Asset" modal/drawer with full form + validation, category-driven custom fields, image upload.
- Row actions: view, edit, assign, retire.
**DoD:** Create, filter, search, paginate, and edit assets entirely from the UI.

### Day 23 — Asset detail UI 🔵
**Objective:** Deep view of one asset.
**Tasks:**
- Detail page: overview panel, current value + depreciation chart, attachments, custom fields.
- Tabs: History (assignment + maintenance timeline), Maintenance, Documents.
- Assign / check-in / retire actions with confirm modals; QR code display + print label.
**DoD:** All asset actions and history are usable from the detail page.

### Day 24 — Maintenance & procurement UI 🔵
**Objective:** Operational screens.
**Tasks:**
- Maintenance page: schedule form, list with status, "complete" action capturing actual cost.
- Vendors + Purchase Orders screens (CRUD, receive-PO).
- Warranty-expiry highlights.
**DoD:** Maintenance and procurement flows fully operable from UI.

### Day 25 — Masters, requests & settings UI 🔵
**Objective:** Admin & self-service screens.
**Tasks:**
- Masters management (categories with icon/color, locations, departments).
- User management (Admin) with role assignment.
- Asset request flow for employees + approvals inbox for managers.
- Notifications dropdown (mark read); profile/password settings.
**DoD:** Masters, users, requests, and notifications all work end-to-end.

### Day 26 — Reports UI, import/export & polish 🔵
**Objective:** Reporting and finishing touches.
**Tasks:**
- Reports screen with filters + one-click CSV/XLSX/PDF download.
- Import wizard: upload → validation report → confirm; export buttons on lists.
- Responsive QA, empty/error states everywhere, toast consistency, accessibility (focus, ARIA, contrast).
**DoD:** Reports and import/export usable; UI passes an accessibility + responsive review.

---

## Phase 4 — Integration, Testing & Launch (Days 27–30)

### Day 27 — End-to-end integration testing 🟡
**Objective:** Prove the whole system works together.
**Tasks:**
- Walk every user journey per role (Admin, Manager, Dept Head, Employee, Auditor) against acceptance criteria (SRS §11.4).
- Fix integration bugs; verify audit entries and notifications fire on real flows.
- Cross-browser check (Chrome, Edge, Firefox, Safari).
**DoD:** All primary journeys pass for every role; no `console`/500 errors in happy paths.

### Day 28 — Security & performance hardening 🟡
**Objective:** Make it safe and fast.
**Tasks:**
- Run through SRS §9 checklist: `DEBUG=False`, HTTPS/HSTS, CORS locked, throttling, file-upload validation, secrets in env.
- Load-test key endpoints; add/verify indexes; fix slow queries.
- Dependency vulnerability scan; verify soft-delete and RBAC can't be bypassed.
**DoD:** Security checklist complete; list endpoints meet the < 400 ms target on seed data.

### Day 29 — Deployment 🟡
**Objective:** Production environment live.
**Tasks:**
- Provision server: Nginx + Gunicorn + MySQL + Redis + Celery worker/beat.
- Configure env vars, static/media serving, TLS certificate, automated nightly DB backups.
- Deploy backend + frontend; run migrations; smoke-test in production.
- Set up basic logging/monitoring.
**DoD:** Trasset is reachable over HTTPS in production and passes a smoke test; backups scheduled.

### Day 30 — Docs, handover & buffer 🟡
**Objective:** Ship and hand over cleanly.
**Tasks:**
- Finalise API docs (Swagger), a README (setup/run/deploy), and a short admin/user guide.
- Seed production with real master data (categories, locations, departments, vendors) and initial users.
- Fix remaining minor bugs from the punch list; tag `v1.0` release.
- Retrospective + backlog for v1.1 (mobile app, IoT, multi-currency, SSO).
**DoD:** Documentation complete, `v1.0` tagged, stakeholders signed off.

---

---

# Release 2 — Mobile (Days 31–60)

**Goal:** A React Native app for iOS and Android that earns its place by doing
what the website cannot — scanning, working on the move, and working offline.

> Read SRS §12 before starting. In particular §12.1 (the app is not a smaller
> dashboard) and §12.8 (what is deliberately excluded). The commonest way this
> phase fails is by trying to port the web UI.

---

## Phase 5 — API groundwork (Days 31–35) 🟢

Everything here is SRS §12.4. None of it is mobile code; all of it is needed
before mobile code is worth writing.

### Day 31 — Mobile sessions & device registry 🟢
**Objective:** A phone can stay signed in, and the server knows how to reach it.
**Tasks:**
- **BE-1:** client-aware refresh lifetime. A `X-Client: mobile` header (or a distinct token claim) selects a 30-day refresh; web stays at 7. A weekly forced logout trains people to distrust the app.
- **BE-2:** `Device` model (user, platform, push token, app version, last seen) with `POST /auth/devices/` to register and `DELETE /auth/devices/{id}/` on sign-out.
- Re-register on token rotation; one device row per token, deduplicated.
- Tests: lifetimes differ by client; a stale token is replaced rather than duplicated.
**DoD:** A device registers, appears against the user, and is removed on sign-out.

### Day 32 — Idempotency 🟢
**Objective:** A replayed request cannot apply twice. **BE-4 — the single most important change for offline.**
**Tasks:**
- `IdempotencyKey` model (key, user, endpoint, request fingerprint, response body, status, created_at).
- Middleware or mixin on unsafe methods: an `Idempotency-Key` header that has been seen returns the **stored response** rather than re-executing.
- A key reused with a *different* payload is a `409` — that is a client bug, not a retry.
- Expire keys after 24 hours.
- Tests: double-posted assign creates one assignment; concurrent duplicates serialise; mismatched replay is refused.
**DoD:** Sending the same assign twice with one key produces one check-out and two identical responses.

### Day 33 — Delta sync, tag lookup, device throttle 🟢
**Objective:** A phone can sync cheaply and scan unambiguously.
**Tasks:**
- **BE-5:** `?updated_since=` on the asset, request, maintenance and notification lists. Re-downloading the register on every launch is not viable over mobile data.
- Include soft-deleted rows in delta responses so a client can drop them locally — otherwise deletions never propagate.
- **BE-6:** `GET /assets/by-tag/{tag}/` — exact, single-result lookup. Scanning currently means a search plus picking the first hit.
- **BE-8:** per-device throttle scope, so a sync burst on reconnect does not trip the shared user limit.
**DoD:** A delta request returns only what changed, including deletions; a scan resolves in one call.

### Day 34 — Push dispatch 🟢
**Objective:** Notifications reach the device.
**Tasks:**
- **BE-3:** extend `apps/notifications/services.py` — one dispatch point already exists, so add push there rather than building a parallel path.
- Celery task per device token, with retry and backoff.
- Prune tokens the provider reports as dead.
- Payload carries the deep-link target (FR-14.23).
- Respect the existing per-user notification preference.
**DoD:** An assignment produces an in-app record, an email, and a push to every registered device.

### Day 35 — Stock take API 🟢
**Objective:** The data model behind the app's most valuable feature.
**Tasks:**
- **BE-7:** `StockTake` (location, started_by, status, started_at, submitted_at) and `StockTakeEntry` (asset, scanned_at, state: found / missing / unexpected).
- `POST /stock-takes/`, `POST /stock-takes/{id}/scan/`, `POST /stock-takes/{id}/submit/`.
- Submit reconciles scanned against expected for the location and produces the report.
- Accept a batch of scans in one call — an offline session submits everything at once.
- Idempotent submit, since it will be replayed.
**DoD:** A session opens, accepts a batch of scans, and submits a reconciliation of found, missing and unexpected.

---

## Phase 6 — App foundation (Days 36–41) 📱

### Day 36 — Project setup 📱
**Objective:** An app that builds and runs on both platforms.
**Tasks:**
- Expo + TypeScript + expo-router; `mobile/` per SRS §10.5.
- ESLint, Prettier, absolute imports, EAS build profiles (dev / preview / production).
- Environment config for API base URL per profile.
- Run on an iOS simulator and an Android emulator.
**DoD:** A blank app builds and runs on both; a dev build is installable on a real device.

### Day 37 — API client 📱
**Objective:** Typed access to the API, generated not hand-written.
**Tasks:**
- Generate TypeScript types from `/api/schema/` — the payoff for keeping the schema clean.
- Fetch wrapper: JWT header, envelope unwrapping, single-flight refresh on 401, typed errors. Mirror `frontend/js/api.js`, which already solves this.
- TanStack Query provider, sensible retry and stale times.
- Wire the generator into a script so the client cannot drift from the API.
**DoD:** A typed call returns unwrapped data; a 401 refreshes and replays once.

### Day 38 — Authentication 📱
**Objective:** Sign in, stay in, sign out cleanly.
**Tasks:**
- Sign-in screen; refresh token to **expo-secure-store**, never AsyncStorage (FR-14.2).
- Silent refresh on launch; splash held until the session resolves.
- Biometric unlock (FR-14.4), with a password fallback that always works.
- Sign-out blacklists the refresh token and deletes the device registration.
- Session-expiry handling that returns to sign-in without losing queued work.
**DoD:** Sign in, force-quit, reopen — still signed in. Sign out leaves nothing in storage.

### Day 39 — Design system 📱
**Objective:** Brand-consistent primitives, before screens start improvising.
**Tasks:**
- Theme tokens mirroring `css/variables.css`, including the ten chart colours and the split Slate (fill vs text).
- Quicksand + Lexend loaded and applied.
- Primitives: Button, Card, StatusPill, Avatar, Input, EmptyState, **OfflineBanner**, Skeleton, Toast.
- **Dark mode from the start** — retrofitting it is far more expensive.
- 44×44pt minimum targets; screen-reader labels on every icon-only control.
**DoD:** A component gallery screen renders every primitive in light and dark.

### Day 40 — Scanning 📱
**Objective:** The reason the app exists.
**Tasks:**
- Camera screen with expo-camera; QR and 1D barcodes (FR-14.6, FR-14.7).
- Permission flow that explains itself, and recovers when permission was denied earlier.
- Haptic feedback on a successful scan — the user is often not looking at the screen.
- Resolve via `GET /assets/by-tag/`; barcodes fall back to serial lookup.
- Manual entry fallback for damaged labels (FR-14.8).
- Clear, actionable state for "scanned something Trasset does not recognise".
**DoD:** Scanning an asset's label opens its detail in under 2 seconds (MNFR-2).

### Day 41 — Asset detail 📱
**Objective:** What you need while standing in front of the thing.
**Tasks:**
- Detail screen: identity, status pill, holder, location, category, warranty, value.
- Assignment history.
- Actions surfaced by state and role, matching the web rules.
- Deep-linkable route for push and QR.
**DoD:** Scan → detail → history, working on a real device.

---

## Phase 7 — Core journeys (Days 42–47) 📱

### Day 42 — My assets & search 📱
**Tasks:** "My assets" list (FR-14.12); register search with a **deliberately narrower** filter set than the web; pull-to-refresh; pagination.
**DoD:** A user finds an asset by name, tag or serial, and sees what they hold.

### Day 43 — Assign & check in 📱
**Tasks:** Assign flow with user picker; check-in with condition notes; optimistic UI; **409 surfaced as a resolvable conflict**, not a dead end.
**DoD:** A manager assigns and checks in from the phone; a conflicting assign explains what happened.

### Day 44 — Camera & issues 📱
**Tasks:** Photo capture and upload to attachments (FR-14.13); client-side resize before upload — a 12 MP photo over mobile data is unacceptable; report-an-issue raising a maintenance record (FR-14.14).
**DoD:** A photo taken on the device appears on the asset in the web app.

### Day 45 — Requests & approvals 📱
**Tasks:** Raise a request (FR-14.16); approvals inbox with approve/reject and reason (FR-14.17); role-aware screens.
**DoD:** An employee requests on mobile; an approver approves on mobile; the asset is assigned.

### Day 46 — Notifications & deep links 📱
**Tasks:** Register for push; permission priming; foreground, background and cold-start handling; tap-to-open routing (FR-14.23); in-app list mirroring `/notifications/`; badge counts.
**DoD:** A push arrives on a real device and opens the right record from a cold start.

### Day 47 — Profile & settings 📱
**Tasks:** Profile, password change, notification preferences, theme override, sign-out; about screen with version and build for support.
**DoD:** Preferences persist and are honoured by the server.

---

## Phase 8 — Offline & stock take (Days 48–53) 📱

This phase is what separates a real field app from a website in a wrapper.

### Day 48 — Offline reads 📱
**Tasks:** Persist the TanStack Query cache; **show cached data with its age** so nobody mistakes stale for live; offline banner; ensure every screen has an offline state rather than an endless spinner.
**DoD:** In aeroplane mode, recently viewed assets and "my assets" still open.

### Day 49 — Mutation queue 📱
**Tasks:** Durable queue surviving app restart; client-generated idempotency keys; ordered drain on reconnect; optimistic updates marked pending; exponential backoff.
**DoD:** Check an asset in with no signal, force-quit, reconnect — it syncs exactly once.

### Day 50 — Conflicts 📱
**Tasks:** Conflict screen listing queued actions the server refused, with what happened and what to do; retry and discard; never drop a failed action silently (FR-14.27).
**DoD:** A queued assign for an asset someone else took is explained, not swallowed.

### Day 51 — Stock take, part 1 📱
**Tasks:** Start a session scoped to a location; download the expected asset list for offline use; continuous scan loop (FR-14.9) with running found / missing / unexpected counts; duplicate scans recognised, not double-counted.
**DoD:** A hundred assets can be scanned in sequence without leaving the screen.

### Day 52 — Stock take, part 2 📱
**Tasks:** Full offline operation (FR-14.21); submit the batch on reconnect; reconciliation summary; resume an interrupted session.
**DoD:** A stock take completed entirely offline submits correctly on reconnect.

### Day 53 — Offline hardening 🟡📱
**Tasks:** Test the nasty cases — signal lost mid-request, token expiring while queued, clock skew, storage full, app killed mid-drain. Instrument queue depth and failures.
**DoD:** No path loses a user's work; every failure is visible and recoverable.

---

## Phase 9 — Release (Days 54–60) 🟡📱

### Day 54 — Accessibility & dark mode 🟡
**Tasks:** VoiceOver and TalkBack passes; dynamic type; contrast parity with §7.1; focus order; dark mode across every screen.
**DoD:** Primary journeys complete with a screen reader and at largest type size.

### Day 55 — Performance 🟡
**Tasks:** Cold start under 3 s (MNFR-1); scan-to-detail under 2 s (MNFR-2); bundle under 60 MB (MNFR-3); list virtualisation; image caching; profile on a genuinely mid-range Android device, not a flagship.
**DoD:** All three targets met on the low-end test device.

### Day 56 — Security 🟡
**Tasks:** Certificate pinning (MNFR-6); confirm no secrets in the bundle (MNFR-5); verify secure-store usage; screenshot suppression on sensitive screens; crash reporting with release tagging (MNFR-7); dependency audit.
**DoD:** A bundle inspection finds no secrets; pinning verified against a proxy.

### Day 57 — Device matrix & E2E 🟡
**Tasks:** Maestro flows for sign-in, scan, assign, offline check-in, stock take; run across the OS versions in §2.4; small-screen and large-screen layouts; tablet sanity check (phone layout, per §12.8).
**DoD:** The E2E suite passes on the full matrix.

### Day 58 — Store preparation 🟡
**Tasks:** Icons, splash screens, store listings, screenshots, privacy policy and data-safety declarations; production EAS builds; TestFlight and Play internal testing.
**DoD:** Builds are in both testing tracks and installable by testers.

### Day 59 — Beta 🟡
**Tasks:** Real users, real stock rooms, real bad signal — the conditions the app was built for. Fix what beta finds. Re-run E2E.
**DoD:** Beta feedback triaged; blockers fixed.

### Day 60 — Release 🟡
**Tasks:** Submit to both stores, allowing for review time; publish; monitor crash rates; tag `mobile-v1.0`; update the README and admin guide; retrospective and v1.2 backlog.
**DoD:** The app is live on both stores and monitored.

---

## Milestones at a Glance

| Day | Milestone |
|-----|-----------|
| 5  | Foundation done — auth, RBAC, masters live |
| 12 | Core asset engine complete — CRUD, assignment, depreciation, audit |
| 18 | Backend feature-complete — maintenance, procurement, reports, notifications |
| 26 | Web frontend feature-complete — all screens wired to API |
| 30 | **v1.0 deployed to production** |
| 35 | API ready for mobile — idempotency, delta sync, push, stock take |
| 41 | App foundation — auth, design system, scanning, asset detail |
| 47 | Core mobile journeys complete |
| 53 | Offline and stock take working |
| 60 | **Mobile v1.0 live on both stores** |

## Risk & Contingency

**Web (Days 1–30)**
- **Slippage:** Protect `[H]` MVP items (auth, assets, assignment, dashboard, depreciation, reports). Defer `[M]/[L]` (recurring maintenance, PO auto-create, label sheets) to a later release.
- **MySQL/deploy surprises:** Reserve Day 30 as buffer.
- **Solo dev:** Sequence backend fully (Days 1–18) before frontend (19–26); expect the timeline to stretch ~1.4×.

**Mobile (Days 31–60)**
- **App review is not in your control.** Apple review can take days and can reject on first submission. Day 60 is a *submission* target, not a guaranteed live date. Submit the first build to TestFlight by Day 58 so the review clock starts early.
- **Offline is where the time goes.** Phase 8 is six days and is the most likely to overrun. If it slips, ship offline *reads* and stock take, and defer offline *writes* — reading an asset with no signal is most of the value.
- **Do not skip Phase 5.** Building the client against an API without idempotency means rewriting the sync layer later. It is the least visible work in the plan and the most expensive to retrofit.
- **Test on a cheap Android device.** A flagship phone hides every performance problem the app has. Buy or borrow a mid-range device before Day 55, not during it.
- **Physical labels are a dependency.** Scanning is worthless without QR labels attached to assets (SRS §2.6). Printing and applying them is an operational task that needs to start well before Day 40.
- **If mobile slips, the web release is unaffected** — v1.0 is already in production by Day 30. That separation is deliberate.

## Daily Habits
- Commit every day on `dev`; PR to `main` at each milestone.
- Write tests alongside features (don't batch them at the end).
- Keep Swagger and this plan in sync with reality.
- **Mobile:** run on a real device every day, not just a simulator. Simulators
  hide permission prompts, camera behaviour, notch layout, haptics and every
  performance problem you have.
- **Mobile:** regenerate the API client whenever the schema changes, so drift is
  caught by the type checker rather than by a user.

---

*Trasset Build Plan — 60 working days across two releases. Pair with `Trasset_SRS.md`.*
