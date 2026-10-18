from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Avg
from rest_framework import serializers

from accounts.models import Address
from catalog.models import Brand, Category, Inventory, Product, ProductImage, ProductVariant, Review, SizeChartEntry, StockNotification, WishlistItem
from commerce.models import Cart, CartItem, InventoryMovement, Order, OrderAddress, OrderItem, OrderStatusHistory, Payment, PromoCode, ReturnItem, ReturnRequest, Shipment, ShippingMethod
from commerce.services import calculate_cart_totals
from content.models import ContactMessage, ContentPage, FAQ, HomepageSection, NewsletterSubscriber

User = get_user_model()


def number(value: Decimal | int | float | None):
    return float(value) if value is not None else None


class UserSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(source="full_name")
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = User
        fields = ("id", "email", "fullName", "phone", "role", "createdAt")
        read_only_fields = ("id", "email", "role", "createdAt")


class RegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)
    fullName = serializers.CharField(required=False, write_only=True)
    full_name = serializers.CharField(required=False, write_only=True)
    phone = serializers.CharField(required=False, allow_blank=True)

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account already exists for this email.")
        return value

    def validate(self, attrs):
        full_name = attrs.pop("fullName", None) or attrs.pop("full_name", None)
        if not full_name or not full_name.strip():
            raise serializers.ValidationError({"fullName": "Your full name is required."})
        attrs["full_name"] = full_name.strip()
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class AddressSerializer(serializers.ModelSerializer):
    recipientName = serializers.CharField(source="recipient_name")
    postalCode = serializers.CharField(source="postal_code")
    isDefault = serializers.BooleanField(source="is_default", required=False)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Address
        fields = ("id", "label", "recipientName", "phone", "line1", "line2", "city", "province", "postalCode", "country", "isDefault", "createdAt")
        read_only_fields = ("id", "createdAt")

    def validate_country(self, value):
        return value.upper()


class BrandSerializer(serializers.ModelSerializer):
    logoUrl = serializers.URLField(source="logo_url", allow_blank=True, required=False)
    isFeatured = serializers.BooleanField(source="is_featured", required=False)

    class Meta:
        model = Brand
        fields = ("id", "name", "slug", "logoUrl", "isFeatured")
        read_only_fields = ("id",)


class CategorySerializer(serializers.ModelSerializer):
    parentId = serializers.UUIDField(source="parent_id", allow_null=True, required=False)

    class Meta:
        model = Category
        fields = ("id", "parentId", "name", "slug", "position")
        read_only_fields = ("id",)


class ProductImageSerializer(serializers.ModelSerializer):
    colorName = serializers.CharField(source="color_name", allow_blank=True, required=False)
    altText = serializers.CharField(source="alt_text", allow_blank=True, required=False)
    isPrimary = serializers.BooleanField(source="is_primary", required=False)

    class Meta:
        model = ProductImage
        fields = ("id", "colorName", "url", "altText", "position", "isPrimary")
        read_only_fields = ("id",)


class ProductVariantSerializer(serializers.ModelSerializer):
    productId = serializers.UUIDField(source="product_id", read_only=True)
    colorName = serializers.CharField(source="color_name")
    colorHex = serializers.CharField(source="color_hex", allow_blank=True, required=False)
    sizeEu = serializers.DecimalField(source="size_eu", max_digits=3, decimal_places=1)
    sizeUs = serializers.DecimalField(source="size_us", max_digits=3, decimal_places=1, allow_null=True, required=False)
    salePrice = serializers.DecimalField(source="sale_price", max_digits=12, decimal_places=2, allow_null=True, required=False)
    isActive = serializers.BooleanField(source="is_active", required=False)
    currentPrice = serializers.SerializerMethodField()
    available = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = ("id", "productId", "sku", "colorName", "colorHex", "sizeEu", "sizeUs", "width", "price", "salePrice", "sale_starts_at", "sale_ends_at", "isActive", "currentPrice", "available")
        read_only_fields = ("id", "productId", "currentPrice", "available")

    def get_currentPrice(self, obj):
        return number(obj.current_price)

    def get_available(self, obj):
        try:
            return obj.inventory.available
        except ProductVariant.inventory.RelatedObjectDoesNotExist:
            return 0


