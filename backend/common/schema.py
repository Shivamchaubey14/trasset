"""
OpenAPI helpers (NFR-13).

Several write serializers return their *read* counterpart from
``to_representation``: create an asset and the response is the full
``AssetDetail``, not the fields that were submitted. That is deliberate and
useful — the client gets the complete record back without a second GET.

drf-spectacular cannot see through ``to_representation``, so left alone it
documents the *write* serializer as the response. The schema then states
something false, and a generated client is typed against fields the endpoint
never returns. Nothing warns about it, because from the generator's point of
view nothing is ambiguous — which is exactly how ``AssetRequestCreate`` came to
be documented with no ``status`` on a response that has always had one.

``write_responses`` states the real response once per viewset. Splat it into
``extend_schema_view`` so a viewset that already documents other actions keeps
one decorator::

    @extend_schema_view(
        list=extend_schema(parameters=[UPDATED_SINCE_PARAMETER]),
        **write_responses(AssetDetailSerializer),
    )
    class AssetViewSet(...):
"""
from drf_spectacular.utils import extend_schema


def write_responses(read_serializer):
    """
    Document ``read_serializer`` as the response of the write actions.

    :param read_serializer: what the write serializer's ``to_representation``
        actually returns.
    :returns: kwargs for :func:`drf_spectacular.utils.extend_schema_view`.
    """
    return {
        "create": extend_schema(responses={201: read_serializer}),
        "update": extend_schema(responses={200: read_serializer}),
        "partial_update": extend_schema(responses={200: read_serializer}),
    }
