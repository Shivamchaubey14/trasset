#!/usr/bin/env python
"""Trasset — Django command-line utility."""
import os
import sys


def main():
    # Test runs get their own settings (no throttling, fast hashing) so nobody
    # has to remember --settings=config.settings.test.
    default_settings = "config.settings.test" if "test" in sys.argv else "config.settings.dev"
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", default_settings)
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
