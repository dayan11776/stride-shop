import uuid

from django.conf import settings
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from catalog.models import ProductVariant
from common.models import UUIDModel


def generate_order_number() -> str:
    """Human-friendly, collision-resistant order reference used by Xendit."""
    return f"STR-{timezone.now():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"


class PromoCode(UUIDModel):
    class DiscountType(models.TextChoices):
        PERCENT = "percent", "Percent"
        FIXED = "fixed", "Fixed amount"
        FREE_SHIPPING = "free_shipping", "Free shipping"

    code = models.CharField(max_length=64, unique=True)
    discount_type = models.CharField(max_length=16, choices=DiscountType.choices)
    value = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    min_subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    usage_limit = models.PositiveIntegerField(null=True, blank=True)
    times_used = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "promo_codes"
        ordering = ["code"]

    def __str__(self):
        return self.code

    def is_valid_for(self, subtotal) -> bool:
        now = timezone.now()
        return bool(
            self.is_active
            and subtotal >= self.min_subtotal
            and (self.starts_at is None or self.starts_at <= now)
            and (self.ends_at is None or self.ends_at >= now)
            and (self.usage_limit is None or self.times_used < self.usage_limit)
        )


class ShippingMethod(UUIDModel):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    base_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    est_days_min = models.PositiveIntegerField(null=True, blank=True)
    est_days_max = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "shipping_methods"
        ordering = ["base_fee", "name"]

    def __str__(self):
        return self.name


class Cart(UUIDModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="carts")
    session_token = models.CharField(max_length=96, unique=True, null=True, blank=True)
    promo_code = models.ForeignKey(PromoCode, on_delete=models.SET_NULL, null=True, blank=True, related_name="carts")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "carts"
        constraints = [
            models.CheckConstraint(condition=Q(user__isnull=False) | Q(session_token__isnull=False), name="cart_owner_or_session")
        ]


class CartItem(UUIDModel):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT, related_name="cart_items")
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cart_items"
        constraints = [models.UniqueConstraint(fields=["cart", "variant"], name="uniq_cart_variant")]
        indexes = [models.Index(fields=["cart"])]


class Order(UUIDModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        PACKED = "packed", "Packed"
        SHIPPED = "shipped", "Shipped"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    order_number = models.CharField(max_length=40, unique=True, default=generate_order_number, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="orders")
    guest_email = models.EmailField(blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    shipping_method = models.ForeignKey(ShippingMethod, on_delete=models.PROTECT, related_name="orders")
    promo_code = models.ForeignKey(PromoCode, on_delete=models.SET_NULL, null=True, blank=True, related_name="orders")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="PHP", validators=[RegexValidator(r"^[A-Z]{3}$")])
    notes = models.TextField(blank=True)
    placed_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = "orders"
        ordering = ["-placed_at"]
        constraints = [models.CheckConstraint(condition=Q(user__isnull=False) | ~Q(guest_email=""), name="order_user_or_guest")]
        indexes = [models.Index(fields=["user"]), models.Index(fields=["status", "-placed_at"])]

    def __str__(self):
        return self.order_number


class OrderAddress(UUIDModel):
    class Type(models.TextChoices):
        SHIPPING = "shipping", "Shipping"
        BILLING = "billing", "Billing"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="addresses")
    type = models.CharField(max_length=10, choices=Type.choices)
    recipient_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=40)
    line1 = models.CharField(max_length=255)
    line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=120)
    province = models.CharField(max_length=120, blank=True)
    postal_code = models.CharField(max_length=24)
    country = models.CharField(max_length=2, default="PH", validators=[RegexValidator(r"^[A-Z]{2}$")])

    class Meta:
        db_table = "order_addresses"
        constraints = [models.UniqueConstraint(fields=["order", "type"], name="uniq_order_address_type")]


