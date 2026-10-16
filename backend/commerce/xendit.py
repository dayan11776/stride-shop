"""Small server-only Xendit adapter.

It intentionally uses the standard library so the payment integration does not
add a browser-visible SDK or expose secrets to the React bundle.
"""
from __future__ import annotations

import base64
import json
from decimal import Decimal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings

from .models import Payment


class XenditError(Exception):
    pass


def is_configured() -> bool:
    return bool(settings.XENDIT_SECRET_KEY)


def redirect_url(template: str, payment: Payment) -> str:
    """Allow deployment config to reference the newly-created order safely."""
    return template.replace("{order_number}", payment.order.order_number).replace("{order_id}", str(payment.order_id))


def create_invoice(payment: Payment) -> dict:
    """Create a Xendit hosted checkout invoice for a pending order payment."""
    if not is_configured():
        raise XenditError("Xendit is not configured. Set XENDIT_SECRET_KEY on the server.")
    if payment.provider not in {"", Payment.Provider.XENDIT}:
        raise XenditError("This payment was created for another provider and cannot be sent to Xendit.")
    order = payment.order
    payload = {
        "external_id": order.order_number,
        "amount": float(Decimal(payment.amount)),
        "currency": order.currency,
        "description": f"STRIDE order {order.order_number}",
        "payer_email": order.user.email if order.user_id else order.guest_email,
        "items": [
            {
                "name": item.product_name,
                "price": float(Decimal(item.unit_price)),
                "quantity": item.quantity,
                "category": "Footwear",
            }
            for item in order.items.all()
        ],
    }
    if settings.XENDIT_SUCCESS_REDIRECT_URL:
        payload["success_redirect_url"] = redirect_url(settings.XENDIT_SUCCESS_REDIRECT_URL, payment)
    if settings.XENDIT_FAILURE_REDIRECT_URL:
        payload["failure_redirect_url"] = redirect_url(settings.XENDIT_FAILURE_REDIRECT_URL, payment)
    body = json.dumps(payload).encode("utf-8")
    token = base64.b64encode(f"{settings.XENDIT_SECRET_KEY}:".encode()).decode()
    request = Request(
        f"{settings.XENDIT_API_URL.rstrip('/')}/v2/invoices",
        data=body,
        headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:  # nosec B310 — configured HTTPS URL
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise XenditError(f"Xendit rejected the checkout request ({exc.code}): {details[:300]}") from exc
    except URLError as exc:
        raise XenditError("Could not reach Xendit. Please try again shortly.") from exc
    provider_ref = str(data.get("id") or data.get("external_id") or "")
    if provider_ref:
        payment.provider = Payment.Provider.XENDIT
        payment.provider_ref = provider_ref
        payment.save(update_fields=["provider", "provider_ref"])
    return data

