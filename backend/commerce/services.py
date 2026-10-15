"""Transactional cart, inventory, and order operations.

Views stay deliberately thin: all inventory-changing work happens here under
database transactions so an API retry cannot oversell a variant.
"""
from __future__ import annotations

import secrets
from decimal import Decimal
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.models import Inventory, Product, ProductVariant

from .models import Cart, CartItem, InventoryMovement, Order, OrderAddress, OrderItem, OrderStatusHistory, Payment, PromoCode, ShippingMethod

ZERO = Decimal("0.00")


def get_cart_for_request(request, *, create: bool = True) -> tuple[Cart | None, str | None]:
    """Return the user's current cart and a new anonymous token if needed."""
    token = request.COOKIES.get("stride_cart")
    if request.user.is_authenticated:
        user_cart = Cart.objects.filter(user=request.user).order_by("-updated_at").first()
        guest_cart = Cart.objects.filter(session_token=token).first() if token else None
        if guest_cart and guest_cart != user_cart:
            user_cart = merge_cart_into_user(guest_cart, request.user, user_cart)
            token = None
        if user_cart:
            return user_cart, token
        if not create:
            return None, token
        return Cart.objects.create(user=request.user), token

    if token:
        cart = Cart.objects.filter(session_token=token).first()
        if cart:
            return cart, token
    if not create:
        return None, token
    token = secrets.token_urlsafe(48)
    return Cart.objects.create(session_token=token), token


@transaction.atomic
def merge_cart_into_user(guest_cart: Cart, user, existing_cart: Cart | None = None) -> Cart:
    """Merge a guest cart after login, retaining the largest quantity per SKU."""
    target = existing_cart or Cart.objects.filter(user=user).order_by("-updated_at").first()
    if target is None:
        guest_cart.user = user
        guest_cart.session_token = None
        guest_cart.save(update_fields=["user", "session_token", "updated_at"])
        return guest_cart
    for item in guest_cart.items.select_for_update():
        target_item, created = CartItem.objects.get_or_create(
            cart=target, variant=item.variant, defaults={"quantity": item.quantity}
        )
        if not created:
            target_item.quantity += item.quantity
            target_item.save(update_fields=["quantity"])
    if guest_cart.promo_code and not target.promo_code:
        target.promo_code = guest_cart.promo_code
        target.save(update_fields=["promo_code", "updated_at"])
    guest_cart.delete()
    return target


def get_unit_price(variant: ProductVariant) -> Decimal:
    return variant.current_price


def calculate_discount(promo: PromoCode | None, subtotal: Decimal, shipping_fee: Decimal) -> tuple[Decimal, Decimal]:
    if not promo or not promo.is_valid_for(subtotal):
        return ZERO, shipping_fee
    if promo.discount_type == PromoCode.DiscountType.PERCENT:
        discount = (subtotal * promo.value / Decimal("100")).quantize(Decimal("0.01"))
    elif promo.discount_type == PromoCode.DiscountType.FIXED:
        discount = min(promo.value, subtotal)
    else:
        discount = ZERO
        shipping_fee = ZERO
    return discount, shipping_fee


def calculate_cart_totals(cart: Cart, shipping_method: ShippingMethod | None = None) -> dict[str, Decimal]:
    items = list(cart.items.select_related("variant__product").all())
    subtotal = sum((get_unit_price(item.variant) * item.quantity for item in items), ZERO).quantize(Decimal("0.01"))
    shipping_fee = shipping_method.base_fee if shipping_method else ZERO
    discount_total, shipping_fee = calculate_discount(cart.promo_code, subtotal, shipping_fee)
    tax_total = ZERO  # Philippine tax is included in displayed retail price for this MVP.
    return {
        "subtotal": subtotal,
        "discount_total": discount_total,
        "shipping_fee": shipping_fee,
        "tax_total": tax_total,
        "grand_total": max(ZERO, subtotal - discount_total + shipping_fee + tax_total),
    }


