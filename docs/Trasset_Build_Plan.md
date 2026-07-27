# Trasset — 30-Day Build Plan

**Goal:** Ship a production-ready v1 of Trasset (DRF + MySQL API and HTML/CSS/JS/jQuery dashboard) in 30 working days.
**Assumptions:** 1–2 developers, ~6–7 focused hours/day. Fonts: Quicksand + Lexend. Palette: Nest Green `#3BB77E`, Cream Yolk `#FDC040`, Ink `#253D4E`.

> **How to use this plan:** Each day has an **Objective**, concrete **Tasks**, and a **Definition of Done (DoD)**. Commit at the end of every day. Keep the SRS open as your contract. If you fall behind, protect the "High priority (MVP)" items and defer the `[M]/[L]` ones.

---

## Legend
- 🟢 Backend (DRF/MySQL) · 🔵 Frontend (HTML/CSS/JS/jQuery) · 🟡 DevOps/Testing/Docs

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

## Milestones at a Glance

| Day | Milestone |
|-----|-----------|
| 5  | Foundation done — auth, RBAC, masters live |
| 12 | Core asset engine complete — CRUD, assignment, depreciation, audit |
| 18 | Backend feature-complete — maintenance, procurement, reports, notifications |
| 26 | Frontend feature-complete — all screens wired to API |
| 30 | **v1.0 deployed to production** |

## Risk & Contingency
- **Slippage:** Protect `[H]` MVP items (auth, assets, assignment, dashboard, depreciation, reports). Defer `[M]/[L]` (recurring maintenance, PO auto-create, label sheets) to v1.1.
- **MySQL/deploy surprises:** Reserve Day 30 as buffer.
- **Solo dev:** Sequence backend fully (Days 1–18) before frontend (19–26); expect the timeline to stretch ~1.4×.

## Daily Habits
- Commit every day on `dev`; PR to `main` at each milestone.
- Write tests alongside backend features (don't batch them at the end).
- Keep Swagger and this plan in sync with reality.

---

*Trasset 30-Day Build Plan — pair with `Trasset_SRS.md`.*
