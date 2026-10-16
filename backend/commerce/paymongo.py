"""Server-side PayMongo Hosted Checkout adapter.

The React client receives only a short-lived checkout URL.  Secret API and
webhook keys remain exclusively in Django/Render environment variables.
"""
from __future__ import annotations

import base64
import json
import logging
from decimal import Decimal, ROUND_HALF_UP
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from django.conf import settings

from .models import OrderAddress, Payment


logger = logging.getLogger(__name__)


class PayMongoError(Exception):
    """A safe, customer-facing PayMongo checkout creation error."""


class PayMongoHTTPError(PayMongoError):
    """A provider failure whose status is safe for server-side reconciliation."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def has_secret_key() -> bool:
    """Expiry and reconciliation need only the server-side secret key."""
    return bool(settings.PAYMONGO_SECRET_KEY)


def is_configured() -> bool:
    """Require every setting needed to create and reliably settle a payment."""
    return bool(
        has_secret_key()
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


def _authorization_header() -> str:
    token = base64.b64encode(f"{settings.PAYMONGO_SECRET_KEY}:".encode()).decode()
    return f"Basic {token}"


def _request_session(path: str, *, method: str, body: bytes | None = None, idempotency_key: str = "") -> dict:
    """Make a server-side PayMongo request without exposing provider details."""
    headers = {"Authorization": _authorization_header()}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    request = Request(
        f"{settings.PAYMONGO_API_URL.rstrip('/')}{path}",
        data=body,
        headers=headers,
        method=method,
    )
    try:
        with urlopen(request, timeout=20) as response:  # nosec B310 — configured HTTPS URL
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        logger.warning("PayMongo %s %s failed with HTTP %s.", method, path, exc.code)
        raise PayMongoHTTPError(exc.code, "PayMongo could not complete this payment request. Please try again shortly.") from exc
    except URLError as exc:
        logger.warning("PayMongo %s %s could not be reached.", method, path)
        raise PayMongoError("Could not reach PayMongo. Please try again shortly.") from exc
    except (TypeError, ValueError) as exc:
        logger.warning("PayMongo %s %s returned an unreadable response.", method, path)
        raise PayMongoError("PayMongo returned an invalid response. Please try again shortly.") from exc
    if not isinstance(payload, dict):
        raise PayMongoError("PayMongo returned an invalid response. Please try again shortly.")
    return payload


def session_attributes(payload: dict) -> dict:
    session = payload.get("data", {}) if isinstance(payload, dict) else {}
    attributes = session.get("attributes", {}) if isinstance(session, dict) else {}
    return attributes if isinstance(attributes, dict) else {}


def checkout_session_state(payload: dict) -> str:
    """Reduce PayMongo's session and payment records to a safe local state."""
    attributes = session_attributes(payload)
    if str(attributes.get("status") or "").lower() == "expired":
        return "expired"

    payments = attributes.get("payments", [])
    if isinstance(payments, list):
        payment_statuses = {
            str(item.get("attributes", {}).get("status") or "").lower()
            for item in payments
            if isinstance(item, dict) and isinstance(item.get("attributes", {}), dict)
        }
        if "paid" in payment_statuses:
            return "paid"
        if payment_statuses & {"pending", "processing"}:
            return "processing"

    payment_intent = attributes.get("payment_intent", {})
    intent_attributes = payment_intent.get("attributes", {}) if isinstance(payment_intent, dict) else {}
    intent_status = str(intent_attributes.get("status") or "").lower() if isinstance(intent_attributes, dict) else ""
    if intent_status in {"succeeded", "paid"}:
        return "paid"
    if intent_status in {"pending", "processing"}:
        return "processing"
    if str(attributes.get("status") or "").lower() == "active":
        return "active"
    return "unknown"


def retrieve_checkout_session(session_id: str) -> dict:
    """Retrieve a session to reconcile an expiry/retry race safely."""
    if not has_secret_key():
        raise PayMongoError("PayMongo is not configured. Add its server-side secret key first.")
    return _request_session(f"/v1/checkout_sessions/{quote(session_id, safe='')}", method="GET")


def expire_checkout_session(payment: Payment) -> str:
    """Expire a pending session and return PayMongo's authoritative status.

    A cancellation redirect is not proof that the shopper cancelled.  The API
    must confirm an ``expired`` session before the order's stock reservation is
    released.  PayMongo returns HTTP 400 for races such as an already-paid or
    already-expired session, so those responses are reconciled with a GET.
    """
    if not has_secret_key():
        raise PayMongoError("PayMongo is not configured. Add its server-side secret key first.")
    session_id = str(payment.provider_ref or "")
    if not session_id.startswith("cs_"):
        raise PayMongoError("This order does not have an active PayMongo checkout to cancel.")
    path = f"/v1/checkout_sessions/{quote(session_id, safe='')}/expire"
    try:
        payload = _request_session(
            path,
            method="POST",
            idempotency_key=f"stride-expire-{payment.id}",
        )
    except PayMongoHTTPError as exc:
        if exc.status_code != 400:
            raise PayMongoError("PayMongo could not confirm the cancellation. Please try again shortly.") from exc
        payload = retrieve_checkout_session(session_id)

    state = checkout_session_state(payload)
    if state == "unknown":
        raise PayMongoError("PayMongo did not confirm the payment status. Please try again shortly.")
    return state


def create_checkout_session(payment: Payment) -> dict:
    """Create a PayMongo v2 Checkout Session and persist its session ID."""
    if not is_configured():
        raise PayMongoError("PayMongo is not configured. Add its server-side checkout and webhook settings first.")
    if payment.currency != "PHP":
        raise PayMongoError("PayMongo Hosted Checkout currently requires PHP payments.")

    total_centavos = amount_in_centavos(payment.amount)
    if total_centavos <= 0:
        raise PayMongoError("An online checkout cannot be created for a zero-value order.")

    # Do not create a second payable Checkout Session for the same order.  A
    # PayMongo idempotency key has a finite cache window, while this store must
    # protect an order for its full pending lifetime.
    if payment.provider_ref:
        existing = retrieve_checkout_session(payment.provider_ref)
        existing_state = checkout_session_state(existing)
        if existing_state in {"paid", "processing"}:
            raise PayMongoError("This payment is already being confirmed. Please wait a moment.")
        if existing_state == "expired":
            raise PayMongoError("This payment checkout has expired. Please place a new order.")
        existing_url = str(session_attributes(existing).get("checkout_url") or "")
        if not existing_url:
            raise PayMongoError("PayMongo did not return an active checkout link. Please try again shortly.")
        return existing

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
    try:
        data = _request_session(
            "/v2/checkout_sessions",
            method="POST",
            body=body,
            idempotency_key=f"stride-checkout-{payment.id}",
        )
    except PayMongoHTTPError as exc:
        raise PayMongoError("PayMongo could not create the checkout. Please try again shortly.") from exc

    session = data.get("data", {}) if isinstance(data, dict) else {}
    attributes = session_attributes(data)
    session_id = str(session.get("id") or "")
    checkout_url = str(attributes.get("checkout_url") or "") if isinstance(attributes, dict) else ""
    if not session_id or not checkout_url:
        raise PayMongoError("PayMongo did not return a valid checkout session. Please try again.")
    payment.provider = Payment.Provider.PAYMONGO
    payment.provider_ref = session_id
    payment.save(update_fields=["provider", "provider_ref"])
    return data