class ProductCardSerializer(serializers.ModelSerializer):
    brand = serializers.CharField(source="brand.name", read_only=True)
    brandSlug = serializers.CharField(source="brand.slug", read_only=True)
    category = serializers.CharField(source="category.name", read_only=True)
    categorySlug = serializers.CharField(source="category.slug", read_only=True)
    price = serializers.SerializerMethodField()
    salePrice = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    isNew = serializers.BooleanField(source="is_new_arrival", read_only=True)
    isExampleStock = serializers.BooleanField(source="is_example_stock", read_only=True)
    isExamplePrice = serializers.BooleanField(source="is_example_price", read_only=True)
    sizes = serializers.SerializerMethodField()
    availableQuantity = serializers.SerializerMethodField()
    reviewAverage = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ("id", "slug", "name", "brand", "brandSlug", "category", "categorySlug", "audience", "price", "salePrice", "image", "isNew", "isExampleStock", "isExamplePrice", "sizes", "availableQuantity", "reviewAverage")

    def _variants(self, obj):
        return [variant for variant in obj.variants.all() if variant.is_active]

    def _card_prices(self, obj):
        if not hasattr(self, "_card_price_cache"):
            self._card_price_cache = {}
        if obj.pk not in self._card_price_cache:
            priced = [(variant, variant.current_price) for variant in self._variants(obj)]
            if priced:
                variant, current = min(priced, key=lambda pair: pair[1])
                sale = current if variant.sale_price is not None and current == variant.sale_price else None
                self._card_price_cache[obj.pk] = (number(variant.price), number(sale))
            else:
                self._card_price_cache[obj.pk] = (None, None)
        return self._card_price_cache[obj.pk]

    def get_price(self, obj):
        # List price of the variant a shopper pays least for, so a crossed-out
        # "was" price is never the sale price.
        return self._card_prices(obj)[0]

    def get_salePrice(self, obj):
        # The struck-through regular price and sale price must describe the
        # same cheapest-current-price variant, not two different sizes.
        return self._card_prices(obj)[1]

    def get_image(self, obj):
        images = list(obj.images.all())
        image = next((item for item in images if item.is_primary), images[0] if images else None)
        return image.url if image else ""

    def get_sizes(self, obj):
        return sorted({number(variant.size_eu) for variant in self._variants(obj)})

    def get_availableQuantity(self, obj):
        # A card represents all active sizes/colours, so its count is the sum
        # shoppers can actually buy after existing reservations are excluded.
        total = 0
        for variant in self._variants(obj):
            try:
                total += max(variant.inventory.available, 0)
            except ProductVariant.inventory.RelatedObjectDoesNotExist:
                continue
        return total

    def get_reviewAverage(self, obj):
        # Annotated values avoid a query per card; the fallback keeps direct use handy.
        value = getattr(obj, "review_average", None)
        if value is None:
            value = obj.reviews.filter(status=Review.Status.PUBLISHED).aggregate(value=Avg("rating"))["value"]
        return round(float(value), 1) if value is not None else None


class ProductDetailSerializer(ProductCardSerializer):
    fitNote = serializers.CharField(source="fit_note", read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    materials = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)

    class Meta(ProductCardSerializer.Meta):
        fields = ProductCardSerializer.Meta.fields + ("description", "materials", "fitNote", "variants", "images")


