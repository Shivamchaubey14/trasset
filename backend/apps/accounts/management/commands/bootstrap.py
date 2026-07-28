"""
Bring a fresh database to a usable state.

    python manage.py bootstrap --demo

Creates one account per role plus a starter set of categories, locations,
departments and vendors so the dashboard has something to show. Safe to re-run:
every object is looked up before it is created.
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from apps.accounts.models import Role, User
from apps.assets.constants import AssetStatus, AssignmentAction, DepreciationMethod
from apps.assets.models import Asset, AssetAssignment
from apps.audit.services import suspend as suspend_audit
from apps.masters.models import Category, Department, Location, Vendor
from common.roles import Roles

DEMO_PASSWORD = "Trasset@2026"

DEMO_USERS = [
    ("admin@trasset.local", "Aditi Sharma", Roles.SUPER_ADMIN),
    ("manager@trasset.local", "Rohan Mehta", Roles.ASSET_MANAGER),
    ("head@trasset.local", "Priya Nair", Roles.DEPARTMENT_HEAD),
    ("employee@trasset.local", "Karan Verma", Roles.EMPLOYEE),
    ("auditor@trasset.local", "Neha Kulkarni", Roles.AUDITOR),
]

DEMO_CATEGORIES = [
    ("Laptops", "laptop", "#3BB77E", [
        {"key": "ram_gb", "label": "RAM (GB)", "type": "number", "required": False, "options": []},
        {"key": "cpu", "label": "Processor", "type": "text", "required": False, "options": []},
        {"key": "storage_gb", "label": "Storage (GB)", "type": "number",
         "required": False, "options": []},
    ]),
    ("Monitors", "monitor", "#253D4E", [
        {"key": "size_inches", "label": "Screen size (in)", "type": "number",
         "required": False, "options": []},
        {"key": "resolution", "label": "Resolution", "type": "select", "required": False,
         "options": ["1920x1080", "2560x1440", "3840x2160"]},
    ]),
    ("Vehicles", "truck", "#FDC040", [
        {"key": "registration_no", "label": "Registration no.", "type": "text",
         "required": True, "options": []},
        {"key": "mileage_km", "label": "Mileage (km)", "type": "number",
         "required": False, "options": []},
    ]),
    ("Furniture", "chair", "#7B8794", []),
    ("Software Licenses", "key", "#3BB77E", [
        {"key": "seats", "label": "Seats", "type": "number", "required": False, "options": []},
        {"key": "renewal_date", "label": "Renewal date", "type": "date",
         "required": False, "options": []},
    ]),
    ("Networking", "wifi", "#253D4E", []),
]

DEMO_LOCATIONS = [
    ("Head Office — Mumbai", "Bandra Kurla Complex", "Mumbai", "Maharashtra", "400051"),
    ("Pune Development Centre", "Hinjewadi Phase 2", "Pune", "Maharashtra", "411057"),
    ("Bengaluru Sales Office", "Koramangala 5th Block", "Bengaluru", "Karnataka", "560095"),
    ("Central Warehouse", "MIDC Industrial Area", "Bhiwandi", "Maharashtra", "421302"),
]

DEMO_DEPARTMENTS = [
    ("Information Technology", "IT"),
    ("Finance & Accounts", "FIN"),
    ("Human Resources", "HR"),
    ("Sales & Marketing", "SLS"),
    ("Operations", "OPS"),
]

DEMO_VENDORS = [
    ("Dell Technologies India", "Sanjay Rao", "sales@dell-in.example", "+91 22 4000 1000"),
    ("Lenovo India Pvt Ltd", "Meera Iyer", "corp@lenovo-in.example", "+91 80 4000 2000"),
    ("Godrej Interio", "Amit Deshpande", "b2b@godrej-in.example", "+91 22 4000 3000"),
    ("TechServe Solutions", "Farhan Qureshi", "support@techserve.example", "+91 20 4000 4000"),
]

# (category, model name, manufacturer, cost, useful life years)
DEMO_ASSET_TEMPLATES = [
    ("Laptops", "Dell Latitude 5440", "Dell", 78000, 4),
    ("Laptops", "Dell XPS 15", "Dell", 165000, 4),
    ("Laptops", "Lenovo ThinkPad E14", "Lenovo", 62000, 4),
    ("Laptops", "MacBook Pro 14", "Apple", 199000, 5),
    ("Monitors", "Dell UltraSharp U2723QE", "Dell", 42000, 6),
    ("Monitors", "LG 27UP850", "LG", 34000, 6),
    ("Monitors", "Samsung ViewFinity S6", "Samsung", 28000, 6),
    ("Vehicles", "Tata Nexon EV", "Tata Motors", 1650000, 8),
    ("Vehicles", "Maruti Eeco Cargo Van", "Maruti Suzuki", 620000, 8),
    ("Furniture", "Godrej Ergonomic Chair", "Godrej Interio", 18500, 7),
    ("Furniture", "Height-Adjustable Desk", "Featherlite", 32000, 10),
    ("Furniture", "Conference Table 8-Seater", "Godrej Interio", 74000, 10),
    ("Software Licenses", "Adobe Creative Cloud (25 seats)", "Adobe", 285000, 1),
    ("Software Licenses", "JetBrains All Products Pack", "JetBrains", 62000, 1),
    ("Networking", "Cisco Catalyst 9200 Switch", "Cisco", 245000, 7),
    ("Networking", "Ubiquiti UniFi AP U6 Pro", "Ubiquiti", 21000, 5),
    ("Networking", "Fortinet FortiGate 60F", "Fortinet", 98000, 6),
]

# Roughly mirrors a real register: mostly in use, a few idle, a couple retired.
DEMO_STATUS_MIX = (
    [AssetStatus.ASSIGNED] * 9 +
    [AssetStatus.AVAILABLE] * 6 +
    [AssetStatus.UNDER_MAINTENANCE] * 2 +
    [AssetStatus.RETIRED] +
    [AssetStatus.LOST]
)


class Command(BaseCommand):
    help = "Seed roles, an initial Super Admin and (optionally) demo master data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--demo", action="store_true",
            help="Also create demo users, categories, locations, departments and vendors.",
        )
        parser.add_argument(
            "--admin-email", default="admin@trasset.local",
            help="Email for the Super Admin account.",
        )
        parser.add_argument(
            "--admin-password", default=DEMO_PASSWORD,
            help="Password for the Super Admin account.",
        )
        parser.add_argument(
            "--assets", type=int, default=42,
            help="How many demo assets to create (with --demo).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # Seeding is not a user action — keep it out of the audit trail so the
        # first real change is the first thing an auditor sees.
        with suspend_audit():
            self._run(options)

    def _run(self, options):
        roles = {role.name: role for role in Role.objects.all()}
        if not roles:
            self.stderr.write(self.style.ERROR(
                "No roles found — run `python manage.py migrate` first."
            ))
            return

        self._create_admin(options["admin_email"], options["admin_password"], roles)

        if options["demo"]:
            self._create_demo_users(roles)
            self._create_masters()
            self._create_assets(options["assets"])
            self._backfill_assignment_history()

        self.stdout.write(self.style.SUCCESS("\nBootstrap complete."))

    # -- steps -------------------------------------------------------------
    def _create_admin(self, email, password, roles):
        user, created = User.objects.get_or_create(
            email=email.lower(),
            defaults={
                "full_name": "Trasset Administrator",
                "role": roles[Roles.SUPER_ADMIN],
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )
        if created:
            user.set_password(password)
            user.save()
            self.stdout.write(self.style.SUCCESS(f"  + Super Admin  {email} / {password}"))
        else:
            self.stdout.write(f"  = Super Admin  {email} (already exists)")

    def _create_demo_users(self, roles):
        self.stdout.write("\nDemo users:")
        for email, name, role_slug in DEMO_USERS:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "full_name": name,
                    "role": roles[role_slug],
                    "is_active": True,
                    "is_staff": role_slug == Roles.SUPER_ADMIN,
                    "is_superuser": role_slug == Roles.SUPER_ADMIN,
                },
            )
            if created:
                user.set_password(DEMO_PASSWORD)
                user.save()
                self.stdout.write(self.style.SUCCESS(
                    f"  + {role_slug:<16} {email} / {DEMO_PASSWORD}"
                ))
            else:
                self.stdout.write(f"  = {role_slug:<16} {email} (already exists)")

    def _create_masters(self):
        self.stdout.write("\nMaster data:")

        for name, icon, color, custom_fields in DEMO_CATEGORIES:
            _, created = Category.objects.get_or_create(
                name=name,
                defaults={"icon": icon, "color": color, "custom_fields": custom_fields},
            )
            self._report("Category", name, created)

        for name, address, city, state, postal in DEMO_LOCATIONS:
            _, created = Location.objects.get_or_create(
                name=name,
                defaults={"address": address, "city": city, "state": state,
                          "country": "India", "postal_code": postal},
            )
            self._report("Location", name, created)

        for name, code in DEMO_DEPARTMENTS:
            _, created = Department.objects.get_or_create(name=name, defaults={"code": code})
            self._report("Department", name, created)

        for name, contact, email, phone in DEMO_VENDORS:
            _, created = Vendor.objects.get_or_create(
                name=name,
                defaults={"contact_person": contact, "email": email, "phone": phone},
            )
            self._report("Vendor", name, created)

    def _create_assets(self, count):
        """
        Create a spread of assets so the dashboard has something honest to
        chart: purchases across the last two years, a realistic status mix and
        a handful of warranties inside the 30-day warning window.
        """
        existing = Asset.objects.count()
        if existing:
            self.stdout.write(f"\nAssets:\n  = {existing} already present, skipping")
            return

        rng = random.Random(20260727)  # fixed seed so re-seeding is reproducible

        categories = {c.name: c for c in Category.objects.all()}
        locations = list(Location.objects.all())
        departments = list(Department.objects.all())
        vendors = list(Vendor.objects.all())
        holders = list(User.objects.filter(is_active=True))

        if not categories or not locations:
            self.stdout.write(self.style.WARNING(
                "\nAssets: skipped — master data missing."
            ))
            return

        today = date.today()
        created = 0

        for index in range(count):
            template = DEMO_ASSET_TEMPLATES[index % len(DEMO_ASSET_TEMPLATES)]
            category_name, name, manufacturer, base_cost, life = template
            category = categories.get(category_name)
            if not category:
                continue

            # Spread purchases over the last ~22 months.
            purchased = today - timedelta(days=rng.randint(20, 660))
            # Vary cost a little so charts aren't suspiciously flat.
            cost = Decimal(base_cost) * Decimal(str(rng.uniform(0.92, 1.08)))
            cost = cost.quantize(Decimal("1"))
            status = DEMO_STATUS_MIX[index % len(DEMO_STATUS_MIX)]

            # Warranties: a few already inside the 30-day warning window.
            if index % 7 == 0:
                warranty = today + timedelta(days=rng.randint(3, 28))
            elif index % 5 == 0:
                warranty = today - timedelta(days=rng.randint(10, 200))
            else:
                warranty = purchased + timedelta(days=365 * rng.randint(1, 4))

            asset = Asset(
                name=name,
                manufacturer=manufacturer,
                serial_number=f"SN-{category.name[:3].upper()}-{rng.randint(10000, 99999)}",
                category=category,
                status=status,
                location=rng.choice(locations),
                department=rng.choice(departments) if departments else None,
                vendor=rng.choice(vendors) if vendors else None,
                purchase_date=purchased,
                purchase_cost=cost,
                salvage_value=(cost * Decimal("0.10")).quantize(Decimal("1")),
                useful_life_years=life,
                depreciation_method=(
                    DepreciationMethod.DECLINING_BALANCE if index % 4 == 0
                    else DepreciationMethod.STRAIGHT_LINE
                ),
                warranty_expiry=warranty,
            )

            if status == AssetStatus.ASSIGNED and holders:
                asset.assigned_to = rng.choice(holders)

            asset.save()
            created += 1

        self.stdout.write(f"\nAssets:\n  + {created} demo assets created")
        breakdown = (
            Asset.objects.values("status")
            .annotate(count=Count("id"))
            .order_by("status")
        )
        self.stdout.write(
            "    " + ", ".join(f"{row['status']}={row['count']}" for row in breakdown)
        )

    def _backfill_assignment_history(self):
        """
        Give already-assigned demo assets a check-out row.

        Assets seeded before the history model existed hold an assignee but no
        timeline, which makes the detail page look wrong. This writes the
        missing opening row once.
        """
        manager = User.objects.filter(email="manager@trasset.local").first()

        assigned = (
            Asset.objects.filter(status=AssetStatus.ASSIGNED, assigned_to__isnull=False)
            .exclude(assignments__isnull=False)
            .select_related("assigned_to")
        )

        created = 0
        for asset in assigned:
            AssetAssignment.objects.create(
                asset=asset,
                user=asset.assigned_to,
                assigned_by=manager,
                action=AssignmentAction.CHECKOUT,
                notes="Opening balance — recorded during demo seeding.",
            )
            created += 1

        if created:
            self.stdout.write(f"  + {created} assignment history rows backfilled")

    def _report(self, kind, name, created):
        marker = self.style.SUCCESS("  +") if created else "  ="
        self.stdout.write(f"{marker} {kind:<12} {name}")
