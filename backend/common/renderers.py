"""
Standard response envelope (SRS §5.1).

Every JSON response leaves the API shaped like::

    {
      "success": true,
      "message": "Assets retrieved successfully",
      "data": { ... },
      "errors": null
    }

Views stay ordinary DRF views — the renderer wraps whatever they return.
A view (or a single response) can override the message::

    response = Response(serializer.data)
    response.envelope_message = "Asset assigned successfully"
"""
from rest_framework.renderers import JSONRenderer

ENVELOPE_KEYS = {"success", "message", "data", "errors"}


def is_envelope(payload) -> bool:
    """True when a payload has already been wrapped (e.g. by the exception handler)."""
    return isinstance(payload, dict) and ENVELOPE_KEYS.issubset(payload.keys())


def _humanise(name: str) -> str:
    return name.replace("_", " ").strip().capitalize()


def _resource_names(view):
    """
    Best-effort ("Asset", "Assets") pair for the resource a view exposes.

    Priority: explicit ``resource_name`` on the view → model verbose name →
    a neutral fallback.
    """
    explicit = getattr(view, "resource_name", None)
    if explicit:
        plural = getattr(view, "resource_name_plural", None) or f"{explicit}s"
        return _humanise(explicit), _humanise(plural)

    queryset = getattr(view, "queryset", None)
    model = getattr(queryset, "model", None)
    if model is None:
        serializer_class = getattr(view, "serializer_class", None)
        meta = getattr(serializer_class, "Meta", None)
        model = getattr(meta, "model", None)

    if model is not None:
        meta = model._meta
        return _humanise(str(meta.verbose_name)), _humanise(str(meta.verbose_name_plural))

    return "Resource", "Resources"


def default_message(view, request, status_code: int) -> str:
    """Derive a sensible message so every endpoint reads consistently."""
    singular, plural = _resource_names(view)
    method = (getattr(request, "method", "") or "").upper()
    action = getattr(view, "action", None)

    if status_code >= 400:
        return "Request failed"
    if method == "POST":
        return f"{singular} created successfully" if status_code == 201 \
            else f"{singular} updated successfully"
    if method in ("PUT", "PATCH"):
        return f"{singular} updated successfully"
    if method == "DELETE":
        return f"{singular} deleted successfully"

    # GET / HEAD — plural for collections, singular for a single record.
    if action == "list" or getattr(view, "envelope_plural", False):
        return f"{plural} retrieved successfully"
    return f"{singular} retrieved successfully"


class EnvelopeJSONRenderer(JSONRenderer):
    """Wraps every successful response body in the standard envelope."""

    def render(self, data, accepted_media_type=None, renderer_context=None):
        renderer_context = renderer_context or {}
        response = renderer_context.get("response")

        # Non-API responses (schema, docs) and streamed files pass straight through.
        if response is None:
            return super().render(data, accepted_media_type, renderer_context)

        status_code = response.status_code

        # 204 must not carry a body.
        if status_code == 204:
            return b""

        if is_envelope(data):
            payload = data
        else:
            view = renderer_context.get("view")
            request = renderer_context.get("request")
            message = getattr(response, "envelope_message", None) or default_message(
                view, request, status_code
            )
            payload = {
                "success": status_code < 400,
                "message": message,
                "data": data,
                "errors": None,
            }

        return super().render(payload, accepted_media_type, renderer_context)