class ReviewSerializer(serializers.ModelSerializer):
    userName = serializers.CharField(source="user.full_name", read_only=True)
    fitRating = serializers.CharField(source="fit_rating", allow_blank=True, required=False)
    isVerifiedPurchase = serializers.BooleanField(source="is_verified_purchase", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Review
        fields = ("id", "userName", "rating", "title", "body", "fitRating", "isVerifiedPurchase", "status", "createdAt")
        read_only_fields = ("id", "userName", "isVerifiedPurchase", "status", "createdAt")


class ReviewCreateSerializer(serializers.ModelSerializer):
    fitRating = serializers.CharField(source="fit_rating", allow_blank=True, required=False)

    class Meta:
        model = Review
        fields = ("rating", "title", "body", "fitRating")


class SizeChartEntrySerializer(serializers.ModelSerializer):
    sizeEu = serializers.DecimalField(source="size_eu", max_digits=3, decimal_places=1)
    sizeUs = serializers.DecimalField(source="size_us", max_digits=3, decimal_places=1, allow_null=True)
    sizeUk = serializers.DecimalField(source="size_uk", max_digits=3, decimal_places=1, allow_null=True)
    footLengthCm = serializers.DecimalField(source="foot_length_cm", max_digits=4, decimal_places=1)

    class Meta:
        model = SizeChartEntry
        fields = ("id", "audience", "sizeEu", "sizeUs", "sizeUk", "footLengthCm")


class WishlistItemSerializer(serializers.ModelSerializer):
    product = ProductCardSerializer(read_only=True)

    class Meta:
        model = WishlistItem
        fields = ("id", "product", "created_at")


class StockNotificationSerializer(serializers.ModelSerializer):
    variantId = serializers.UUIDField(source="variant_id")

    def validate_variantId(self, value):
        if not ProductVariant.objects.filter(pk=value, is_active=True, product__status=Product.Status.ACTIVE, product__recycled_at__isnull=True).exists():
            raise serializers.ValidationError("That product size could not be found.")
        return value

    class Meta:
        model = StockNotification
        fields = ("id", "variantId", "email", "created_at", "notified_at")
        read_only_fields = ("id", "created_at", "notified_at")


class ShippingMethodSerializer(serializers.ModelSerializer):
    baseFee = serializers.DecimalField(source="base_fee", max_digits=12, decimal_places=2)
    estDaysMin = serializers.IntegerField(source="est_days_min", allow_null=True, required=False)
    estDaysMax = serializers.IntegerField(source="est_days_max", allow_null=True, required=False)
    isActive = serializers.BooleanField(source="is_active", required=False)

    class Meta:
        model = ShippingMethod
        fields = ("id", "name", "description", "baseFee", "estDaysMin", "estDaysMax", "isActive")
        read_only_fields = ("id",)


class CartVariantSerializer(serializers.ModelSerializer):
    productId = serializers.UUIDField(source="product_id", read_only=True)
    productName = serializers.CharField(source="product.name", read_only=True)
    slug = serializers.CharField(source="product.slug", read_only=True)
    colorName = serializers.CharField(source="color_name", read_only=True)
    sizeEu = serializers.DecimalField(source="size_eu", max_digits=3, decimal_places=1, read_only=True)
    currentPrice = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = ("id", "productId", "productName", "slug", "sku", "colorName", "sizeEu", "width", "currentPrice", "image")

    def get_currentPrice(self, obj):
        return number(obj.current_price)

    def get_image(self, obj):
        images = list(obj.product.images.all())
        return (next((item for item in images if item.is_primary), images[0] if images else None).url if images else "")


class CartItemSerializer(serializers.ModelSerializer):
    variant = CartVariantSerializer(read_only=True)
    unitPrice = serializers.SerializerMethodField()
    lineTotal = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ("id", "variant", "quantity", "added_at", "unitPrice", "lineTotal")
        read_only_fields = ("id", "added_at", "unitPrice", "lineTotal")

    def get_unitPrice(self, obj):
        return number(obj.variant.current_price)

    def get_lineTotal(self, obj):
        return number(obj.variant.current_price * obj.quantity)


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    promoCode = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    discountTotal = serializers.SerializerMethodField()
    shippingFee = serializers.SerializerMethodField()
    taxTotal = serializers.SerializerMethodField()
    grandTotal = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ("id", "items", "promoCode", "subtotal", "discountTotal", "shippingFee", "taxTotal", "grandTotal", "updated_at")

    def _totals(self, obj):
        return calculate_cart_totals(obj, self.context.get("shipping_method"))

    def get_promoCode(self, obj):
        return obj.promo_code.code if obj.promo_code_id else None

    def get_subtotal(self, obj):
        return number(self._totals(obj)["subtotal"])

    def get_discountTotal(self, obj):
        return number(self._totals(obj)["discount_total"])

    def get_shippingFee(self, obj):
        return number(self._totals(obj)["shipping_fee"])

    def get_taxTotal(self, obj):
        return number(self._totals(obj)["tax_total"])

    def get_grandTotal(self, obj):
        return number(self._totals(obj)["grand_total"])


class CartItemInputSerializer(serializers.Serializer):
    variantId = serializers.UUIDField(required=False)
    variant_id = serializers.UUIDField(required=False)
    quantity = serializers.IntegerField(min_value=1, default=1)

    def validate(self, attrs):
        variant_id = attrs.pop("variantId", None) or attrs.pop("variant_id", None)
        if not variant_id:
            raise serializers.ValidationError({"variantId": "A product variant is required."})
        try:
            variant = ProductVariant.objects.select_related("product").get(pk=variant_id)
        except ProductVariant.DoesNotExist as exc:
            raise serializers.ValidationError({"variantId": "That product variant does not exist."}) from exc
        if not variant.is_active or variant.product.status != Product.Status.ACTIVE or variant.product.recycled_at:
            raise serializers.ValidationError({"variantId": "That product variant is not available."})
        attrs["variant"] = variant
        return attrs


class CartItemUpdateSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)


