# Trasset — Progress Log

> **This file is the source of truth for where the build stands.**
> Say **"resume from last"** and work restarts from the *Next up* section below.
> Update this file at the end of every working session.

**Started:** 2026-07-27
**Last updated:** 2026-07-27
**Plan:** [`Trasset_Build_Plan.md`](Trasset_Build_Plan.md) · **Contract:** [`Trasset_SRS.md`](Trasset_SRS.md)
**Repo:** https://github.com/Shivamchaubey14/trasset (public) · branches `main`, `dev`

---

## Status at a glance

| Phase | Days | Status |
|-------|------|--------|
| Phase 0 — Foundation | 1–5 | ✅ Complete |
| Phase 1 — Core Asset Engine | 6–12 | 🟡 Day 6 done · Day 9 engine done · Days 7, 8, 10–12 open |
| Phase 2 — Maintenance, Procurement, Reports | 13–18 | 🟡 Day 15 dashboard API done · rest open |
| Phase 3 — Frontend | 19–26 | 🟡 Days 19, 20, 21 done · Day 25 partly done |
| Phase 4 — Integration, Testing & Launch | 27–30 | ⬜ Not started |

**Backend test suite:** 105 tests, all passing · **Coverage:** 77.9% (target ≥ 70%, NFR-12)

> **Note on sequencing.** The plan runs backend-first (Days 1–18) then frontend
> (19–26). At the user's request the frontend was pulled forward once auth,
> users and masters were live, so those screens are real rather than mocked.
> Asset screens still wait on the Day 7 asset API.

---

## ▶ Next up — start here

**Day 7 — Asset CRUD API** 🟢 — the one thing blocking the rest of the UI.

1. Asset serializers: lightweight list vs. nested detail (category / location / vendor / assignee).
2. `AssetViewSet` with create / list / retrieve / update / soft-delete.
3. Filtering by status, category, location, department, assignee and date ranges;
   search by tag / name / serial; ordering.
4. Image + attachment upload endpoints with validation.
5. Uncomment `path("", include("apps.assets.urls"))` in `backend/config/api_urls.py`.

**DoD:** Assets fully CRUD via API with filters, search and pagination; validation
errors are structured.

Then **Day 22 (Asset list UI)** can follow immediately — the table, toolbar,
modal-form and pagination patterns are already built and reusable from
`js/masters.js`.

Groundwork in place: the `Asset` / `Attachment` models, tag generator,
depreciation service, `common/viewsets.BaseModelViewSet`, and 42 demo assets
already seeded.

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

### Day 9 — Depreciation engine ✅ (endpoint pending)
- `apps/assets/services/depreciation.py` — straight-line and declining balance
  per SRS §11.1, in `Decimal`, floored at salvage.
- `Asset.current_value` recomputed on save; `Asset.depreciation_schedule()`
  returns the year-by-year table.
- **Pending:** `GET /assets/{id}/depreciation/` needs Day 7's viewset; the
  monthly recalculation task lands on Day 18.

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
```

**Frontend** — all 21 files serve over HTTP; every JS file and inline block
passes a syntax check. Not yet clicked through in a browser (see below).

---

## Deferred / known gaps

- **Browser click-through not done.** The pages were verified by serving them,
  syntax-checking every script, and exercising the exact API calls each page
  makes — but nobody has driven the real UI yet. Expect small visual fixes on
  first run.
- Asset, maintenance, procurement, reports and audit screens show a "soon" badge
  in the sidebar; their backends aren't built.
- Global search in the top bar toasts "coming with the assets screen" rather than
  searching — deliberate, since `/assets/` doesn't exist yet.
- Notifications dropdown renders an empty state; the model arrives on Day 18.
- `Conflict` (409) is raised by the DB-constraint path but not yet by the asset
  state machine — that lands with Day 8's assignment guards.
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
