from django.contrib import admin

from .models import Cart, CartItem, InventoryMovement, Order, OrderAddress, OrderItem, OrderStatusHistory, Payment, PromoCode, Refund, ReturnItem, ReturnRequest, Shipment, ShippingMethod


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("product_name", "sku", "color_name", "size_eu", "width", "unit_price", "quantity", "line_total")


class OrderAddressInline(admin.TabularInline):
    model = OrderAddress
    extra = 0


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("order_number", "status", "grand_total", "currency", "placed_at")
    list_filter = ("status", "currency")
    search_fields = ("order_number", "guest_email", "user__email")
    readonly_fields = ("order_number", "placed_at")
    inlines = [OrderItemInline, OrderAddressInline]


admin.site.register([PromoCode, ShippingMethod, Cart, CartItem, OrderStatusHistory, InventoryMovement, Payment, Shipment, ReturnRequest, ReturnItem, Refund])
