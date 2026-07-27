# Trasset — Progress Log

> **This file is the source of truth for where the build stands.**
> Say **"resume from last"** and work restarts from the *Next up* section below.
> Update this file at the end of every working session.

**Started:** 2026-07-27
**Last updated:** 2026-07-27
**Plan:** [`Trasset_Build_Plan.md`](Trasset_Build_Plan.md) · **Contract:** [`Trasset_SRS.md`](Trasset_SRS.md)

---

## Status at a glance

| Phase | Days | Status |
|-------|------|--------|
| Phase 0 — Foundation | 1–5 | ✅ Complete |
| Phase 1 — Core Asset Engine | 6–12 | 🟡 In progress (Day 6 done, Day 9 partly done) |
| Phase 2 — Maintenance, Procurement, Reports | 13–18 | ⬜ Not started |
| Phase 3 — Frontend | 19–26 | ⬜ Not started |
| Phase 4 — Integration, Testing & Launch | 27–30 | ⬜ Not started |

**Backend test suite:** 89 tests, all passing · **Coverage:** 79.8% (target ≥ 70%, NFR-12)

---

## ▶ Next up — start here

**Day 7 — Asset CRUD API** 🟢

1. Asset serializers: lightweight list vs. nested detail (category / location / vendor / assignee).
2. `AssetViewSet` with create / list / retrieve / update / soft-delete.
3. Filtering by status, category, location, department, assignee and date ranges;
   search by tag / name / serial; ordering.
4. Image + attachment upload endpoints with validation.
5. Uncomment `path("", include("apps.assets.urls"))` in `backend/config/api_urls.py`.

**DoD:** Assets fully CRUD via API with filters, search and pagination; validation
errors are structured.

Groundwork already in place: the `Asset` and `Attachment` models, the tag
generator, the depreciation service and `common/viewsets.BaseModelViewSet`.

---

## Completed

### Day 1 — Project setup & environment ✅
- Directory tree at `D:\trasset` (`backend/`, `frontend/`, `docs/`).
- Python 3.13 virtualenv at `backend/venv`; dependencies pinned in `requirements.txt`.
- Django project with split settings — `config/settings/{base,dev,prod,test}.py`,
  all secrets read from `.env` via `django-environ` (SEC-10).
- MySQL database `trasset` created (utf8mb4) and connected; initial migrate green.
- All eight app packages scaffolded per SRS §10.2 plus `common/` and `tests/`.
- `.gitignore`, `README.md`, `.env.example`.

**Note:** `mysqlclient` has no wheel for Python 3.13 on Windows, so
`config/__init__.py` falls back to PyMySQL via `install_as_MySQLdb()`.
`requirements.txt` still installs `mysqlclient` on Linux for the production deploy.

### Day 2 — Common layer & conventions ✅
- `common/renderers.py` — `EnvelopeJSONRenderer` wraps every response in
  `{success, message, data, errors}` (SRS §5.1) and derives the message from the
  view + HTTP method, overridable per response.
- `common/exceptions.py` — envelope error handler, plus `Conflict` (409),
  `UnprocessableEntity` (422) and `ServiceError`; unhandled errors are logged
  server-side and return a generic body (NFR-8).
- `common/pagination.py` — `StandardPagination` (25 default, 200 max) returning
  `count / page / page_size / total_pages / next / previous / results`.
- `common/permissions.py` + `common/roles.py` — role matrix driven by
  `read_roles` / `write_roles` / `action_roles` on each view (SEC-3).
- `common/models.py` — `TimeStampedModel`, `SoftDeleteModel` with
  `objects` / `all_objects` managers.
- `common/validators.py` — upload type/size validation (SEC-8), hex colour validator.
- `common/viewsets.py` — `BaseModelViewSet` / `BaseReadOnlyViewSet` with write throttling.
- `drf-spectacular` wired to `/api/schema/`, `/api/docs/`, `/api/redoc/`.
- `GET /api/v1/health/` liveness probe.

### Day 3 — Accounts: models & auth ✅
- Custom `User` (email login, one role, department, avatar, timezone,
  notification preference, lockout counters) and `Role` model.
- Five roles seeded by data migration `accounts/0003_seed_roles.py`.
- Argon2 password hashing (SEC-1).
- Endpoints: `/auth/login/`, `/auth/refresh/`, `/auth/logout/` (blacklist),
  `/auth/me/` (GET + PATCH), `/auth/password/change/`, `/auth/password/reset/`,
  `/auth/password/reset/confirm/`.
