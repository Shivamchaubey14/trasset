"""
Error envelope + custom exceptions (SRS §5.1, NFR-8).

Failures come back as::

    {
      "success": false,
      "message": "Validation failed",
      "data": null,
      "errors": { "purchase_cost": ["A valid number is required."] }
    }
"""
import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("trasset")


class Conflict(APIException):
    """409 — the request is valid but conflicts with current state.

    Used by the asset state machine (SRS §11.2): assigning an already-assigned
    asset, completing a completed maintenance record, and so on.
    """

    status_code = status.HTTP_409_CONFLICT
    default_detail = "This action conflicts with the current state of the resource."
    default_code = "conflict"


class UnprocessableEntity(APIException):
    """422 — well-formed request the server refuses to process."""

    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_detail = "The request could not be processed."
    default_code = "unprocessable_entity"


class ServiceError(APIException):
    """500-level failure raised deliberately by a domain service."""

    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    default_detail = "An internal error occurred."
    default_code = "service_error"


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------
_STATUS_MESSAGES = {
    400: "Validation failed",
    401: "Authentication credentials were not provided or are invalid",
    403: "You do not have permission to perform this action",
    404: "The requested resource was not found",
    405: "Method not allowed",
    409: "Request conflicts with the current state",
    415: "Unsupported media type",
    422: "The request could not be processed",
    429: "Too many requests — please slow down",
    500: "An unexpected error occurred",
}


def _normalise(detail):
    """Turn DRF's mixed detail shapes into JSON-safe primitives."""
    if isinstance(detail, dict):
        return {key: _normalise(value) for key, value in detail.items()}
    if isinstance(detail, (list, tuple)):
        return [_normalise(item) for item in detail]
    return str(detail)


def _extract_message(errors, status_code: int) -> str:
    """Prefer a human sentence over a generic status message where possible."""
    default = _STATUS_MESSAGES.get(status_code, "Request failed")

    if isinstance(errors, dict):
        # A bare {"detail": "..."} is DRF's own message — surface it directly.
        if set(errors.keys()) == {"detail"}:
            detail = errors["detail"]
            return detail if isinstance(detail, str) else default
        non_field = errors.get("non_field_errors") or errors.get("detail")
        if isinstance(non_field, list) and non_field:
            return str(non_field[0])
    if isinstance(errors, list) and errors and isinstance(errors[0], str):
        return errors[0]
    return default


def envelope_exception_handler(exc, context):
    """DRF ``EXCEPTION_HANDLER`` — every error leaves in the standard envelope."""
    # Translate Django-native exceptions into DRF ones first.
    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(detail=getattr(exc, "message_dict", None) or exc.messages)
    elif isinstance(exc, DjangoPermissionDenied):
        from rest_framework.exceptions import PermissionDenied

        exc = PermissionDenied()
    elif isinstance(exc, Http404):
        from rest_framework.exceptions import NotFound

        exc = NotFound()
    elif isinstance(exc, IntegrityError):
        logger.warning("Database integrity error: %s", exc)
        exc = Conflict(detail="This operation violates a database constraint.")

    response = drf_exception_handler(exc, context)

    if response is None:
        # Unhandled — log the traceback server-side, tell the client nothing (NFR-8).
        view = context.get("view")
        logger.exception("Unhandled exception in %s", view.__class__.__name__ if view else "view")
        return Response(
            {
                "success": False,
                "message": _STATUS_MESSAGES[500],
                "data": None,
                "errors": {"detail": ["An unexpected error occurred. Please try again."]},
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    errors = _normalise(response.data)
    if isinstance(errors, list):
        errors = {"detail": errors}
    elif not isinstance(errors, dict):
        errors = {"detail": [str(errors)]}

    response.data = {
        "success": False,
        "message": _extract_message(errors, response.status_code),
        "data": None,
        "errors": errors,
    }
    return response
