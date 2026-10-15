"""Server-side PayMongo Hosted Checkout adapter.

The React client receives only a short-lived checkout URL.  Secret API and
webhook keys remain exclusively in Django/Render environment variables.
"""
from __future__ import annotations

import base64
import json
from decimal import Decimal, ROUND_HALF_UP
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings

from .models import OrderAddress, Payment


class PayMongoError(Exception):
    """A safe, customer-facing PayMongo checkout creation error."""


def is_configured() -> bool:
    """Require every setting needed to create and reliably settle a payment."""
    return bool(
        settings.PAYMONGO_SECRET_KEY
        and settings.PAYMONGO_WEBHOOK_SECRET
        and settings.PAYMONGO_SUCCESS_REDIRECT_URL
        and settings.PAYMONGO_CANCEL_REDIRECT_URL
        and settings.PAYMONGO_PAYMENT_METHOD_TYPES
    )


def redirect_url(template: str, payment: Payment) -> str:
    """Safely substitute only identifiers known by the server."""
    return template.replace("{order_number}", payment.order.order_number).replace("{order_id}", str(payment.order_id)).replace("{payment_id}", str(payment.id))


def amount_in_centavos(amount: Decimal) -> int:
    return int((Decimal(amount).quantize(Decimal("0.01")) * 100).to_integral_value(rounding=ROUND_HALF_UP))


def create_checkout_session(payment: Payment) -> dict:
    """Create a PayMongo v2 Checkout Session and persist its session ID."""
    if not is_configured():
        raise PayMongoError("PayMongo is not configured. Add its server-side checkout and webhook settings first.")
    if payment.currency != "PHP":
        raise PayMongoError("PayMongo Hosted Checkout currently requires PHP payments.")

    total_centavos = amount_in_centavos(payment.amount)
    if total_centavos <= 0:
        raise PayMongoError("An online checkout cannot be created for a zero-value order.")

    order = payment.order
    billing_address = order.addresses.filter(type=OrderAddress.Type.BILLING).first()
    billing = {
        "name": billing_address.recipient_name if billing_address else "",
        "email": order.user.email if order.user_id else order.guest_email,
        "phone": billing_address.phone if billing_address else "",
    }
    if billing_address:
        billing["address"] = {
            "line1": billing_address.line1,
            "line2": billing_address.line2,
            "city": billing_address.city,
            "state": billing_address.province,
            "postal_code": billing_address.postal_code,
            "country": billing_address.country,
        }

    # A single server-calculated line protects the amount from rounding errors
    # across discounts, shipping, and multiple quantities.  The order details
    # stay available in STRIDE's confirmation and account pages.
    attributes = {
        "line_items": [
            {
                "name": f"STRIDE order {order.order_number}",
                "description": "Footwear order",
                "amount": total_centavos,
                "currency": payment.currency,
                "quantity": 1,
            }
        ],
        "payment_method_types": list(settings.PAYMONGO_PAYMENT_METHOD_TYPES),
        "success_url": redirect_url(settings.PAYMONGO_SUCCESS_REDIRECT_URL, payment),
        "cancel_url": redirect_url(settings.PAYMONGO_CANCEL_REDIRECT_URL, payment),
        "reference_number": order.order_number,
        "metadata": {
            "order_number": order.order_number,
            "payment_id": str(payment.id),
        },
        "billing": billing,
        "description": f"STRIDE order {order.order_number}",
        "send_email_receipt": settings.PAYMONGO_SEND_EMAIL_RECEIPT,
        "show_description": True,
        "show_line_items": True,
    }
    body = json.dumps({"data": {"attributes": attributes}}).encode("utf-8")
    token = base64.b64encode(f"{settings.PAYMONGO_SECRET_KEY}:".encode()).decode()
    request = Request(
        f"{settings.PAYMONGO_API_URL.rstrip('/')}/v2/checkout_sessions",
        data=body,
        headers={
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json",
            # The same payment retry returns the original active session instead
            # of creating a second payable checkout.
            "Idempotency-Key": f"stride-checkout-{payment.id}",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:  # nosec B310 — configured HTTPS URL
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise PayMongoError(f"PayMongo rejected the checkout request ({exc.code}): {details[:300]}") from exc
    except URLError as exc:
        raise PayMongoError("Could not reach PayMongo. Please try again shortly.") from exc

    session = data.get("data", {}) if isinstance(data, dict) else {}
    attributes = session.get("attributes", {}) if isinstance(session, dict) else {}
    session_id = str(session.get("id") or "")
    checkout_url = str(attributes.get("checkout_url") or "") if isinstance(attributes, dict) else ""
    if not session_id or not checkout_url:
        raise PayMongoError("PayMongo did not return a valid checkout session. Please try again.")
    payment.provider = Payment.Provider.PAYMONGO
    payment.provider_ref = session_id
    payment.save(update_fields=["provider", "provider_ref"])
    return data