class OrderItem(UUIDModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT, related_name="order_items")
    product_name = models.CharField(max_length=255)
    sku = models.CharField(max_length=100)
    color_name = models.CharField(max_length=100)
    size_eu = models.DecimalField(max_digits=3, decimal_places=1)
    width = models.CharField(max_length=10, choices=ProductVariant.Width.choices)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    line_total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "order_items"
        indexes = [models.Index(fields=["order"])]


class OrderStatusHistory(UUIDModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="status_history")
    status = models.CharField(max_length=12, choices=Order.Status.choices)
    note = models.TextField(blank=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="order_status_changes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "order_status_history"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["order", "created_at"])]


class InventoryMovement(UUIDModel):
    class Reason(models.TextChoices):
        PURCHASE = "purchase", "Purchase"
        RESTOCK = "restock", "Restock"
        RETURN = "return", "Return"
        ADJUSTMENT = "adjustment", "Adjustment"
        RESERVATION_RELEASE = "reservation_release", "Reservation release"

    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT, related_name="inventory_movements")
    change = models.IntegerField()
    reason = models.CharField(max_length=24, choices=Reason.choices)
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True, related_name="inventory_movements")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="inventory_movements")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "inventory_movements"
        constraints = [models.CheckConstraint(condition=~Q(change=0), name="inventory_change_nonzero")]
        indexes = [models.Index(fields=["variant", "created_at"])]


class Payment(UUIDModel):
    class Method(models.TextChoices):
        CARD = "card", "Card"
        PAYPAL = "paypal", "PayPal"
        EWALLET = "ewallet", "E-wallet"
        COD = "cod", "Cash on delivery"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        AUTHORIZED = "authorized", "Authorized"
        CAPTURED = "captured", "Captured"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=10, choices=Method.choices)
    provider_ref = models.CharField(max_length=255, blank=True, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="PHP", validators=[RegexValidator(r"^[A-Z]{3}$")])
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "payments"
        indexes = [models.Index(fields=["order"])]


class Shipment(UUIDModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_TRANSIT = "in_transit", "In transit"
        DELIVERED = "delivered", "Delivered"
        RETURNED = "returned", "Returned"

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="shipments")
    carrier = models.CharField(max_length=120, blank=True)
    tracking_number = models.CharField(max_length=160, blank=True, db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    label_url = models.URLField(blank=True)

    class Meta:
        db_table = "shipments"


class ReturnRequest(UUIDModel):
    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        APPROVED = "approved", "Approved"
        RECEIVED = "received", "Received"
        REFUNDED = "refunded", "Refunded"
        REJECTED = "rejected", "Rejected"
        EXCHANGED = "exchanged", "Exchanged"

    class Resolution(models.TextChoices):
        REFUND = "refund", "Refund"
        EXCHANGE = "exchange", "Exchange"
        STORE_CREDIT = "store_credit", "Store credit"

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="returns")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="return_requests")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.REQUESTED)
    resolution = models.CharField(max_length=16, choices=Resolution.choices)
    reason = models.TextField()
    comments = models.TextField(blank=True)
    requested_at = models.DateTimeField(default=timezone.now, editable=False)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "returns"
        indexes = [models.Index(fields=["order"])]


class ReturnItem(UUIDModel):
    return_request = models.ForeignKey(ReturnRequest, on_delete=models.CASCADE, related_name="items", db_column="return_id")
    order_item = models.ForeignKey(OrderItem, on_delete=models.PROTECT, related_name="return_items")
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    exchange_variant = models.ForeignKey(ProductVariant, on_delete=models.SET_NULL, null=True, blank=True, related_name="exchange_return_items")

    class Meta:
        db_table = "return_items"


class Refund(UUIDModel):
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="refunds")
    return_request = models.ForeignKey(ReturnRequest, on_delete=models.SET_NULL, null=True, blank=True, related_name="refunds", db_column="return_id")
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    reason = models.TextField(blank=True)
    refunded_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = "refunds"
