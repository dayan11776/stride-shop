import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """Keep errors predictable for React while retaining field-level details."""
    response = exception_handler(exc, context)
    if response is None:
        request = context.get("request")
        logger.exception(
            "Unhandled API exception for %s %s.",
            getattr(request, "method", ""),
            getattr(request, "path", ""),
            exc_info=exc,
        )
        return Response(
            {"message": "The service encountered an unexpected error. Please try again shortly."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    data = response.data
    if isinstance(data, dict):
        detail = data.get("detail")
        if detail and "message" not in data:
            data["message"] = str(detail)
    else:
        data = {"message": str(data), "errors": data}
    response.data = data
    return response