class PromoInputSerializer(serializers.Serializer):
    promoCode = serializers.CharField(required=False)
    code = serializers.CharField(required=False)

    def validate(self, attrs):
        value = attrs.get("promoCode") or attrs.get("code")
        if not value or not value.strip():
            raise serializers.ValidationError({"promoCode": "Enter a promo code."})
        attrs["code"] = value
        return attrs


class CheckoutInputSerializer(serializers.Serializer):
    fullName = serializers.CharField(required=False, write_only=True)
    full_name = serializers.CharField(required=False, write_only=True)
    email = serializers.EmailField()
    phone = serializers.CharField(min_length=7)
    line1 = serializers.CharField()
    line2 = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField()
    province = serializers.CharField(required=False, allow_blank=True)
    postalCode = serializers.CharField(required=False, write_only=True)
    postal_code = serializers.CharField(required=False, write_only=True)
    country = serializers.CharField(default="PH", max_length=2)
    shippingMethod = serializers.CharField(required=False, write_only=True)
    shipping_method = serializers.CharField(required=False, write_only=True)
    paymentMethod = serializers.ChoiceField(required=False, choices=Payment.Method.choices, write_only=True)
    payment_method = serializers.ChoiceField(required=False, choices=Payment.Method.choices, write_only=True)
    expectedTotal = serializers.DecimalField(source="expected_total", max_digits=12, decimal_places=2, min_value=0, required=False, write_only=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        full_name = attrs.pop("fullName", None) or attrs.pop("full_name", None)
        postal_code = attrs.pop("postalCode", None) or attrs.pop("postal_code", None)
        shipping_method = attrs.pop("shippingMethod", None) or attrs.pop("shipping_method", None)
        payment_method = attrs.pop("paymentMethod", None) or attrs.pop("payment_method", None)
        errors = {}
        if not full_name:
            errors["fullName"] = "Your full name is required."
        if not postal_code:
            errors["postalCode"] = "A postal code is required."
        if not shipping_method:
            errors["shippingMethod"] = "Choose a shipping method."
        if not payment_method:
            errors["paymentMethod"] = "Choose a payment method."
        if errors:
            raise serializers.ValidationError(errors)
        attrs["full_name"] = full_name.strip()
        attrs["postal_code"] = postal_code.strip()
        attrs["shipping_method_ref"] = shipping_method
        attrs["payment_method"] = payment_method
        attrs["country"] = attrs["country"].upper()
        return attrs


class OrderAddressSerializer(serializers.ModelSerializer):
    recipientName = serializers.CharField(source="recipient_name")
    postalCode = serializers.CharField(source="postal_code")

    class Meta:
        model = OrderAddress
        fields = ("id", "type", "recipientName", "phone", "line1", "line2", "city", "province", "postalCode", "country")


class OrderItemSerializer(serializers.ModelSerializer):
    productName = serializers.CharField(source="product_name")
    colorName = serializers.CharField(source="color_name")
    sizeEu = serializers.DecimalField(source="size_eu", max_digits=3, decimal_places=1)
    unitPrice = serializers.DecimalField(source="unit_price", max_digits=12, decimal_places=2)
    lineTotal = serializers.DecimalField(source="line_total", max_digits=12, decimal_places=2)

    class Meta:
        model = OrderItem
        fields = ("id", "variant", "productName", "sku", "colorName", "sizeEu", "width", "unitPrice", "quantity", "lineTotal")


class PaymentSerializer(serializers.ModelSerializer):
    provider = serializers.CharField(read_only=True)
    providerRef = serializers.CharField(source="provider_ref", read_only=True)
    paidAt = serializers.DateTimeField(source="paid_at", read_only=True)

    class Meta:
        model = Payment
        fields = ("id", "method", "provider", "providerRef", "amount", "currency", "status", "paidAt", "created_at")


class ShipmentSerializer(serializers.ModelSerializer):
    trackingNumber = serializers.CharField(source="tracking_number")
    shippedAt = serializers.DateTimeField(source="shipped_at", allow_null=True)
    deliveredAt = serializers.DateTimeField(source="delivered_at", allow_null=True)
    labelUrl = serializers.URLField(source="label_url", allow_blank=True)

    class Meta:
        model = Shipment
        fields = ("id", "carrier", "trackingNumber", "status", "shippedAt", "deliveredAt", "labelUrl")


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    changedAt = serializers.DateTimeField(source="created_at")

    class Meta:
        model = OrderStatusHistory
        fields = ("id", "status", "note", "changedAt")


class OrderSerializer(serializers.ModelSerializer):
    orderNumber = serializers.CharField(source="order_number")
    shippingMethod = ShippingMethodSerializer(source="shipping_method", read_only=True)
    discountTotal = serializers.DecimalField(source="discount_total", max_digits=12, decimal_places=2)
    shippingFee = serializers.DecimalField(source="shipping_fee", max_digits=12, decimal_places=2)
    taxTotal = serializers.DecimalField(source="tax_total", max_digits=12, decimal_places=2)
    grandTotal = serializers.DecimalField(source="grand_total", max_digits=12, decimal_places=2)
    placedAt = serializers.DateTimeField(source="placed_at")
    items = OrderItemSerializer(many=True, read_only=True)
    addresses = OrderAddressSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    shipments = ShipmentSerializer(many=True, read_only=True)
    statusHistory = OrderStatusHistorySerializer(source="status_history", many=True, read_only=True)

    class Meta:
        model = Order
        fields = ("id", "orderNumber", "status", "shippingMethod", "subtotal", "discountTotal", "shippingFee", "taxTotal", "grandTotal", "currency", "notes", "placedAt", "items", "addresses", "payments", "shipments", "statusHistory")


class ReturnItemSerializer(serializers.ModelSerializer):
    orderItemId = serializers.UUIDField(source="order_item_id")
    exchangeVariantId = serializers.UUIDField(source="exchange_variant_id", allow_null=True, required=False)

    class Meta:
        model = ReturnItem
        fields = ("id", "orderItemId", "quantity", "exchangeVariantId")
        read_only_fields = ("id",)


class ReturnRequestSerializer(serializers.ModelSerializer):
    orderNumber = serializers.CharField(source="order.order_number", read_only=True)
    requestedAt = serializers.DateTimeField(source="requested_at", read_only=True)
    resolvedAt = serializers.DateTimeField(source="resolved_at", read_only=True)
    items = ReturnItemSerializer(many=True, read_only=True)

    class Meta:
        model = ReturnRequest
        fields = ("id", "order", "orderNumber", "status", "resolution", "reason", "comments", "requestedAt", "resolvedAt", "items")
        read_only_fields = ("id", "status", "requestedAt", "resolvedAt", "orderNumber", "items")


class ReturnRequestCreateSerializer(serializers.Serializer):
    orderId = serializers.UUIDField()
    resolution = serializers.ChoiceField(choices=ReturnRequest.Resolution.choices)
    reason = serializers.CharField()
    comments = serializers.CharField(required=False, allow_blank=True)
    items = serializers.ListField(child=serializers.DictField(), min_length=1)


class HomepageSectionSerializer(serializers.ModelSerializer):
    sectionKey = serializers.CharField(source="section_key")
    ctaLabel = serializers.CharField(source="cta_label", allow_blank=True, required=False)
    ctaUrl = serializers.CharField(source="cta_url", allow_blank=True, required=False)
    imageUrl = serializers.URLField(source="image_url", allow_blank=True, required=False)
    isVisible = serializers.BooleanField(source="is_visible", required=False)

    class Meta:
        model = HomepageSection
        fields = ("id", "sectionKey", "title", "subtitle", "ctaLabel", "ctaUrl", "imageUrl", "position", "isVisible", "starts_at", "ends_at")
        read_only_fields = ("id",)


class ContentPageSerializer(serializers.ModelSerializer):
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = ContentPage
        fields = ("id", "slug", "title", "body", "updatedAt")
        read_only_fields = ("id", "updatedAt")


class FAQSerializer(serializers.ModelSerializer):
    isPublished = serializers.BooleanField(source="is_published", required=False)

    class Meta:
        model = FAQ
        fields = ("id", "topic", "question", "answer", "position", "isPublished")
        read_only_fields = ("id",)


class NewsletterSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewsletterSubscriber
        fields = ("email", "source")


class ContactMessageSerializer(serializers.ModelSerializer):
    orderNumber = serializers.CharField(source="order_number", allow_blank=True, required=False)

    class Meta:
        model = ContactMessage
        fields = ("id", "name", "email", "orderNumber", "message", "created_at")
        read_only_fields = ("id", "created_at")


class AdminProductImageSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)

    class Meta:
        model = ProductImage
        fields = ("id", "url", "color_name", "alt_text", "position", "is_primary")

    def validate_url(self, value):
        if not value.lower().startswith(("https://", "http://")):
            raise serializers.ValidationError("Use an HTTP or HTTPS image URL.")
        return value


class AdminNestedVariantSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    sku = serializers.CharField(max_length=100)
    sale_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, allow_null=True, required=False)
    quantity_on_hand = serializers.IntegerField(source="inventory.quantity_on_hand", min_value=0, required=False)
    expected_quantity_on_hand = serializers.IntegerField(min_value=0, required=False, write_only=True)
    quantity_reserved = serializers.IntegerField(source="inventory.quantity_reserved", read_only=True, default=0)
    low_stock_threshold = serializers.IntegerField(source="inventory.low_stock_threshold", min_value=0, required=False)

    class Meta:
        model = ProductVariant
        fields = ("id", "sku", "color_name", "color_hex", "size_eu", "size_us", "width", "price", "sale_price", "sale_starts_at", "sale_ends_at", "is_active", "quantity_on_hand", "expected_quantity_on_hand", "quantity_reserved", "low_stock_threshold")
        # Product is assigned by the parent. Validate uniqueness there against
        # both existing rows and the complete submitted set.
        validators = []

    def to_representation(self, instance):
        data = super().to_representation(instance)
        inventory = getattr(instance, "inventory", None)
        data["quantity_on_hand"] = inventory.quantity_on_hand if inventory else 0
        data["quantity_reserved"] = inventory.quantity_reserved if inventory else 0
        data["low_stock_threshold"] = inventory.low_stock_threshold if inventory else 5
        return data