def apply_promo(cart: Cart, code: str) -> Cart:
    try:
        promo = PromoCode.objects.get(code__iexact=code.strip())
    except PromoCode.DoesNotExist as exc:
        raise ValidationError({"promoCode": "That promo code does not exist."}) from exc
    subtotal = calculate_cart_totals(cart)["subtotal"]
    if not promo.is_valid_for(subtotal):
        raise ValidationError({"promoCode": "That promo code is not currently valid for this cart."})
    cart.promo_code = promo
    cart.save(update_fields=["promo_code", "updated_at"])
    return cart


@transaction.atomic
def create_order_from_cart(
    *, cart: Cart, checkout: dict[str, Any], shipping_method: ShippingMethod, user=None, payment_provider: str = ""
) -> tuple[Order, Payment]:
    """Snapshot a cart into an order and reserve inventory atomically."""
    locked_items = list(
        CartItem.objects.select_for_update()
        .filter(cart=cart)
        .select_related("variant__product", "cart__promo_code")
    )
    if not locked_items:
        raise ValidationError({"cart": "Your cart is empty."})

    # Re-read promo under the same transaction and calculate server-side prices.
    cart = Cart.objects.select_for_update().select_related("promo_code").get(pk=cart.pk)
    totals = calculate_cart_totals(cart, shipping_method)
    email = checkout["email"].lower()
    checkout_user = user if getattr(user, "is_authenticated", False) else None
    order = Order.objects.create(
        user=checkout_user,
        guest_email="" if checkout_user else email,
        shipping_method=shipping_method,
        promo_code=cart.promo_code,
        **totals,
    )
    address_fields = {
        "recipient_name": checkout["full_name"],
        "phone": checkout["phone"],
        "line1": checkout["line1"],
        "line2": checkout.get("line2", ""),
        "city": checkout["city"],
        "province": checkout.get("province", ""),
        "postal_code": checkout["postal_code"],
        "country": checkout.get("country", "PH").upper(),
    }
    OrderAddress.objects.create(order=order, type=OrderAddress.Type.SHIPPING, **address_fields)
    OrderAddress.objects.create(order=order, type=OrderAddress.Type.BILLING, **address_fields)

    for cart_item in locked_items:
        variant = ProductVariant.objects.select_for_update().select_related("product").get(pk=cart_item.variant_id)
        if not variant.is_active or variant.product.status != Product.Status.ACTIVE:
            raise ValidationError({"cart": f"{variant.sku} is no longer available."})
        inventory, _ = Inventory.objects.select_for_update().get_or_create(variant=variant)
        if inventory.available < cart_item.quantity:
            raise ValidationError({"cart": f"Only {inventory.available} pairs of {variant.sku} remain."})
        Inventory.objects.filter(pk=inventory.pk).update(quantity_reserved=F("quantity_reserved") + cart_item.quantity)
        unit_price = get_unit_price(variant)
        OrderItem.objects.create(
            order=order,
            variant=variant,
            product_name=variant.product.name,
            sku=variant.sku,
            color_name=variant.color_name,
            size_eu=variant.size_eu,
            width=variant.width,
            unit_price=unit_price,
            quantity=cart_item.quantity,
            line_total=(unit_price * cart_item.quantity).quantize(Decimal("0.01")),
        )

    payment = Payment.objects.create(
        order=order,
        method=checkout["payment_method"],
        provider=payment_provider,
        amount=order.grand_total,
        currency=order.currency,
    )
    OrderStatusHistory.objects.create(order=order, status=Order.Status.PENDING, changed_by=checkout_user)
    if cart.promo_code:
        PromoCode.objects.filter(pk=cart.promo_code_id).update(times_used=F("times_used") + 1)
    CartItem.objects.filter(cart=cart).delete()
    cart.promo_code = None
    cart.save(update_fields=["promo_code", "updated_at"])
    return order, payment


