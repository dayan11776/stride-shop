from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """Keep errors predictable for React while retaining field-level details."""
    response = exception_handler(exc, context)
    if response is None:
        return response
    data = response.data
    if isinstance(data, dict):
        detail = data.get("detail")
        if detail and "message" not in data:
            data["message"] = str(detail)
    else:
        data = {"message": str(data), "errors": data}
    response.data = data
    return response
