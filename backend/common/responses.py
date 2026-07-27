"""Helpers for returning enveloped responses with an explicit message."""
from rest_framework import status as http_status
from rest_framework.response import Response


def ok(data=None, message: str = "Request completed successfully",
       status: int = http_status.HTTP_200_OK) -> Response:
    """Success response with a caller-supplied message.

    The renderer normally derives a message automatically; use this when the
    action deserves a specific one ("Asset assigned successfully").
    """
    response = Response(data, status=status)
    response.envelope_message = message
    return response


def created(data=None, message: str = "Created successfully") -> Response:
    return ok(data, message, status=http_status.HTTP_201_CREATED)


def fail(message: str = "Request failed", errors=None,
         status: int = http_status.HTTP_400_BAD_REQUEST) -> Response:
    """Pre-enveloped error response for cases not raised as exceptions."""
    return Response(
        {
            "success": False,
            "message": message,
            "data": None,
            "errors": errors or {"detail": [message]},
        },
        status=status,
    )