# Staff endpoints use database-style field names; routes are team-only.
class AdminProductSerializer(serializers.ModelSerializer):
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    images = AdminProductImageSerializer(many=True, required=False)
    variants = AdminNestedVariantSerializer(many=True, required=False)
    remove_image_ids = serializers.ListField(child=serializers.UUIDField(), required=False, write_only=True)
    remove_variant_ids = serializers.ListField(child=serializers.UUIDField(), required=False, write_only=True)

    class Meta:
        model = Product
        fields = ("id", "brand", "brand_name", "category", "category_name", "name", "slug", "description", "materials", "audience", "fit_note", "status", "is_new_arrival", "is_example_stock", "is_example_price", "recycled_at", "created_at", "updated_at", "images", "variants", "remove_image_ids", "remove_variant_ids")
        read_only_fields = ("id", "recycled_at", "created_at", "updated_at")

    def validate(self, attrs):
        product = self.instance
        if "images" in attrs or "remove_image_ids" in attrs:
            existing_images = {item.id: item for item in product.images.all()} if product else {}
            remove_images = attrs.get("remove_image_ids", [])
            if len(set(remove_images)) != len(remove_images) or any(image_id not in existing_images for image_id in remove_images):
                raise serializers.ValidationError({"remove_image_ids": "An image ID is duplicated or does not belong to this product."})
            seen_images = set()
            primary_count = 0
            for image in attrs.get("images", []):
                image_id = image.get("id")
                if image_id:
                    if image_id in seen_images or image_id not in existing_images or image_id in remove_images:
                        raise serializers.ValidationError({"images": "An image ID is duplicated or does not belong to this product."})
                    seen_images.add(image_id)
                    original = existing_images[image_id]
                else:
                    original = None
                    if not image.get("url"):
                        raise serializers.ValidationError({"images": "Each new image needs a URL."})
                if image.get("is_primary", original.is_primary if original else False):
                    primary_count += 1
            primary_count += sum(1 for image_id, image in existing_images.items() if image_id not in seen_images and image_id not in remove_images and image.is_primary)
            if primary_count > 1:
                raise serializers.ValidationError({"images": "Only one image can be primary."})

        if "variants" in attrs or "remove_variant_ids" in attrs:
            existing = {item.id: item for item in product.variants.all()} if product else {}
            remove_variants = attrs.get("remove_variant_ids", [])
            if len(set(remove_variants)) != len(remove_variants) or any(variant_id not in existing for variant_id in remove_variants):
                raise serializers.ValidationError({"remove_variant_ids": "A variant ID is duplicated or does not belong to this product."})
            seen_ids, seen_skus, seen_dimensions = set(), set(), set()
            for item in attrs.get("variants", []):
                variant_id = item.get("id")
                if variant_id:
                    if variant_id in seen_ids or variant_id not in existing or variant_id in remove_variants:
                        raise serializers.ValidationError({"variants": "A variant ID is duplicated or does not belong to this product."})
                    seen_ids.add(variant_id)
                    original = existing[variant_id]
                    identity_fields = ("sku", "color_name", "size_eu", "size_us", "width")
                    if any(key in item and item[key] != getattr(original, key) for key in identity_fields) and (original.order_items.exists() or original.cart_items.exists()):
                        raise serializers.ValidationError({"variants": "A variant in an order or cart cannot have its SKU, colour, size, or width changed. Deactivate it and add another variant instead."})
                else:
                    original = None
                    if "expected_quantity_on_hand" in item:
                        raise serializers.ValidationError({"variants": "A new variant cannot have an expected stock value."})
                    if not all(key in item for key in ("sku", "color_name", "size_eu", "price")):
                        raise serializers.ValidationError({"variants": "Every new variant needs a SKU, colour, EU size, and price."})

                def value(key, default=None):
                    return item.get(key, getattr(original, key, default) if original else default)

                sku = value("sku")
                dimension = (value("color_name"), value("size_eu"), value("width", ProductVariant.Width.REGULAR))
                price, sale_price = value("price"), value("sale_price")
                if not sku or sku in seen_skus:
                    raise serializers.ValidationError({"variants": "Each variant needs a unique SKU."})
                if dimension in seen_dimensions:
                    raise serializers.ValidationError({"variants": "Each colour, size, and width combination must be unique."})
                seen_skus.add(sku)
                seen_dimensions.add(dimension)
                if ProductVariant.objects.filter(sku=sku).exclude(pk=variant_id).exists():
                    raise serializers.ValidationError({"variants": f"SKU {sku} is already in use."})
                if product and ProductVariant.objects.filter(product=product, color_name=dimension[0], size_eu=dimension[1], width=dimension[2]).exclude(pk=variant_id).exists():
                    raise serializers.ValidationError({"variants": "This colour, size, and width already exists; edit that variant instead."})
                if value("size_eu") is None or value("size_eu") <= 0 or (value("size_us") is not None and value("size_us") <= 0):
                    raise serializers.ValidationError({"variants": "Shoe sizes must be greater than zero."})
                if sale_price is not None and (price is None or sale_price >= price):
                    raise serializers.ValidationError({"variants": "Sale price must be less than the regular price."})
                if value("sale_starts_at") and value("sale_ends_at") and value("sale_starts_at") > value("sale_ends_at"):
                    raise serializers.ValidationError({"variants": "Sale end must be after its start."})
        return attrs

    def _save_images(self, product, images, remove_ids):
        existing = {item.id: item for item in product.images.all()}
        for data in images:
            image_id = data.pop("id", None)
            if image_id:
                image = existing[image_id]
                for field, value in data.items():
                    setattr(image, field, value)
                image.save()
            else:
                image = ProductImage.objects.create(product=product, **data)
        product.images.filter(id__in=remove_ids).delete()

    def _save_variants(self, product, variants, remove_ids):
        existing = {item.id: item for item in ProductVariant.objects.select_for_update().filter(product=product).order_by("id")}
        for data in variants:
            variant_id = data.pop("id", None)
            inventory_data = data.pop("inventory", {})
            expected_quantity = data.pop("expected_quantity_on_hand", None)
            if variant_id:
                variant = existing[variant_id]
                for field, value in data.items():
                    setattr(variant, field, value)
                variant.save()
            else:
                variant = ProductVariant.objects.create(product=product, **data)
            inventory, _ = Inventory.objects.select_for_update().get_or_create(variant=variant)
            if expected_quantity is not None and inventory.quantity_on_hand != expected_quantity:
                raise serializers.ValidationError({"variants": f"Stock for {variant.sku} changed since it was opened. Refresh before editing stock."})
            quantity = inventory_data.get("quantity_on_hand", inventory.quantity_on_hand)
            if quantity < inventory.quantity_reserved:
                raise serializers.ValidationError({"variants": f"Stock for {variant.sku} cannot be less than its reserved quantity ({inventory.quantity_reserved})."})
            change = quantity - inventory.quantity_on_hand
            inventory.quantity_on_hand = quantity
            inventory.low_stock_threshold = inventory_data.get("low_stock_threshold", inventory.low_stock_threshold)
            inventory.save(update_fields=["quantity_on_hand", "low_stock_threshold", "updated_at"])
            if change:
                request = self.context.get("request")
                InventoryMovement.objects.create(variant=variant, change=change, reason=InventoryMovement.Reason.ADJUSTMENT, created_by=request.user if request and request.user.is_authenticated else None)
        # Never delete variants: carts, reservations and order lines reference them.
        ProductVariant.objects.filter(product=product, id__in=remove_ids).update(is_active=False)

    @transaction.atomic
    def create(self, validated_data):
        images = validated_data.pop("images", [])
        variants = validated_data.pop("variants", [])
        remove_image_ids = validated_data.pop("remove_image_ids", [])
        remove_variant_ids = validated_data.pop("remove_variant_ids", [])
        product = Product.objects.create(**validated_data)
        self._save_images(product, images, remove_image_ids)
        self._save_variants(product, variants, remove_variant_ids)
        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        images = validated_data.pop("images", None)
        variants = validated_data.pop("variants", None)
        remove_image_ids = validated_data.pop("remove_image_ids", [])
        remove_variant_ids = validated_data.pop("remove_variant_ids", [])
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if images is not None or remove_image_ids:
            self._save_images(instance, images or [], remove_image_ids)
        if variants is not None or remove_variant_ids:
            self._save_variants(instance, variants or [], remove_variant_ids)
        return instance


class AdminProductVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductVariant
        fields = "__all__"
        read_only_fields = ("id",)

    def validate(self, attrs):
        product = attrs.get("product", self.instance.product if self.instance else None)
        if not product or product.recycled_at:
            raise serializers.ValidationError({"product": "The product is not available for editing."})
        if self.instance and product.pk != self.instance.product_id:
            raise serializers.ValidationError({"product": "An existing variant cannot be moved to another product."})
        if self.instance and any(key in attrs and attrs[key] != getattr(self.instance, key) for key in ("sku", "color_name", "size_eu", "size_us", "width")) and (self.instance.order_items.exists() or self.instance.cart_items.exists()):
            raise serializers.ValidationError({"detail": "A variant in an order or cart cannot have its SKU, colour, size, or width changed. Deactivate it and add another variant instead."})
        price = attrs.get("price", self.instance.price if self.instance else None)
        sale_price = attrs.get("sale_price", self.instance.sale_price if self.instance else None)
        if sale_price is not None and (sale_price < 0 or price is None or sale_price >= price):
            raise serializers.ValidationError({"sale_price": "Sale price must be non-negative and less than regular price."})
        size_eu = attrs.get("size_eu", self.instance.size_eu if self.instance else None)
        size_us = attrs.get("size_us", self.instance.size_us if self.instance else None)
        if (size_eu is not None and size_eu <= 0) or (size_us is not None and size_us <= 0):
            raise serializers.ValidationError({"size_eu": "Shoe sizes must be greater than zero."})
        sale_start = attrs.get("sale_starts_at", self.instance.sale_starts_at if self.instance else None)
        sale_end = attrs.get("sale_ends_at", self.instance.sale_ends_at if self.instance else None)
        if sale_start and sale_end and sale_start > sale_end:
            raise serializers.ValidationError({"sale_ends_at": "Sale end must be after its start."})
        return attrs


class PromoCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PromoCode
        fields = "__all__"
        read_only_fields = ("id",)


class AdminOrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = ("id", "order_number", "user", "guest_email", "status", "shipping_method", "promo_code", "subtotal", "discount_total", "shipping_fee", "tax_total", "grand_total", "currency", "notes", "placed_at")
        read_only_fields = ("id", "order_number", "placed_at")

