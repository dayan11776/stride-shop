from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views


# The storefront intentionally uses slashless URLs: the Vite client can call
# them without relying on Django's POST-unsafe APPEND_SLASH redirect.
router = DefaultRouter(trailing_slash=False)
router.register("staff/products", views.AdminProductViewSet, basename="staff-product")
router.register("staff/variants", views.AdminVariantViewSet, basename="staff-variant")
router.register("staff/promos", views.AdminPromoCodeViewSet, basename="staff-promo")
router.register("staff/shipping-methods", views.AdminShippingMethodViewSet, basename="staff-shipping-method")
router.register("staff/content/pages", views.AdminContentPageViewSet, basename="staff-content-page")
router.register("staff/content/homepage", views.AdminHomepageSectionViewSet, basename="staff-homepage-section")
router.register("staff/content/faqs", views.AdminFAQViewSet, basename="staff-faq")
router.register("staff/orders", views.AdminOrderViewSet, basename="staff-order")
router.register("staff/returns", views.AdminReturnViewSet, basename="staff-return")


urlpatterns = [
    path("csrf", views.CsrfView.as_view(), name="csrf"),
    path("auth/register", views.RegisterView.as_view(), name="register"),
    path("auth/login", views.LoginView.as_view(), name="login"),
    path("auth/logout", views.LogoutView.as_view(), name="logout"),
    path("auth/me", views.MeView.as_view(), name="me"),
    path("account/profile", views.ProfileView.as_view(), name="profile"),
    path("account/addresses", views.AddressListView.as_view(), name="addresses"),
    path("account/addresses/<uuid:pk>", views.AddressDetailView.as_view(), name="address-detail"),
    path("account/wishlist", views.WishlistView.as_view(), name="wishlist"),
    path("account/wishlist/<uuid:product_id>", views.WishlistDetailView.as_view(), name="wishlist-detail"),
    path("account/orders", views.AccountOrdersView.as_view(), name="account-orders"),
    path("account/orders/<uuid:pk>", views.AccountOrderDetailView.as_view(), name="account-order-detail"),
    path("account/returns", views.AccountReturnsView.as_view(), name="account-returns"),
    path("products", views.ProductListView.as_view(), name="products"),
    path("products/<slug:slug>", views.ProductDetailView.as_view(), name="product-detail"),
    path("products/<slug:slug>/reviews", views.ProductReviewListView.as_view(), name="product-reviews"),
    path("brands", views.BrandListView.as_view(), name="brands"),
    path("categories", views.CategoryListView.as_view(), name="categories"),
    path("size-chart", views.SizeChartView.as_view(), name="size-chart"),
    path("stock-notifications", views.StockNotificationView.as_view(), name="stock-notifications"),
    path("cart", views.CartView.as_view(), name="cart"),
    path("cart/items", views.CartItemsView.as_view(), name="cart-items"),
    path("cart/items/<uuid:item_id>", views.CartItemDetailView.as_view(), name="cart-item-detail"),
    path("cart/promo", views.CartPromoView.as_view(), name="cart-promo"),
    path("shipping-methods", views.ShippingMethodListView.as_view(), name="shipping-methods"),
    path("checkout/quote", views.CheckoutQuoteView.as_view(), name="checkout-quote"),
    path("checkout/create", views.CheckoutCreateView.as_view(), name="checkout-create"),
    path("payments/checkout", views.OnlineCheckoutView.as_view(), name="online-checkout"),
    path("payments/paymongo/cancel", views.PayMongoCancelView.as_view(), name="paymongo-cancel"),
    path("payments/xendit/checkout", views.XenditCheckoutView.as_view(), name="xendit-checkout"),
    path("webhooks/xendit", views.XenditWebhookView.as_view(), name="xendit-webhook"),
    path("webhooks/paymongo", views.PayMongoWebhookView.as_view(), name="paymongo-webhook"),
    path("content/homepage", views.HomepageSectionsView.as_view(), name="homepage-sections"),
    path("content/pages/<slug:slug>", views.ContentPageView.as_view(), name="content-page"),
    path("content/faqs", views.FAQListView.as_view(), name="faqs"),
    path("newsletter", views.NewsletterView.as_view(), name="newsletter"),
    path("contact", views.ContactView.as_view(), name="contact"),
    path("staff/dashboard", views.AdminDashboardView.as_view(), name="staff-dashboard"),
    path("staff/customers", views.AdminCustomerListView.as_view(), name="staff-customers"),
    path("staff/reports/sales", views.SalesReportView.as_view(), name="staff-sales-report"),
    path("", include(router.urls)),
]