@transaction.atomic
def capture_payment(payment: Payment, *, provider_ref: str = "", actor=None) -> Payment:
    """Idempotently capture a payment and convert reservations into sales."""
    payment = Payment.objects.select_for_update().select_related("order").get(pk=payment.pk)
    if payment.status == Payment.Status.CAPTURED:
        return payment
    if payment.status == Payment.Status.REFUNDED:
        raise ValidationError({"payment": "A refunded payment cannot be captured."})
    order = Order.objects.select_for_update().get(pk=payment.order_id)
    if order.status == Order.Status.CANCELLED:
        raise ValidationError({"order": "A cancelled order cannot be paid."})
    for item in order.items.select_for_update().select_related("variant"):
        inventory = Inventory.objects.select_for_update().get(variant_id=item.variant_id)
        # The line was reserved at checkout. Guard this again against manual adjustments.
        if inventory.quantity_on_hand < item.quantity or inventory.quantity_reserved < item.quantity:
            raise ValidationError({"inventory": f"Cannot capture {item.sku}; reserved stock is inconsistent."})
        inventory.quantity_on_hand -= item.quantity
        inventory.quantity_reserved -= item.quantity
        inventory.save(update_fields=["quantity_on_hand", "quantity_reserved", "updated_at"])
        InventoryMovement.objects.create(
            variant_id=item.variant_id,
            change=-item.quantity,
            reason=InventoryMovement.Reason.PURCHASE,
            order=order,
            created_by=actor if getattr(actor, "is_authenticated", False) else None,
        )
    payment.status = Payment.Status.CAPTURED
    payment.provider_ref = provider_ref or payment.provider_ref
    payment.paid_at = timezone.now()
    payment.save(update_fields=["status", "provider_ref", "paid_at"])
    order.status = Order.Status.PAID
    order.save(update_fields=["status"])
    OrderStatusHistory.objects.create(order=order, status=Order.Status.PAID, changed_by=actor if getattr(actor, "is_authenticated", False) else None)
    return payment


@transaction.atomic
def release_order_reservations(order: Order, *, actor=None, note: str = "") -> Order:
    """Release unpaid reservations when an order is cancelled or expires."""
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status == Order.Status.CANCELLED:
        return order
    if order.payments.filter(status=Payment.Status.CAPTURED).exists():
        raise ValidationError({"order": "Captured orders must be refunded, not cancelled."})
    for item in order.items.select_for_update():
        inventory = Inventory.objects.select_for_update().get(variant_id=item.variant_id)
        release = min(inventory.quantity_reserved, item.quantity)
        if release:
            inventory.quantity_reserved -= release
            inventory.save(update_fields=["quantity_reserved", "updated_at"])
            InventoryMovement.objects.create(
                variant_id=item.variant_id,
                change=release,
                reason=InventoryMovement.Reason.RESERVATION_RELEASE,
                order=order,
                created_by=actor if getattr(actor, "is_authenticated", False) else None,
            )
    order.status = Order.Status.CANCELLED
    order.save(update_fields=["status"])
    OrderStatusHistory.objects.create(
        order=order,
        status=Order.Status.CANCELLED,
        note=note,
        changed_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    return order


MAX_PER_LINE = 10
ALLOWED_TRANSITIONS = {
    "pending": {"paid", "cancelled"},
    "paid": {"packed", "cancelled", "refunded"},
    "packed": {"shipped", "cancelled"},
    "shipped": {"delivered"},
    "delivered": {"refunded"},
    "cancelled": set(),
    "refunded": set(),
}


def max_cart_quantity(variant) -> int:
    """Most pairs a shopper can hold for one variant: stock left, capped per line."""
    inventory = Inventory.objects.filter(variant=variant).first()
    return max(0, min(MAX_PER_LINE, inventory.available if inventory else 0))


def ensure_cart_quantity(variant, quantity: int) -> None:
    cap = max_cart_quantity(variant)
    if quantity > cap:
        message = f"Only {cap} available in this size." if cap else "This size is out of stock."
        raise ValidationError({"quantity": message})


@transaction.atomic
def set_order_status(order: Order, status: str, *, actor=None, note: str = "") -> Order:
    current = Order.objects.get(pk=order.pk).status
    if status != current and status not in ALLOWED_TRANSITIONS.get(current, set()):
        raise ValidationError({"status": f"An order that is {current} cannot become {status}."})
    if status == Order.Status.CANCELLED:
        return release_order_reservations(order, actor=actor, note=note)
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status == status:
        return order
    order.status = status
    order.save(update_fields=["status"])
    OrderStatusHistory.objects.create(
        order=order,
        status=status,
        note=note,
        changed_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
    return order

