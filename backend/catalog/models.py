from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.db.models import F, Q

from common.models import TimeStampedUUIDModel, UUIDModel


class Brand(TimeStampedUUIDModel):
    name = models.CharField(max_length=160, unique=True)
    slug = models.SlugField(max_length=180, unique=True)
    logo_url = models.URLField(blank=True)
    is_featured = models.BooleanField(default=False)

    class Meta:
        db_table = "brands"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Category(UUIDModel):
    parent = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="children")
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "categories"
        ordering = ["position", "name"]

    def __str__(self):
        return self.name


class Product(TimeStampedUUIDModel):
    class Audience(models.TextChoices):
        MEN = "men", "Men"
        WOMEN = "women", "Women"
        KIDS = "kids", "Kids"
        UNISEX = "unisex", "Unisex"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    brand = models.ForeignKey(Brand, on_delete=models.PROTECT, related_name="products")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=280, unique=True)
    description = models.TextField(blank=True)
    materials = models.TextField(blank=True)
    audience = models.CharField(max_length=10, choices=Audience.choices)
    fit_note = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    is_new_arrival = models.BooleanField(default=False)
    # Example quantities are not verified stock and must be labelled as such.
    is_example_stock = models.BooleanField(default=False)
    # Separate from status: an archived product is not necessarily in the bin.
    # Keeping the row and its relations preserves order history and makes the
    # operation reversible.
    recycled_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "products"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["brand"]),
            models.Index(fields=["category"]),
            models.Index(fields=["audience", "status"]),
        ]

    def __str__(self):
        return self.name


class ProductVariant(UUIDModel):
    class Width(models.TextChoices):
        NARROW = "narrow", "Narrow"
        REGULAR = "regular", "Regular"
        WIDE = "wide", "Wide"

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    sku = models.CharField(max_length=100, unique=True)
    color_name = models.CharField(max_length=100)
    color_hex = models.CharField(max_length=7, blank=True, validators=[RegexValidator(r"^#[0-9A-Fa-f]{6}$")])
    size_eu = models.DecimalField(max_digits=3, decimal_places=1)
    size_us = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    width = models.CharField(max_length=10, choices=Width.choices, default=Width.REGULAR)
    price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    sale_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    sale_starts_at = models.DateTimeField(null=True, blank=True)
    sale_ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "product_variants"
        ordering = ["color_name", "size_eu"]
        constraints = [
            models.UniqueConstraint(fields=["product", "color_name", "size_eu", "width"], name="uniq_variant_dimension"),
            models.CheckConstraint(condition=Q(price__gte=0), name="variant_price_gte_zero"),
            models.CheckConstraint(condition=Q(sale_price__isnull=True) | Q(sale_price__lt=F("price")), name="variant_sale_below_price"),
        ]
        indexes = [models.Index(fields=["product"])]

    def __str__(self):
        return f"{self.product.name} · {self.sku}"

    @property
    def current_price(self):
        from django.utils import timezone

        now = timezone.now()
        if self.sale_price is not None and (not self.sale_starts_at or self.sale_starts_at <= now) and (not self.sale_ends_at or self.sale_ends_at >= now):
            return self.sale_price
        return self.price


class ProductImage(UUIDModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    color_name = models.CharField(max_length=100, blank=True)
    url = models.URLField()
    alt_text = models.CharField(max_length=255, blank=True)
    position = models.PositiveIntegerField(default=0)
    is_primary = models.BooleanField(default=False)

    class Meta:
        db_table = "product_images"
        ordering = ["position", "id"]
        indexes = [models.Index(fields=["product", "position"])]


class Inventory(models.Model):
    variant = models.OneToOneField(ProductVariant, on_delete=models.CASCADE, primary_key=True, related_name="inventory")
    quantity_on_hand = models.PositiveIntegerField(default=0)
    quantity_reserved = models.PositiveIntegerField(default=0)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory"
        constraints = [models.CheckConstraint(condition=Q(quantity_reserved__lte=F("quantity_on_hand")), name="reserved_not_over_hand")]

    @property
    def available(self):
        return self.quantity_on_hand - self.quantity_reserved


class SizeChartEntry(UUIDModel):
    audience = models.CharField(max_length=10, choices=Product.Audience.choices)
    size_eu = models.DecimalField(max_digits=3, decimal_places=1)
    size_us = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    size_uk = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    foot_length_cm = models.DecimalField(max_digits=4, decimal_places=1)

    class Meta:
        db_table = "size_chart_entries"
        constraints = [models.UniqueConstraint(fields=["audience", "size_eu"], name="uniq_size_chart_audience_eu")]
        ordering = ["audience", "size_eu"]


class Review(TimeStampedUUIDModel):
    class FitRating(models.TextChoices):
        RUNS_SMALL = "runs_small", "Runs small"
        TRUE_TO_SIZE = "true_to_size", "True to size"
        RUNS_LARGE = "runs_large", "Runs large"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PUBLISHED = "published", "Published"
        REJECTED = "rejected", "Rejected"

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    title = models.CharField(max_length=255, blank=True)
    body = models.TextField(blank=True)
    fit_rating = models.CharField(max_length=16, choices=FitRating.choices, blank=True)
    is_verified_purchase = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)

    class Meta:
        db_table = "reviews"
        constraints = [models.UniqueConstraint(fields=["product", "user"], name="uniq_product_review_per_user")]
        indexes = [models.Index(fields=["product", "status"])]
        ordering = ["-created_at"]


class WishlistItem(UUIDModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wishlist_items")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="wishlisted_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wishlist_items"
        constraints = [models.UniqueConstraint(fields=["user", "product"], name="uniq_wishlist_product")]
        ordering = ["-created_at"]


class StockNotification(UUIDModel):
    variant = models.ForeignKey(ProductVariant, on_delete=models.CASCADE, related_name="stock_notifications")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="stock_notifications")
    email = models.EmailField()
    created_at = models.DateTimeField(auto_now_add=True)
    notified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "stock_notifications"
        indexes = [models.Index(fields=["variant"], name="stock_notification_variant_idx")]