- Login returns the token pair **and** the user profile, so the UI can render the
  shell without a second round trip.
- Password reset gives the same answer for known and unknown emails, so it can't
  be used to enumerate accounts.
- Django admin registered for `User` and `Role`.

### Day 4 — RBAC & user management ✅
- `HasRolePermission` enforces the SRS §2.3 matrix server-side; the auditor
  read-only guard applies everywhere regardless of what a view declares.
- `UserViewSet` (Super Admin only) with filter/search/order; `DELETE` deactivates
  rather than destroys, and self-deactivation returns 422.
- Extra actions: `POST /users/{id}/activate/`, `POST /users/{id}/unlock/`.
- `RoleViewSet` — read-only list of the five roles.
- Account lockout after 5 failed logins for 15 minutes (FR-1.5), configurable via env.
- Throttle scopes: `auth` on every auth endpoint, `write` on all unsafe methods (SEC-7).

### Day 5 — Master data models & APIs ✅
- `Category` (icon, hex colour, `custom_fields` JSON), `Location` (address + geo),
  `Department` (head user, code), `Vendor` (contact details, tax number).
- Full CRUD ViewSets with search, filter, ordering and live `asset_count`
  annotations; departments also report `member_count`.
- `custom_fields` validated and normalised on write — keys unique and
  identifier-safe, types restricted to text/number/date/select/boolean, `select`
  requires options, labels auto-derived (FR-3.8).
- Deletion of a master record is restricted to Super Admin.
- Django admin for all four, with a colour swatch on categories.
- `manage.py bootstrap --demo` seeds an admin, one user per role, and starter
  categories / locations / departments / vendors.

### Day 6 — Asset model & tag generation ✅
- `Asset` model per SRS §4.1: identity, category/location/department/vendor/assignee,
  financials, warranty, image, `custom_data`, soft delete, `created_by`.
- Composite indexes from SRS §4.3 (`status+category`, `status+is_deleted`,
  `department+status`, `warranty_expiry`).
- `AssetTagCounter` + `next_asset_tag()` generate `TRA-YYYY-000001` sequentially,
  restarting each year, with `SELECT … FOR UPDATE` so concurrent creates can't collide.
- `Attachment` model with type/size validation (FR-3.7).
- State-machine helpers (`can_be_assigned`, `can_be_maintained`, `is_terminal`)
  and warranty helpers (`warranty_expiring_soon`, `warranty_expired`).

### Day 9 (partial) — Depreciation engine 🟡
- `apps/assets/services/depreciation.py` implements straight-line and
  declining-balance per SRS §11.1, in `Decimal`, floored at salvage value.
- `Asset.current_value` recomputed on every save; `Asset.depreciation_schedule()`
  returns the year-by-year table.
- Fully unit-tested (both methods, salvage floor, edge cases, schedule continuity).

**Still to do on Day 9:** expose `GET /assets/{id}/depreciation/` (needs Day 7's
viewset) and the monthly recalculation Celery task (Day 18).

---

## Verified working

```
GET  /api/v1/health/                          → 200 enveloped
POST /api/v1/auth/login/                      → 200 tokens + profile
GET  /api/v1/auth/me/                         → 200 profile
GET  /api/v1/categories/?page_size=2          → 200 paginated, asset_count annotated
POST /api/v1/categories/  (manager)           → 201
POST /api/v1/categories/  (auditor/employee)  → 403
GET  /api/v1/users/       (employee)          → 403
GET  /api/v1/users/       (admin)             → 200
GET  /api/v1/categories/  (no token)          → 401
GET  /api/v1/categories/9999/                 → 404
POST /api/v1/categories/  (bad colour)        → 400 with field-level errors
```

---

## Deferred / known gaps

- `Conflict` (409) is defined but not yet raised anywhere — it lands with the
  assignment guards on Day 8.
- Celery is configured (`config/celery.py`, beat schedule declared) but the tasks
  it references don't exist yet; dev runs eagerly so nothing breaks.
- Redis is not installed locally — not needed until Day 18.
- `frontend/` is scaffolded but empty; Phase 3 starts Day 19.
- Warranty flags are computed per-asset in Python; the dashboard aggregate query
  arrives on Day 15.

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

Run: `cd D:\trasset\backend && venv\Scripts\python.exe manage.py runserver`
Test: `venv\Scripts\python.exe manage.py test tests`
