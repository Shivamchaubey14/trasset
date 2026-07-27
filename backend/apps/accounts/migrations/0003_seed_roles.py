"""Seed the five fixed roles from SRS §2.3."""
from django.db import migrations

from common.roles import ROLE_DESCRIPTIONS, Roles


def seed_roles(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    for slug, _label in Roles.CHOICES:
        Role.objects.update_or_create(
            name=slug,
            defaults={"description": ROLE_DESCRIPTIONS.get(slug, "")},
        )


def unseed_roles(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    Role.objects.filter(name__in=[slug for slug, _ in Roles.CHOICES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_initial"),
    ]

    operations = [
        migrations.RunPython(seed_roles, unseed_roles),
    ]
