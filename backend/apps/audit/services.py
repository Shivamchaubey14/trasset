"""
Audit recording (FR-13.1, SEC-9).

Two ways in:

* **Automatic** — signals on the tracked models capture create / update / delete
  with a field-level diff.
* **Explicit** — :func:`record` for things that aren't a model save, such as a
  sign-in, and :func:`domain_action` to give a save a proper verb::

      with domain_action(AuditAction.ASSIGN, {"to": user.full_name}):
          asset.save()

  Inside that block the save is logged as "Assigned" rather than a generic
  "Updated", so one business action produces exactly one readable row.

The request's user and IP travel in a ``ContextVar`` set by the middleware, so
model-layer code doesn't have to thread a request through every call.
"""
import logging
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, datetime
from decimal import Decimal

from django.db import models

from .constants import EXCLUDED_FIELDS, AuditAction

logger = logging.getLogger("trasset")

#: Per-request actor details, populated by AuditContextMiddleware.
_request_context: ContextVar[dict] = ContextVar("audit_request_context", default={})

#: Set while a domain action is in progress (see :func:`domain_action`).
_domain_action: ContextVar[tuple | None] = ContextVar("audit_domain_action", default=None)

#: Set while auditing is deliberately switched off (bulk imports, fixtures).
_suspended: ContextVar[bool] = ContextVar("audit_suspended", default=False)


# ---------------------------------------------------------------------------
# Request context
# ---------------------------------------------------------------------------
def bind_request(request, ip_address=None, user_agent="", path=""):
    """Attach the live request. The user is resolved later, on read."""
    return _request_context.set({
        "request": request,
        "ip_address": ip_address,
        "user_agent": (user_agent or "")[:300],
        "path": (path or "")[:255],
    })


def unbind_request(token):
    try:
        _request_context.reset(token)
    except ValueError:  # pragma: no cover - token created in another context
        _request_context.set({})


def get_request_context() -> dict:
    return _request_context.get() or {}


def current_user():
    """
    The authenticated user for this request, or ``None``.

    Read on demand rather than cached at middleware time: DRF authenticates
    inside the view, and its ``Request.user`` setter writes through to the
    underlying ``HttpRequest``, so this is accurate once the view is running.
    """
    context = get_request_context()

    explicit = context.get("user")
    if explicit is not None:
        return explicit

    request = context.get("request")
    user = getattr(request, "user", None) if request is not None else None
    return user if (user is not None and getattr(user, "is_authenticated", False)) else None


def set_actor(user):
    """
    Pin the actor explicitly.

    Used by the login endpoint, where the user is known but the request was
    anonymous when it arrived.
    """
    context = dict(get_request_context())
    context["user"] = user
    return _request_context.set(context)


@contextmanager
def domain_action(action, extra=None):
    """Label saves inside this block with a business verb."""
    token = _domain_action.set((action, extra or {}))
    try:
        yield
    finally:
        _domain_action.reset(token)


@contextmanager
def suspend():
    """Switch auditing off — for seeding and data migrations."""
    token = _suspended.set(True)
    try:
        yield
    finally:
        _suspended.reset(token)


def is_suspended() -> bool:
    return _suspended.get()


# ---------------------------------------------------------------------------
# Value handling
# ---------------------------------------------------------------------------
def _serialise(value):
    """Reduce a field value to something JSON can hold and a human can read."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [_serialise(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _serialise(item) for key, item in value.items()}
    if isinstance(value, models.Model):
        return str(value)
    return str(value)


def snapshot(instance) -> dict:
    """
    Current field values of a model instance, secrets excluded.

    Foreign keys are stored by their display string rather than their id, so a
    log line reads "location: Head Office → Store Room" instead of "2 → 4".
    """
    data = {}
    for field in instance._meta.concrete_fields:
        name = field.name
        if name in EXCLUDED_FIELDS:
            continue

        if field.is_relation:
            # Read the cached id to avoid a query per related field.
            related_id = getattr(instance, field.attname, None)
            if related_id is None:
                data[name] = None
                continue
            try:
                data[name] = _serialise(getattr(instance, name))
            except Exception:  # noqa: BLE001 - a missing related row must not break the save
                data[name] = related_id
            continue

        data[name] = _serialise(getattr(instance, field.attname, None))
    return data


def diff(before: dict, after: dict) -> dict:
    """``{field: {"from": old, "to": new}}`` for everything that moved."""
    changes = {}
    for key, new_value in after.items():
        old_value = before.get(key)
        if old_value != new_value:
            changes[key] = {"from": old_value, "to": new_value}
    return changes


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------
def entity_name(instance) -> str:
    return instance._meta.object_name


def entity_label(instance) -> str:
    try:
        return str(instance)[:255]
    except Exception:  # noqa: BLE001
        return ""


def record(action, instance=None, changes=None, entity_type=None,
           entity_id=None, label=None, user=None, ip_address=None):
    """
    Write one audit row.

    Never raises: an audit failure must not take down the action being audited.
    Failures are logged instead, so a broken trail is visible in the logs.
    """
    if is_suspended():
        return None

    from .models import AuditLog

    context = get_request_context()
    actor = user if user is not None else current_user()

    try:
        return AuditLog.objects.create(
            user=actor,
            user_display=str(actor) if actor else "System",
            action=action,
            entity_type=entity_type or (entity_name(instance) if instance else ""),
            entity_id=str(entity_id if entity_id is not None
                          else (getattr(instance, "pk", "") or "")),
            entity_label=label if label is not None
                         else (entity_label(instance) if instance else ""),
            changes=changes or {},
            ip_address=ip_address or context.get("ip_address"),
            user_agent=context.get("user_agent", ""),
            request_path=context.get("path", ""),
        )
    except Exception:  # noqa: BLE001
        logger.exception("Failed to write audit record for %s %s", action, entity_type)
        return None


def record_model_change(instance, created: bool, before: dict | None):
    """Called by the post_save signal for a tracked model."""
    if is_suspended():
        return None

    domain = _domain_action.get()
    after = snapshot(instance)

    if created:
        action = AuditAction.CREATE
        # On create, the "diff" is just the starting values worth showing.
        changes = {key: {"from": None, "to": value}
                   for key, value in after.items() if value not in (None, "", [], {})}
    else:
        action = AuditAction.UPDATE
        changes = diff(before or {}, after)

    if domain:
        domain_verb, extra = domain
        action = domain_verb
        if extra:
            changes = {**changes, "_context": _serialise(extra)}
    elif not created and not changes:
        # A save that changed nothing isn't worth a row.
        return None

    return record(action, instance=instance, changes=changes)


def record_model_delete(instance, soft: bool):
    if is_suspended():
        return None
    return record(
        AuditAction.DELETE,
        instance=instance,
        changes={"_context": {"soft_delete": soft}},
    )
