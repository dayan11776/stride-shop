"""Provider selection and a common hosted-checkout response shape."""
from __future__ import annotations

from django.conf import settings

from . import paymongo, xendit
from .models import Payment


class HostedCheckoutError(Exception):
    pass


def active_provider() -> str:
    """Return the provider for newly-created online orders.

    ``auto`` makes the PayMongo rollout non-disruptive: it prefers a complete
    PayMongo configuration but leaves the deployed Xendit integration usable
    until PayMongo's credentials and signing secret are added.
    """
    configured = str(settings.PAYMENT_PROVIDER or "auto").lower()
    if configured == "auto":
        return Payment.Provider.PAYMONGO if paymongo.is_configured() else Payment.Provider.XENDIT
    if configured in {Payment.Provider.PAYMONGO, Payment.Provider.XENDIT}:
        return configured
    raise HostedCheckoutError("PAYMENT_PROVIDER must be 'auto', 'paymongo', or 'xendit'.")


def is_online_payment_configured() -> bool:
    try:
        provider = active_provider()
    except HostedCheckoutError:
        return False
    return paymongo.is_configured() if provider == Payment.Provider.PAYMONGO else xendit.is_configured()


def provider_for_payment(payment: Payment) -> str:
    if payment.provider in {Payment.Provider.PAYMONGO, Payment.Provider.XENDIT}:
        return payment.provider
    return active_provider()


def create_hosted_checkout(payment: Payment) -> dict:
    """Create/retrieve a provider session using the provider recorded on payment."""
    provider = provider_for_payment(payment)
    if provider == Payment.Provider.PAYMONGO:
        try:
            payload = paymongo.create_checkout_session(payment)
        except paymongo.PayMongoError as exc:
            raise HostedCheckoutError(str(exc)) from exc
        session = payload.get("data", {})
        attributes = session.get("attributes", {}) if isinstance(session, dict) else {}
        return {
            "provider": provider,
            "checkout_url": attributes.get("checkout_url"),
            "provider_ref": payment.provider_ref,
            "expires_at": attributes.get("expires_at"),
        }

    if provider == Payment.Provider.XENDIT:
        try:
            invoice = xendit.create_invoice(payment)
        except xendit.XenditError as exc:
            raise HostedCheckoutError(str(exc)) from exc
        if payment.provider != Payment.Provider.XENDIT:
            payment.provider = Payment.Provider.XENDIT
            payment.save(update_fields=["provider"])
        return {
            "provider": provider,
            "checkout_url": invoice.get("invoice_url") or invoice.get("checkout_url"),
            "provider_ref": payment.provider_ref,
            "expires_at": invoice.get("expiry_date"),
        }

    raise HostedCheckoutError("The selected payment provider is not supported.")

