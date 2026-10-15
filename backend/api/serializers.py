from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg
from rest_framework import serializers

from accounts.models import Address
from catalog.models import Brand, Category, Product, ProductImage, ProductVariant, Review, SizeChartEntry, StockNotification, WishlistItem
from commerce.models import Cart, CartItem, Order, OrderAddress, OrderItem, OrderStatusHistory, Payment, PromoCode, ReturnItem, ReturnRequest, Shipment, ShippingMethod
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
    sizes = serializers.SerializerMethodField()
    reviewAverage = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ("id", "slug", "name", "brand", "brandSlug", "category", "categorySlug", "audience", "price", "salePrice", "image", "isNew", "sizes", "reviewAverage")

    def _variants(self, obj):
        return [variant for variant in obj.variants.all() if variant.is_active]

    def get_price(self, obj):
        # List price of the variant a shopper pays least for, so a crossed-out
        # "was" price is never the sale price.
        variants = self._variants(obj)
        return number(min(variants, key=lambda variant: variant.current_price).price) if variants else None

    def get_salePrice(self, obj):
        sale_prices = [variant.current_price for variant in self._variants(obj) if variant.sale_price is not None and variant.current_price == variant.sale_price]
        return number(min(sale_prices)) if sale_prices else None

    def get_image(self, obj):
        images = list(obj.images.all())
        image = next((item for item in images if item.is_primary), images[0] if images else None)
        return image.url if image else ""

    def get_sizes(self, obj):
        return sorted({number(variant.size_eu) for variant in self._variants(obj)})

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
        if not ProductVariant.objects.filter(pk=value, is_active=True).exists():
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
        if not variant.is_active or variant.product.status != Product.Status.ACTIVE:
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


# Staff endpoints use full database fields intentionally; their routes are team-only.
class AdminProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class AdminProductVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductVariant
        fields = "__all__"
        read_only_fields = ("id",)


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

