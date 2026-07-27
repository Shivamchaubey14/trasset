"""
Bring a fresh database to a usable state.

    python manage.py bootstrap --demo

Creates one account per role plus a starter set of categories, locations,
departments and vendors so the dashboard has something to show. Safe to re-run:
every object is looked up before it is created.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Role, User
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

    @transaction.atomic
    def handle(self, *args, **options):
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

    def _report(self, kind, name, created):
        marker = self.style.SUCCESS("  +") if created else "  ="
        self.stdout.write(f"{marker} {kind:<12} {name}")
