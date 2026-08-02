<div align="center">

# Trasset

**Asset Management System** — track physical and digital assets across their full lifecycle,
from procurement to disposal.

`Django REST Framework` · `MySQL 8` · `HTML / CSS / JS / jQuery` · `React Native (Expo)`

</div>

---

## What it does

- Centralised asset registry with categories, locations, departments and vendors
- Check-out / check-in assignment with immutable history
- Maintenance scheduling and cost tracking
- Purchase orders, receiving and warranty alerts
- Automatic depreciation (straight-line & declining balance) and valuation
- QR / barcode generation and scan-to-asset lookup
- Bulk CSV/XLSX import and export
- Role-based dashboards, reports and analytics
- Full audit trail plus in-app and email notifications

Five roles shape what each person sees: **Super Admin**, **Asset Manager**,
**Department Head**, **Employee** and **Auditor**.

---

## Repository layout

```
trasset/
├─ backend/                 Django REST Framework API
│  ├─ config/               settings (base/dev/prod/test), urls, celery
│  ├─ apps/
│  │  ├─ accounts/          users, roles, JWT auth
│  │  ├─ masters/           categories, locations, departments, vendors
│  │  ├─ assets/            assets, assignments, attachments, depreciation
│  │  ├─ maintenance/       maintenance records and schedules
│  │  ├─ procurement/       purchase orders
│  │  ├─ reports/           dashboard, reports, exports
│  │  ├─ notifications/     in-app + email
│  │  └─ audit/             audit logging
│  ├─ common/               envelope renderer, pagination, permissions, base models
│  └─ tests/                test suite
├─ frontend/                HTML/CSS/JS/jQuery dashboard
├─ mobile/                  React Native (Expo) app for the field
│  ├─ src/api/              typed client, generated from the OpenAPI schema
│  ├─ src/offline/          persisted cache, durable mutation queue
│  ├─ src/stocktake/        counting sessions, reconciled on the phone
│  ├─ src/screens/          scan, assets, requests, alerts, settings
│  └─ scripts/              verification scripts, run against a live server
└─ docs/                    SRS, build plan, progress log
```

---

## Getting started

**Requires:** Python 3.11+, MySQL 8.x

```bash
cd backend

# 1. Virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
source venv/bin/activate       # Linux / macOS

# 2. Dependencies
pip install -r requirements.txt

# 3. Configuration
cp .env.example .env           # then fill in DB credentials and a secret key

# 4. Database
mysql -u root -p -e "CREATE DATABASE trasset CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
python manage.py migrate

# 5. Seed roles, an admin account and demo master data
python manage.py bootstrap --demo

# 6. Run
python manage.py runserver
```

The API is then at `http://127.0.0.1:8000/api/v1/` and interactive docs at
`http://127.0.0.1:8000/api/docs/`.

### Frontend

The frontend is static — serve it from any web server:

```bash
cd frontend
python -m http.server 5500
```

Then open `http://127.0.0.1:5500`. The origin must appear in `CORS_ALLOWED_ORIGINS`.

### Background jobs (optional in development)

Notification emails and the scheduled scans run through Celery. In development
`CELERY_TASK_ALWAYS_EAGER=True` runs them inline, so **no broker is needed** to
use the app. To run them for real:

```bash
# Requires Redis on REDIS_URL
celery -A config worker --loglevel=info --pool=solo   # --pool=solo on Windows
celery -A config beat   --loglevel=info               # the scheduler
```

Scheduled jobs: monthly depreciation recalculation, a daily warranty-expiry
scan, and a daily maintenance-due scan.

---

## Demo accounts

Created by `python manage.py bootstrap --demo`. Password for all: `Trasset@2026`

| Role | Email |
|------|-------|
| Super Admin | `admin@trasset.local` |
| Asset Manager | `manager@trasset.local` |
| Department Head | `head@trasset.local` |
| Employee | `employee@trasset.local` |
| Auditor | `auditor@trasset.local` |

> These are development conveniences. Never seed demo accounts into production.

---

## API conventions

Every response uses the same envelope:

```json
{
  "success": true,
  "message": "Assets retrieved successfully",
  "data": { "count": 120, "page": 1, "total_pages": 5, "next": "…", "previous": null, "results": [] },
  "errors": null
}
```

Errors keep the shape, with `success: false`, `data: null` and field-level `errors`:

```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "errors": { "color": ["Colour must be a 6-digit hex value such as #3BB77E."] }
}
```

- **Auth:** `Authorization: Bearer <access_token>` (JWT, 15-minute access, rotating refresh)
- **Pagination:** `?page=&page_size=` (default 25, max 200)
- **Filtering / search / ordering:** `?status=&search=&ordering=`
- **Versioning:** everything under `/api/v1/`

---

## Testing

```bash
cd backend
python manage.py test tests                          # settings auto-switch to test config
python -m coverage run manage.py test tests
python -m coverage report
```

Test settings disable throttling and use fast password hashing, so the run is
deterministic and quick.

---

## The mobile app

The field client (SRS §12). It is offline-first because a store room is where
the signal is worst: reads come from a persisted cache with their age shown,
writes go to a durable queue that survives a force-quit and drains on reconnect,
and a stock take is reconciled on the phone so a hundred scans cost one request.

**Requires:** Node 20+, and the Expo Go app on a handset (or a development build
for push notifications, which Expo Go dropped in SDK 53).

```bash
cd mobile
npm install
npx expo start -c          # scan the QR with Expo Go
```

The API host is derived from the packager, so the phone finds the backend
without configuration — but the backend must be bound to all interfaces
(`runserver 0.0.0.0:8000`), because `127.0.0.1` from a phone is the phone.

### Verification

Behaviour that matters is checked against a **live server** rather than mocks,
so the scripts need the backend running and the demo data seeded.

```bash
npm run verify:queue        # durable writes: exactly-once under replay
npm run verify:offline      # cached reads, ages, what may be persisted
npm run verify:hardening    # expired tokens, clock skew, full disk, killed drains
npm run verify:stocktake    # a hundred scans in sequence
```

`npm run tsc` typechecks. The full list is in `mobile/package.json`.

---

## Documentation

| Document | Purpose |
|----------|---------|
| [`docs/Trasset_SRS.md`](docs/Trasset_SRS.md) | Software Requirements Specification — the contract |
| [`docs/Trasset_Build_Plan.md`](docs/Trasset_Build_Plan.md) | 60-day build plan with per-day objectives and DoD |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Running log of what is built and what is next |
| [`docs/Trasset_Design_Tokens.md`](docs/Trasset_Design_Tokens.md) | Colour and type tokens, with measured contrast ratios |

---

## Design tokens

| Token | Name | Hex |
|-------|------|-----|
| `--color-primary` | Nest Green | `#3BB77E` |
| `--color-accent` | Cream Yolk | `#FDC040` |
| `--color-ink` | Ink | `#253D4E` |
| `--color-bg` | Cloud | `#F4F6F8` |
| `--color-muted` | Slate | `#7B8794` |
| `--color-danger` | Coral | `#E5484D` |

Type: **Quicksand** for the wordmark, headings and KPI numbers; **Lexend** for
body text, tables, forms and buttons.
