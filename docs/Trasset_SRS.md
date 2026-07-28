# Software Requirements Specification (SRS)
## Trasset — Asset Management System

**Version:** 1.0
**Status:** Draft for Development
**Prepared for:** Engineering Team
**Stack:** Django REST Framework (DRF) · MySQL · HTML / CSS / JavaScript / jQuery
**Date:** July 2026

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [System Features & Functional Requirements](#3-system-features--functional-requirements)
4. [Data Model & Database Design](#4-data-model--database-design)
5. [API Design (REST)](#5-api-design-rest)
6. [External Interface Requirements](#6-external-interface-requirements)
7. [UI / UX Design Specification](#7-ui--ux-design-specification)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Security Requirements](#9-security-requirements)
10. [System Architecture](#10-system-architecture)
11. [Appendices](#11-appendices)

---

## 1. Introduction

### 1.1 Purpose
This document defines the complete software requirements for **Trasset**, a web-based Asset Management System. It specifies the functional and non-functional requirements, data model, REST API contract, UI/UX standards, and architecture needed to design, build, test, and deploy the system. It is the single source of truth for developers, testers, and stakeholders.

### 1.2 Scope
Trasset lets an organisation track physical and digital assets across their full lifecycle — from procurement to disposal. Core capabilities include:

- Centralised asset registry with categories, locations, and departments
- Assignment (check-out / check-in) of assets to employees
- Maintenance scheduling and history
- Vendor and purchase-order management
- Automatic depreciation calculation and valuation
- QR / barcode generation and scan-based lookup
- Bulk import/export (CSV / Excel)
- Role-based dashboards, reports, and analytics
- Full audit trail and notifications

**Out of scope (v1):** payroll integration, native mobile apps, multi-currency accounting, and IoT sensor telemetry. These are noted as future enhancements.

### 1.3 Definitions, Acronyms, Abbreviations

| Term | Meaning |
|------|---------|
| Asset | Any tracked item (laptop, vehicle, license, furniture, etc.) |
| Asset Tag | Unique human-readable identifier for an asset (e.g. `TRA-2026-000123`) |
| RBAC | Role-Based Access Control |
| DRF | Django REST Framework |
| JWT | JSON Web Token |
| SLA | Service Level Agreement |
| Depreciation | Systematic reduction of an asset's recorded value over time |
| Check-out / Check-in | Assigning an asset to / returning it from a user |

### 1.4 References
- IEEE 830-1998 SRS guidelines
- Django REST Framework documentation
- OWASP Application Security Verification Standard (ASVS)

### 1.5 Overview
Section 2 gives the big picture. Section 3 lists every feature and its requirements. Sections 4–5 define the data model and API. Sections 6–7 cover interfaces and design. Sections 8–10 cover quality attributes, security, and architecture.

---

## 2. Overall Description

### 2.1 Product Perspective
Trasset is a new, self-contained product with a decoupled architecture:

- **Backend:** DRF REST API serving JSON over HTTPS, backed by MySQL.
- **Frontend:** A server-agnostic single-page-style dashboard built with HTML, CSS, vanilla JS and jQuery, consuming the REST API via AJAX.
- The two tiers communicate only through the documented API, so either can evolve independently.

### 2.2 Product Functions (Summary)
- Manage assets, categories, locations, departments, vendors
- Assign and reclaim assets with full history
- Schedule and record maintenance
- Track purchase orders and warranties
- Auto-calculate depreciation and current value
- Generate QR/barcodes and resolve scans to asset detail
- Import/export data in bulk
- Produce reports, dashboards, and analytics
- Send in-app and email notifications
- Record an immutable audit log

### 2.3 User Classes and Characteristics

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| **Super Admin** | System owner | Full access, manage users/roles, system settings |
| **Asset Manager** | Manages inventory day-to-day | Create/edit assets, assign, schedule maintenance, run reports |
| **Department Head** | Oversees a department's assets | View & request assets for their department, approve returns |
| **Employee** | End user of assets | View assigned assets, request assets, report issues |
| **Auditor** | Read-only compliance role | View everything, export reports; cannot edit |

### 2.4 Operating Environment
- **Server:** Linux (Ubuntu 22.04+), Python 3.11+, MySQL 8.x, Nginx + Gunicorn
- **Client:** Any modern browser (Chrome, Edge, Firefox, Safari — last 2 versions)
- **Network:** HTTPS only

### 2.5 Design & Implementation Constraints
- Backend must use DRF; DB must be MySQL.
- Frontend must use HTML/CSS/JS/jQuery (no heavy SPA framework).
- Fonts limited to **Quicksand** (headings/brand) and **Lexend** (body/UI).
- Brand palette fixed (see §7).
- All timestamps stored in UTC; displayed in the user's timezone.

### 2.6 Assumptions and Dependencies
- Users have stable internet and a modern browser.
- An SMTP service is available for email notifications.
- Asset tags are unique organisation-wide.

---

## 3. System Features & Functional Requirements

Each requirement is tagged `FR-x.y` with a priority: **[H]**igh (MVP), **[M]**edium, **[L]**ow.

### 3.1 Authentication & Authorization
- **FR-1.1 [H]** The system shall allow users to log in with email + password and issue a JWT access/refresh token pair.
- **FR-1.2 [H]** The system shall refresh access tokens using a valid refresh token.
- **FR-1.3 [H]** The system shall enforce RBAC on every endpoint per §2.3.
- **FR-1.4 [H]** The system shall let users change their password and reset a forgotten password via email link.
- **FR-1.5 [M]** The system shall lock an account for 15 minutes after 5 consecutive failed logins.
- **FR-1.6 [M]** The system shall log out (blacklist refresh token) on request.

### 3.2 User Management
- **FR-2.1 [H]** Super Admin shall create, edit, deactivate, and delete users.
- **FR-2.2 [H]** Each user shall have exactly one role; role determines permissions.
- **FR-2.3 [M]** Users shall be assignable to a department.
- **FR-2.4 [M]** The system shall support inviting users by email.

### 3.3 Asset Management (Core)
- **FR-3.1 [H]** Managers shall create an asset with: name, category, unique asset tag, status, serial number, purchase date, purchase cost, vendor, location, department, warranty expiry, and optional image/attachments.
- **FR-3.2 [H]** The system shall auto-generate a sequential asset tag (`TRA-{YYYY}-{000001}`) if none is supplied.
- **FR-3.3 [H]** The system shall support asset statuses: `Available`, `Assigned`, `Under Maintenance`, `Retired`, `Lost`, `Disposed`.
- **FR-3.4 [H]** Managers shall edit and soft-delete assets (soft delete keeps history).
- **FR-3.5 [H]** The system shall support searching/filtering assets by tag, name, status, category, location, department, assignee, and date ranges.
- **FR-3.6 [H]** The system shall paginate asset lists (default 25/page).
- **FR-3.7 [M]** The system shall attach multiple documents (invoice, warranty PDF) to an asset.
- **FR-3.8 [M]** The system shall track custom fields per category (e.g. RAM for laptops, mileage for vehicles).

### 3.4 Asset Assignment (Check-out / Check-in)
- **FR-4.1 [H]** Managers shall assign an `Available` asset to a user; status becomes `Assigned`.
- **FR-4.2 [H]** Managers shall check an asset back in; status returns to `Available`.
- **FR-4.3 [H]** The system shall record every assignment/return with actor, target user, timestamp, and notes as immutable history.
- **FR-4.4 [M]** Employees shall request an available asset; a manager approves/rejects.
- **FR-4.5 [M]** The system shall prevent assigning an asset already assigned, under maintenance, or retired.

### 3.5 Categories, Locations, Departments, Vendors
- **FR-5.1 [H]** CRUD for asset categories (with optional icon/color).
- **FR-5.2 [H]** CRUD for locations/sites (name, address, geo optional).
- **FR-5.3 [H]** CRUD for departments.
- **FR-5.4 [H]** CRUD for vendors/suppliers (name, contact, email, phone, address).

### 3.6 Maintenance Management
- **FR-6.1 [H]** Managers shall schedule maintenance for an asset (type, scheduled date, assigned technician/vendor, cost estimate).
- **FR-6.2 [H]** Scheduling maintenance shall set asset status to `Under Maintenance` on start.
- **FR-6.3 [H]** Completing a maintenance record shall capture actual cost, notes, and completion date and restore status.
- **FR-6.4 [M]** The system shall support recurring/preventive maintenance schedules.
- **FR-6.5 [M]** The system shall notify managers of upcoming/overdue maintenance.

### 3.7 Procurement (Purchase Orders & Warranty)
- **FR-7.1 [M]** Managers shall create purchase orders (vendor, line items, quantity, unit cost, PO date, expected delivery).
- **FR-7.2 [M]** Receiving a PO shall optionally auto-create asset records from line items.
- **FR-7.3 [M]** The system shall flag warranties expiring within 30 days.

### 3.8 Depreciation & Valuation
- **FR-8.1 [H]** The system shall compute current book value using a configurable method: **Straight-Line** (default) or **Declining Balance**.
- **FR-8.2 [H]** Each asset shall store: purchase cost, salvage value, useful life (years), method.
- **FR-8.3 [M]** The system shall expose a depreciation schedule (year-by-year value) per asset.
- **FR-8.4 [M]** A scheduled job shall recalculate book values monthly.

### 3.9 QR / Barcode
- **FR-9.1 [M]** The system shall generate a QR code encoding the asset's detail URL/tag.
- **FR-9.2 [M]** The system shall resolve a scanned tag to the asset detail view.
- **FR-9.3 [L]** The system shall produce printable label sheets (QR + tag + name).

### 3.10 Import / Export
- **FR-10.1 [M]** Managers shall bulk-import assets from CSV/XLSX with a downloadable template and validation report.
- **FR-10.2 [M]** Users shall export filtered asset lists and reports to CSV/XLSX/PDF.

### 3.11 Dashboard, Reports & Analytics
- **FR-11.1 [H]** The dashboard shall show KPIs: total assets, total value, assigned vs available, under maintenance, expiring warranties.
- **FR-11.2 [H]** The dashboard shall show charts: assets by category, assets by status, value over time, assignments trend.
- **FR-11.3 [M]** The system shall generate reports: asset register, depreciation report, maintenance cost report, assignment report, audit report.
- **FR-11.4 [M]** Reports shall be filterable by date, department, location, category and exportable.

### 3.12 Notifications
- **FR-12.1 [M]** The system shall send in-app notifications for assignments, maintenance due, warranty expiry, and requests.
- **FR-12.2 [M]** The system shall send email notifications for the same events (user-configurable).

### 3.13 Audit Trail
- **FR-13.1 [H]** The system shall record who did what and when for every create/update/delete/assign action.
- **FR-13.2 [H]** Audit logs shall be immutable and viewable/exportable by Admins and Auditors.

---

## 4. Data Model & Database Design

### 4.1 Core Entities (MySQL)

**users**
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| full_name | VARCHAR(150) | |
| email | VARCHAR(150) UNIQUE | login |
| password | VARCHAR(255) | hashed (PBKDF2/Argon2) |
| role_id | FK → roles | |
| department_id | FK → departments NULL | |
| is_active | BOOL | |
| created_at / updated_at | DATETIME | UTC |

**roles**: `id, name, description` (seeded: super_admin, asset_manager, department_head, employee, auditor)

**categories**: `id, name, icon, color, custom_fields(JSON), created_at`

**locations**: `id, name, address, city, latitude, longitude, created_at`

**departments**: `id, name, head_user_id(FK NULL), created_at`

**vendors**: `id, name, contact_person, email, phone, address, created_at`

**assets**
| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| asset_tag | VARCHAR(50) UNIQUE | `TRA-YYYY-000001` |
| name | VARCHAR(200) | |
| serial_number | VARCHAR(120) NULL | |
| category_id | FK → categories | |
| status | ENUM | Available/Assigned/Under Maintenance/Retired/Lost/Disposed |
| location_id | FK → locations NULL | |
| department_id | FK → departments NULL | |
| vendor_id | FK → vendors NULL | |
| assigned_to_id | FK → users NULL | |
| purchase_date | DATE | |
| purchase_cost | DECIMAL(12,2) | |
| salvage_value | DECIMAL(12,2) | default 0 |
| useful_life_years | SMALLINT | |
| depreciation_method | ENUM | straight_line / declining_balance |
| current_value | DECIMAL(12,2) | computed |
| warranty_expiry | DATE NULL | |
| image | VARCHAR(255) NULL | |
| custom_data | JSON NULL | per-category fields |
| is_deleted | BOOL | soft delete |
| created_at / updated_at | DATETIME | |

**asset_assignments** (history): `id, asset_id(FK), user_id(FK), assigned_by_id(FK), action(ENUM: checkout/checkin), notes, created_at`

**maintenance_records**: `id, asset_id(FK), type, scheduled_date, completed_date NULL, technician, vendor_id(FK NULL), cost_estimate, actual_cost, status(ENUM: scheduled/in_progress/completed/cancelled), notes, created_at`

**purchase_orders**: `id, po_number(UNIQUE), vendor_id(FK), po_date, expected_delivery, status, total_amount, created_by_id(FK), created_at`
**purchase_order_items**: `id, po_id(FK), description, quantity, unit_cost, category_id(FK NULL)`

**attachments**: `id, asset_id(FK), file, filename, uploaded_by_id(FK), created_at`

**notifications**: `id, user_id(FK), type, title, message, is_read, related_object_type, related_object_id, created_at`

**audit_logs**: `id, user_id(FK NULL), action, entity_type, entity_id, changes(JSON), ip_address, created_at`

### 4.2 Key Relationships
- One category → many assets
- One asset → many assignments (history), many maintenance records, many attachments
- One user → many assigned assets (current) and assignment history
- One vendor → many assets and purchase orders

### 4.3 Indexing Strategy
- Index `assets(asset_tag)`, `assets(status)`, `assets(category_id)`, `assets(assigned_to_id)`.
- Composite index `assets(status, category_id)` for dashboard queries.
- Index `audit_logs(entity_type, entity_id)` and `notifications(user_id, is_read)`.

### 4.4 Data Integrity
- Foreign keys with `ON DELETE RESTRICT` for referenced masters; soft-delete for assets.
- Use DB transactions for assignment and maintenance status changes.

---

## 5. API Design (REST)

**Base URL:** `/api/v1/`
**Auth:** `Authorization: Bearer <access_token>` (JWT via SimpleJWT)
**Format:** JSON. **Pagination:** `?page=&page_size=`. **Filtering:** django-filter. **Search:** `?search=`. **Ordering:** `?ordering=`.

### 5.1 Standard Response Envelope
```json
{
  "success": true,
  "message": "Assets retrieved successfully",
  "data": { "count": 120, "next": "...", "previous": null, "results": [ ] },
  "errors": null
}
```
Errors return `success:false`, `data:null`, and a structured `errors` object with field-level messages. HTTP status codes are used correctly (200/201/204/400/401/403/404/409/422/500).

### 5.2 Endpoint Catalogue

**Authentication**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/auth/login/` | Obtain access + refresh token |
| POST | `/auth/refresh/` | Refresh access token |
| POST | `/auth/logout/` | Blacklist refresh token |
| GET | `/auth/me/` | Current user profile |
| POST | `/auth/password/change/` | Change password |
| POST | `/auth/password/reset/` | Request reset email |
| POST | `/auth/password/reset/confirm/` | Confirm reset |

**Users & Roles**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/users/` | List / create users |
| GET/PUT/PATCH/DELETE | `/users/{id}/` | Retrieve / update / deactivate |
| GET | `/roles/` | List roles |

**Assets**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/assets/` | List (filter/search) / create |
| GET/PUT/PATCH/DELETE | `/assets/{id}/` | Retrieve / update / soft-delete |
| POST | `/assets/{id}/assign/` | Check-out to a user |
| POST | `/assets/{id}/checkin/` | Check-in |
| POST | `/assets/{id}/retire/` | Retire/dispose |
| GET | `/assets/{id}/history/` | Assignment + maintenance history |
| GET | `/assets/{id}/depreciation/` | Depreciation schedule |
| GET | `/assets/{id}/qr/` | QR code (PNG/SVG) |
| POST | `/assets/import/` | Bulk import (CSV/XLSX) |
| GET | `/assets/export/` | Export filtered list |

**Masters**
| Method | Endpoint |
|--------|----------|
| GET/POST · GET/PUT/DELETE | `/categories/` · `/categories/{id}/` |
| GET/POST · GET/PUT/DELETE | `/locations/` · `/locations/{id}/` |
| GET/POST · GET/PUT/DELETE | `/departments/` · `/departments/{id}/` |
| GET/POST · GET/PUT/DELETE | `/vendors/` · `/vendors/{id}/` |

**Maintenance**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/maintenance/` | List / schedule |
| GET/PUT/PATCH | `/maintenance/{id}/` | Retrieve / update |
| POST | `/maintenance/{id}/complete/` | Mark complete |

**Procurement**
| Method | Endpoint |
|--------|----------|
| GET/POST · GET/PUT/DELETE | `/purchase-orders/` · `/purchase-orders/{id}/` |
| POST | `/purchase-orders/{id}/receive/` |

**Requests, Notifications, Audit, Reports**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/asset-requests/` | Employee requests |
| POST | `/asset-requests/{id}/approve/` · `/reject/` | Manager action |
| GET | `/notifications/` | List |
| POST | `/notifications/{id}/read/` | Mark read |
| GET | `/audit-logs/` | List (admin/auditor) |
| GET | `/dashboard/stats/` | KPI cards + chart data |
| GET | `/reports/asset-register/` | Asset register |
| GET | `/reports/depreciation/` | Depreciation report |
| GET | `/reports/maintenance-cost/` | Maintenance cost |
| GET | `/reports/assignment/` | Assignment report |

### 5.3 Example: Create Asset (Request)
```json
POST /api/v1/assets/
{
  "name": "Dell Latitude 5440",
  "category_id": 3,
  "serial_number": "SN-DL5440-0091",
  "status": "Available",
  "location_id": 2,
  "department_id": 1,
  "vendor_id": 5,
  "purchase_date": "2026-01-15",
  "purchase_cost": 78000.00,
  "salvage_value": 8000.00,
  "useful_life_years": 4,
  "depreciation_method": "straight_line",
  "warranty_expiry": "2029-01-15",
  "custom_data": { "ram_gb": 16, "cpu": "i7", "storage_gb": 512 }
}
```
Response `201`: full asset object including auto-generated `asset_tag` and computed `current_value`.

### 5.4 API Conventions
- Versioned (`/api/v1/`).
- All list endpoints support pagination, filtering, ordering, search.
- Rate limiting on auth endpoints (throttling).
- Consistent envelope and error schema.
- OpenAPI/Swagger docs auto-generated (drf-spectacular) at `/api/docs/`.

---

## 6. External Interface Requirements

### 6.1 User Interfaces
- Responsive dashboard (desktop-first, works down to tablet).
- Login, dashboard, asset list, asset detail, assignment, maintenance, masters, reports, settings.
- Consistent left sidebar navigation + top bar with search, notifications, profile.

### 6.2 Hardware Interfaces
- Optional barcode/QR scanner (acts as keyboard input) and label printer.

### 6.3 Software Interfaces
- MySQL 8.x database.
- SMTP for email.
- Browser via HTTPS REST/AJAX.

### 6.4 Communication Interfaces
- HTTPS/TLS 1.2+ only. JSON payloads. CORS restricted to the frontend origin.

---

## 7. UI / UX Design Specification

### 7.1 Brand Palette
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--color-primary` | Nest Green | `#3BB77E` | Primary actions, active nav, success, brand |
| `--color-accent` | Cream Yolk | `#FDC040` | Highlights, warnings, secondary CTAs, badges |
| `--color-ink` | Ink | `#253D4E` | Text, headings, sidebar background |
| `--color-bg` | Cloud | `#E7EDF2` | App background |
| `--color-surface` | White | `#FFFFFF` | Cards, panels |
| `--surface-subtle` | Mist | `#F5F8FA` | Card headers and footers |
| `--table-head-bg` | Column | `#E4EAF0` | Table header row |
| `--table-head-text` | Column Ink | `#46596C` | Table header labels |
| `--color-muted` | Slate | `#7B8794` | Secondary text, borders |
| `--color-danger` | Coral | `#E5484D` | Errors, destructive actions |

**Status colours:** Available → Nest Green · Assigned → Ink · Under Maintenance → Cream Yolk · Retired/Lost/Disposed → Slate/Coral.

**Surface separation.** Cloud sits far enough below White that a card reads as
its own surface; a near-white background makes the whole page read as one flat
sheet. Mist separates a card's header and footer from its body without
introducing a second colour.

### 7.1.1 Chart series palette

The three brand colours run out at about four categories, and tints of them stop
being distinguishable. Four supporting hues extend the set to ten. They are for
**charts and category colours only** — the brand identity, buttons, status
colours and navigation remain Nest Green, Cream Yolk and Ink.

| # | Name | Hex | | # | Name | Hex |
|---|------|-----|---|---|------|-----|
| 1 | Nest Green | `#3BB77E` | | 6 | Amber | `#E08A3C` |
| 2 | Ink | `#253D4E` | | 7 | Steel | `#5A7D8C` |
| 3 | Cream Yolk | `#FDC040` | | 8 | Slate | `#7B8794` |
| 4 | Indigo | `#6C6FD4` | | 9 | Mint | `#5FC9A0` |
| 5 | Teal | `#2F9BB5` | | 10 | Coral | `#E5484D` |

Ordered so neighbours differ in both hue and lightness, since a chart legend is
read by adjacency. Coral sits last so it is only reached when a chart genuinely
has ten series — it reads as an error everywhere else.

### 7.2 Typography
- **Quicksand** (Bold 700, rounded geometric) → brand wordmark, page titles, headings, KPI numbers.
- **Lexend** → body text, labels, tables, forms, buttons (weights 400/500/600).
- Type scale: H1 32 / H2 24 / H3 20 / Body 15 / Small 13. Line-height 1.5 for body.

```css
:root {
  --color-primary:#3BB77E; --color-accent:#FDC040; --color-ink:#253D4E;
  --color-bg:#E7EDF2; --color-surface:#FFFFFF; --surface-subtle:#F5F8FA;
  --color-muted:#7B8794; --color-danger:#E5484D;
  /* Chart-only supporting hues */
  --color-teal:#2F9BB5; --color-indigo:#6C6FD4;
  --color-amber:#E08A3C; --color-steel:#5A7D8C;
  --font-head:'Quicksand',sans-serif; --font-body:'Lexend',sans-serif;
  --radius:12px; --shadow:0 2px 12px rgba(37,61,78,.08); --space:16px;
}
body{font-family:var(--font-body);background:var(--color-bg);color:var(--color-ink);}
h1,h2,h3,.brand{font-family:var(--font-head);font-weight:700;}
```

### 7.3 Layout & Components
- **Grid:** fixed left sidebar (240px, Ink background, white/green active states) + fluid content.
- **Cards:** white surface, 12px radius, soft shadow, 20–24px padding.
- **Buttons:** primary = Nest Green fill / white text; secondary = outline Ink; accent = Cream Yolk; destructive = Coral. 10px radius, 500 weight, subtle hover lift.
- **Tables:** zebra rows, sticky header, status pills (rounded, coloured by status), row actions on hover, per-column sort, pagination footer. The header row is separated from the data on four axes at once — fill, size, weight and letter-spacing — because any one alone still reads as another row of data.
- **Forms:** floating/top labels, clear focus ring in Nest Green, inline validation in Coral.
- **Charts:** doughnut (status), bar (by category), line (value over time) — palette-consistent, using a lightweight lib (Chart.js).
- **Empty states & skeleton loaders** for every list.

### 7.4 UX Principles
- Every destructive action confirms in a modal.
- Toast notifications for success/error (top-right, auto-dismiss).
- Global search in the top bar (assets by tag/name/serial).
- Consistent 8px spacing scale; generous whitespace; accessible contrast (WCAG AA).
- Keyboard focus order and ARIA labels on interactive elements.
- Optimistic UI on quick actions with rollback on error.

### 7.5 Logo / Identity
- Wordmark in Quicksand Bold with a two-tone treatment (Nest Green + Ink), mirroring the brand card. Favicon/app icon reuse the green rounded-square mark.

---

## 8. Non-Functional Requirements

### 8.1 Performance
- **NFR-1** API list endpoints respond < 400 ms for 10k assets (with indexing + pagination).
- **NFR-2** Dashboard loads < 2 s on broadband.
- **NFR-3** System supports 200 concurrent users without degradation.

### 8.2 Scalability
- **NFR-4** Stateless API behind a load balancer; horizontal scaling via multiple Gunicorn workers.
- **NFR-5** Handle 100k+ asset records.

### 8.3 Availability & Reliability
- **NFR-6** 99.5% uptime target.
- **NFR-7** Nightly automated DB backups with 30-day retention.
- **NFR-8** Graceful error handling; no stack traces exposed to clients.

### 8.4 Usability & Accessibility
- **NFR-9** WCAG 2.1 AA contrast; keyboard navigable; responsive to 768px.
- **NFR-10** Core tasks (add asset, assign) completable in ≤ 3 clicks from dashboard.

### 8.5 Maintainability
- **NFR-11** Modular DRF apps (users, assets, maintenance, procurement, reports).
- **NFR-12** ≥ 70% backend test coverage; linted (flake8/black), typed where practical.
- **NFR-13** OpenAPI docs kept in sync automatically.

### 8.6 Compatibility
- **NFR-14** Latest two versions of Chrome, Edge, Firefox, Safari.

---

## 9. Security Requirements

- **SEC-1** Passwords hashed with Argon2/PBKDF2; never stored or logged in plaintext.
- **SEC-2** JWT with short-lived access (15 min) + rotating refresh tokens; refresh blacklist on logout.
- **SEC-3** RBAC enforced server-side on every endpoint (DRF permissions), not just hidden in UI.
- **SEC-4** All traffic over HTTPS/TLS; HSTS enabled.
- **SEC-5** Input validation and serialization on all endpoints; parameterised ORM queries prevent SQL injection.
- **SEC-6** CORS restricted to trusted origins; CSRF protection where cookies are used.
- **SEC-7** Rate limiting/throttling on auth and write endpoints.
- **SEC-8** File uploads validated (type, size) and stored outside web root; served via controlled endpoints.
- **SEC-9** Audit logging of all sensitive actions with IP + user.
- **SEC-10** Secrets in environment variables (never in code); `DEBUG=False` in production.
- **SEC-11** Regular dependency scanning.

---

## 10. System Architecture

### 10.1 High-Level
```
┌────────────────────────┐        HTTPS / AJAX (JSON)        ┌──────────────────────────┐
│  Frontend (Browser)    │  ───────────────────────────────▶ │  Nginx (reverse proxy)   │
│  HTML · CSS · JS ·      │                                    │      │                    │
│  jQuery · Chart.js      │ ◀─────────────────────────────────│      ▼                    │
└────────────────────────┘        JSON responses              │  Gunicorn → Django/DRF   │
                                                               │      │                    │
                                                               │      ▼                    │
                                                        ┌──────────────┐  ┌─────────────┐  │
                                                        │  MySQL 8.x   │  │ Media/Static│  │
                                                        └──────────────┘  └─────────────┘  │
                                                               │                            │
                                                        ┌──────────────┐                    │
                                                        │ Celery+Redis │ (depreciation,     │
                                                        │  (async)     │  emails, reminders)│
                                                        └──────────────┘────────────────────┘
```

### 10.2 Backend App Structure (Django)
```
trasset/
├─ config/            # settings (base/dev/prod), urls, wsgi
├─ apps/
│  ├─ accounts/       # users, roles, auth (JWT)
│  ├─ assets/         # assets, categories, assignments, attachments
│  ├─ masters/        # locations, departments, vendors
│  ├─ maintenance/    # maintenance records, schedules
│  ├─ procurement/    # purchase orders
│  ├─ reports/        # dashboard, reports, exports
│  ├─ notifications/  # in-app + email
│  └─ audit/          # audit logging (middleware/signals)
├─ common/            # base serializers, pagination, permissions, response envelope
└─ tests/
```

### 10.3 Frontend Structure
```
frontend/
├─ index.html               # login
├─ dashboard.html
├─ assets.html · asset-detail.html
├─ maintenance.html · vendors.html · reports.html · settings.html
├─ css/  (variables.css, base.css, components.css, layout.css)
├─ js/   (api.js, auth.js, ui.js, assets.js, dashboard.js, charts.js)
└─ assets/ (logo, icons, fonts)
```
`api.js` centralises fetch/AJAX with the JWT token, auto-refresh on 401, and the response-envelope parsing.

### 10.4 Async / Scheduled Jobs (Celery)
- Monthly depreciation recalculation.
- Daily warranty-expiry and maintenance-due reminder scan.
- Email dispatch queue.

---

## 11. Appendices

### 11.1 Depreciation Formulas
- **Straight-Line:** `annual = (cost − salvage) / useful_life`; `current = cost − annual × elapsed_years` (floored at salvage).
- **Declining Balance:** `rate = 2 / useful_life`; `current = current × (1 − rate)` per year (floored at salvage).

### 11.2 Asset Status State Machine
```
Available ──assign──▶ Assigned ──checkin──▶ Available
Available/Assigned ──maintenance──▶ Under Maintenance ──complete──▶ (previous)
Any ──retire/dispose──▶ Retired / Disposed / Lost   (terminal)
```

### 11.3 Environment Variables (sample)
```
DJANGO_SECRET_KEY=…      DEBUG=False
DB_NAME=trasset  DB_USER=…  DB_PASSWORD=…  DB_HOST=…  DB_PORT=3306
JWT_ACCESS_MIN=15  JWT_REFRESH_DAYS=7
EMAIL_HOST=…  EMAIL_HOST_USER=…  EMAIL_HOST_PASSWORD=…
REDIS_URL=redis://…      CORS_ALLOWED_ORIGINS=https://app.trasset.com
```

### 11.4 Acceptance Criteria (samples)
- Creating an asset without a tag auto-generates a unique `TRA-YYYY-000001` tag.
- Assigning an already-assigned asset returns `409 Conflict`.
- An Employee calling a manager-only endpoint receives `403 Forbidden`.
- Dashboard KPI totals reconcile with the asset register report.

---

*End of SRS — Trasset v1.0*
