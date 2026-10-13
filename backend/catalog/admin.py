from django.contrib import admin

from .models import Brand, Category, Inventory, Product, ProductImage, ProductVariant, Review, SizeChartEntry, StockNotification, WishlistItem


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "brand", "category", "audience", "status", "is_new_arrival")
    list_filter = ("status", "audience", "brand", "category")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [ProductVariantInline, ProductImageInline]


admin.site.register([Brand, Category, Inventory, SizeChartEntry, Review, WishlistItem, StockNotification])
