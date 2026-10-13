from __future__ import annotations

import hmac
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Address
from catalog.models import Brand, Category, Inventory, Product, ProductVariant, Review, SizeChartEntry, StockNotification, WishlistItem
from commerce.models import CartItem, Order, OrderItem, Payment, PromoCode, ReturnItem, ReturnRequest, ShippingMethod
from commerce.services import apply_promo, calculate_cart_totals, capture_payment, create_order_from_cart, get_cart_for_request, release_order_reservations, set_order_status
from commerce.xendit import XenditError, create_invoice, is_configured
from content.models import AuditLog, ContactMessage, ContentPage, FAQ, HomepageSection, NewsletterSubscriber

from .permissions import IsOrderOwnerOrStaff, IsTeamMember
from .serializers import (
    AddressSerializer,
    AdminOrderSerializer,
    AdminProductSerializer,
    AdminProductVariantSerializer,
    BrandSerializer,
    CartItemInputSerializer,
    CartItemUpdateSerializer,
    CartSerializer,
    CategorySerializer,
    CheckoutInputSerializer,
    ContactMessageSerializer,
    ContentPageSerializer,
    FAQSerializer,
    HomepageSectionSerializer,
    LoginSerializer,
    NewsletterSerializer,
    OrderSerializer,
    ProductCardSerializer,
    ProductDetailSerializer,
    PromoCodeSerializer,
    PromoInputSerializer,
    RegistrationSerializer,
    ReturnRequestCreateSerializer,
    ReturnRequestSerializer,
    ReviewCreateSerializer,
    ReviewSerializer,
    ShippingMethodSerializer,
    SizeChartEntrySerializer,
    StockNotificationSerializer,
    UserSerializer,
    WishlistItemSerializer,
)


def is_true(value) -> bool:
    return str(value).lower() in {"1", "true", "yes", "on"}


def resolve_shipping_method(value: str) -> ShippingMethod:
    value = str(value).strip()
    try:
        return ShippingMethod.objects.get(pk=value, is_active=True)
    except (ShippingMethod.DoesNotExist, DjangoValidationError, ValueError):
        pass
    try:
        return ShippingMethod.objects.get(name__iexact=value, is_active=True)
    except ShippingMethod.DoesNotExist as exc:
        raise ValidationError({"shippingMethod": "That shipping method is unavailable."}) from exc


def serialize_cart(cart, *, shipping_method=None):
    cart = (
        type(cart)
        .objects.select_related("promo_code")
        .prefetch_related("items__variant__product__images", "items__variant__product", "items__variant__inventory")
        .get(pk=cart.pk)
    )
    return CartSerializer(cart, context={"shipping_method": shipping_method}).data


def cart_response(cart, token, *, shipping_method=None, response_status=status.HTTP_200_OK):
    response = Response(serialize_cart(cart, shipping_method=shipping_method), status=response_status)
    if token:
        response.set_cookie(
            "stride_cart",
            token,
            max_age=60 * 60 * 24 * 30,
            httponly=True,
            secure=not settings.DEBUG,
            samesite="Lax",
        )
    return response


def audit(request, action: str, entity: str, entity_id=None, changes=None):
    if request.user and request.user.is_authenticated:
        AuditLog.objects.create(
            staff_user=request.user,
            action=action,
            entity=entity,
            entity_id=str(entity_id or ""),
            changes=changes or {},
        )


class CsrfView(APIView):
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({"detail": "CSRF cookie set."})


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user)
        get_cart_for_request(request)  # attaches/merges a guest cart after session login
        return Response({"user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(request, email=serializer.validated_data["email"].lower(), password=serializer.validated_data["password"])
        if user is None:
            raise ValidationError({"email": "Invalid email or password."})
        if not user.is_active:
            raise PermissionDenied("This account is inactive.")
        login(request, user)
        get_cart_for_request(request)
        return Response({"user": UserSerializer(user).data})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"user": UserSerializer(request.user).data})


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AddressListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(AddressSerializer(request.user.addresses.all(), many=True).data)

    @transaction.atomic
    def post(self, request):
        serializer = AddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("is_default"):
            request.user.addresses.update(is_default=False)
        address = serializer.save(user=request.user)
        return Response(AddressSerializer(address).data, status=status.HTTP_201_CREATED)


class AddressDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_object_or_404(Address, pk=pk, user=request.user)

    def patch(self, request, pk):
        address = self.get_object(request, pk)
        serializer = AddressSerializer(address, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            if serializer.validated_data.get("is_default"):
                request.user.addresses.exclude(pk=address.pk).update(is_default=False)
            serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        self.get_object(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductListView(APIView):
    permission_classes = [AllowAny]

    def get_queryset(self):
        query = self.request.query_params
        products = Product.objects.filter(status=Product.Status.ACTIVE).select_related("brand", "category").prefetch_related("variants__inventory", "images")
        audience = query.get("audience")
        if audience:
            products = products.filter(audience=audience)
        brand = query.get("brand")
        if brand:
            products = products.filter(Q(brand__slug=brand) | Q(brand__name__iexact=brand))
        category = query.get("category")
        if category:
            products = products.filter(Q(category__slug=category) | Q(category__name__iexact=category))
        if is_true(query.get("sale")):
            products = products.filter(variants__sale_price__isnull=False, variants__is_active=True)
        if is_true(query.get("isNew") or query.get("is_new")):
            products = products.filter(is_new_arrival=True)
        if phrase := query.get("q"):
            products = products.filter(Q(name__icontains=phrase) | Q(brand__name__icontains=phrase) | Q(description__icontains=phrase))
        return products.distinct()

    def get(self, request):
        return Response(ProductCardSerializer(self.get_queryset(), many=True).data)


class ProductDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        product = get_object_or_404(
            Product.objects.filter(status=Product.Status.ACTIVE)
            .select_related("brand", "category")
            .prefetch_related("variants__inventory", "images"),
            slug=slug,
        )
        return Response(ProductDetailSerializer(product).data)


class BrandListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(BrandSerializer(Brand.objects.all(), many=True).data)


class CategoryListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(CategorySerializer(Category.objects.select_related("parent"), many=True).data)


class SizeChartView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        entries = SizeChartEntry.objects.all()
        if audience := request.query_params.get("audience"):
            entries = entries.filter(audience=audience)
        return Response(SizeChartEntrySerializer(entries, many=True).data)


class ProductReviewListView(APIView):
    permission_classes = [AllowAny]

    def get_product(self, slug):
        return get_object_or_404(Product, slug=slug, status=Product.Status.ACTIVE)

    def get(self, request, slug):
        product = self.get_product(slug)
        reviews = product.reviews.filter(status=Review.Status.PUBLISHED).select_related("user")
        return Response(ReviewSerializer(reviews, many=True).data)

    def post(self, request, slug):
        if not request.user.is_authenticated:
            raise PermissionDenied("Sign in to leave a review.")
        product = self.get_product(slug)
        serializer = ReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review, created = Review.objects.update_or_create(
            product=product,
            user=request.user,
            defaults=serializer.validated_data,
        )
        return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class StockNotificationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = StockNotificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        notification = serializer.save(user=request.user if request.user.is_authenticated else None)
        return Response(StockNotificationSerializer(notification).data, status=status.HTTP_201_CREATED)


class WishlistView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = WishlistItem.objects.filter(user=request.user).select_related("product__brand", "product__category").prefetch_related("product__variants", "product__images")
        return Response(WishlistItemSerializer(items, many=True).data)

    def post(self, request):
        product_id = request.data.get("productId") or request.data.get("product_id")
        if not product_id:
            raise ValidationError({"productId": "A product is required."})
        product = get_object_or_404(Product, pk=product_id, status=Product.Status.ACTIVE)
        item, created = WishlistItem.objects.get_or_create(user=request.user, product=product)
        item = WishlistItem.objects.select_related("product__brand", "product__category").prefetch_related("product__variants", "product__images").get(pk=item.pk)
        return Response(WishlistItemSerializer(item).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class WishlistDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, product_id):
        WishlistItem.objects.filter(user=request.user, product_id=product_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CartView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        cart, token = get_cart_for_request(request)
        return cart_response(cart, token)

    def post(self, request):
        """Create/retrieve a cart; an optional items array is convenient for sync."""
        cart, token = get_cart_for_request(request)
        items = request.data.get("items", [])
        if not isinstance(items, list):
            raise ValidationError({"items": "Items must be a list."})
        for payload in items:
            serializer = CartItemInputSerializer(data=payload)
            serializer.is_valid(raise_exception=True)
            cart_item, created = CartItem.objects.get_or_create(
                cart=cart,
                variant=serializer.validated_data["variant"],
                defaults={"quantity": serializer.validated_data["quantity"]},
            )
            if not created:
                cart_item.quantity += serializer.validated_data["quantity"]
                cart_item.save(update_fields=["quantity"])
        return cart_response(cart, token, response_status=status.HTTP_201_CREATED)


class CartItemsView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        cart, token = get_cart_for_request(request)
        serializer = CartItemInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item, created = CartItem.objects.get_or_create(
            cart=cart,
            variant=serializer.validated_data["variant"],
            defaults={"quantity": serializer.validated_data["quantity"]},
        )
        if not created:
            item.quantity += serializer.validated_data["quantity"]
            item.save(update_fields=["quantity"])
        return cart_response(cart, token, response_status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class CartItemDetailView(APIView):
    permission_classes = [AllowAny]

    def get_object(self, cart, item_id):
        return get_object_or_404(CartItem, pk=item_id, cart=cart)

    def patch(self, request, item_id):
        cart, token = get_cart_for_request(request)
        item = self.get_object(cart, item_id)
        serializer = CartItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item.quantity = serializer.validated_data["quantity"]
        item.save(update_fields=["quantity"])
        return cart_response(cart, token)

    def delete(self, request, item_id):
        cart, token = get_cart_for_request(request)
        self.get_object(cart, item_id).delete()
        return cart_response(cart, token)


class CartPromoView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        cart, token = get_cart_for_request(request)
        serializer = PromoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        apply_promo(cart, serializer.validated_data["code"])
        return cart_response(cart, token)

    def delete(self, request):
        cart, token = get_cart_for_request(request)
        cart.promo_code = None
        cart.save(update_fields=["promo_code", "updated_at"])
        return cart_response(cart, token)


class ShippingMethodListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(ShippingMethodSerializer(ShippingMethod.objects.filter(is_active=True), many=True).data)


class CheckoutQuoteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        shipping_ref = request.data.get("shippingMethod") or request.data.get("shipping_method")
        if not shipping_ref:
            raise ValidationError({"shippingMethod": "Choose a shipping method."})
        method = resolve_shipping_method(shipping_ref)
        cart, token = get_cart_for_request(request)
        return cart_response(cart, token, shipping_method=method)


class CheckoutCreateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = CheckoutInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Do this before converting the cart into an order.  Otherwise a
        # missing payment configuration would leave an unpaid order holding
        # inventory that the customer can never pay for.
        if serializer.validated_data["payment_method"] != Payment.Method.COD and not is_configured():
            return Response(
                {
                    "message": "Online payment is not available yet. Please choose cash on delivery or try again later.",
                    "configured": False,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        shipping_method = resolve_shipping_method(serializer.validated_data.pop("shipping_method_ref"))
        cart, token = get_cart_for_request(request)
        order, payment = create_order_from_cart(
            cart=cart,
            checkout=serializer.validated_data,
            shipping_method=shipping_method,
            user=request.user,
        )
        order = Order.objects.select_related("shipping_method").prefetch_related("items", "addresses", "payments", "shipments", "status_history").get(pk=order.pk)
        response = Response(
            {
                "order": OrderSerializer(order).data,
                "payment": {"id": str(payment.id), "status": payment.status, "method": payment.method},
                "nextAction": "xendit_checkout" if payment.method != Payment.Method.COD else "order_received",
            },
            status=status.HTTP_201_CREATED,
        )
        if token:
            response.set_cookie("stride_cart", token, max_age=60 * 60 * 24 * 30, httponly=True, secure=not settings.DEBUG, samesite="Lax")
        return response


class XenditCheckoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        payment_id = request.data.get("paymentId") or request.data.get("payment_id")
        order_id = request.data.get("orderId") or request.data.get("order_id")
        payments = Payment.objects.select_related("order__user").prefetch_related("order__items")
        if payment_id:
            payment = get_object_or_404(payments, pk=payment_id)
        elif order_id:
            payment = get_object_or_404(payments.filter(order_id=order_id).exclude(method=Payment.Method.COD).order_by("-created_at"))
        else:
            raise ValidationError({"paymentId": "A payment or order ID is required."})
        order = payment.order
        if request.user.is_authenticated:
            if not request.user.is_team_member and order.user_id != request.user.id:
                raise PermissionDenied("You do not have access to this payment.")
        elif not order.user_id:
            supplied_email = str(request.data.get("email", "")).lower()
            if not supplied_email or supplied_email != order.guest_email.lower():
                raise PermissionDenied("Guest checkout requires the order email.")
        else:
            raise PermissionDenied("Sign in to continue to payment.")
        if payment.method == Payment.Method.COD:
            raise ValidationError({"payment": "Cash on delivery does not use hosted checkout."})
        if payment.status != Payment.Status.PENDING:
            raise ValidationError({"payment": "This payment is no longer pending."})
        try:
            invoice = create_invoice(payment)
        except XenditError as exc:
            return Response({"message": str(exc), "configured": is_configured()}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(
            {
                "paymentId": str(payment.id),
                "checkoutUrl": invoice.get("invoice_url") or invoice.get("checkout_url"),
                "providerRef": payment.provider_ref,
                "expiresAt": invoice.get("expiry_date"),
            }
        )


@method_decorator(csrf_exempt, name="dispatch")
class XenditWebhookView(APIView):
    """Server-to-server callback. Verify the callback token before touching orders."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        expected = settings.XENDIT_WEBHOOK_TOKEN
        received = request.headers.get("x-callback-token", "")
        if not expected or not hmac.compare_digest(str(expected), str(received)):
            raise PermissionDenied("Invalid Xendit callback token.")
        event = request.data if isinstance(request.data, dict) else {}
        external_id = str(event.get("external_id", ""))
        provider_ref = str(event.get("id") or event.get("invoice_id") or "")
        payment = None
        if provider_ref:
            payment = Payment.objects.filter(provider_ref=provider_ref).select_related("order").first()
        if payment is None and external_id:
            payment = Payment.objects.filter(order__order_number=external_id).exclude(method=Payment.Method.COD).order_by("-created_at").select_related("order").first()
        if payment is None:
            raise NotFound("No matching payment was found.")
        event_status = str(event.get("status", "")).upper()
        if event_status in {"PAID", "SETTLED", "SUCCEEDED"}:
            capture_payment(payment, provider_ref=provider_ref)
        elif event_status in {"EXPIRED", "FAILED"} and payment.status == Payment.Status.PENDING:
            payment.status = Payment.Status.FAILED
            payment.provider_ref = provider_ref or payment.provider_ref
            payment.save(update_fields=["status", "provider_ref"])
            # A failed hosted payment must not keep its reserved shoes out of
            # stock indefinitely.  The service method is idempotent and marks
            # the corresponding order as cancelled as part of releasing it.
            release_order_reservations(payment.order, note="Xendit invoice expired or failed.")
        return Response({"received": True})


class AccountOrdersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        orders = Order.objects.filter(user=request.user).select_related("shipping_method").prefetch_related("items", "addresses", "payments", "shipments", "status_history")
        return Response(OrderSerializer(orders, many=True).data)


class AccountOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        order = get_object_or_404(
            Order.objects.select_related("shipping_method").prefetch_related("items", "addresses", "payments", "shipments", "status_history"),
            pk=pk,
            user=request.user,
        )
        return Response(OrderSerializer(order).data)


class AccountReturnsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        returns = ReturnRequest.objects.filter(user=request.user).select_related("order").prefetch_related("items")
        return Response(ReturnRequestSerializer(returns, many=True).data)

    @transaction.atomic
    def post(self, request):
        serializer = ReturnRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = get_object_or_404(Order.objects.prefetch_related("items"), pk=serializer.validated_data["orderId"], user=request.user)
        if order.status not in {Order.Status.DELIVERED, Order.Status.SHIPPED}:
            raise ValidationError({"orderId": "Only shipped or delivered orders can be returned."})
        return_request = ReturnRequest.objects.create(
            order=order,
            user=request.user,
            resolution=serializer.validated_data["resolution"],
            reason=serializer.validated_data["reason"],
            comments=serializer.validated_data.get("comments", ""),
        )
        order_items = {str(item.id): item for item in order.items.all()}
        for line in serializer.validated_data["items"]:
            item_id = str(line.get("orderItemId") or line.get("order_item_id") or "")
            order_item = order_items.get(item_id)
            quantity = int(line.get("quantity", 0))
            if not order_item or quantity < 1 or quantity > order_item.quantity:
                raise ValidationError({"items": "A return line is invalid."})
            exchange_id = line.get("exchangeVariantId") or line.get("exchange_variant_id")
            ReturnItem.objects.create(return_request=return_request, order_item=order_item, quantity=quantity, exchange_variant_id=exchange_id or None)
        return_response = ReturnRequest.objects.select_related("order").prefetch_related("items").get(pk=return_request.pk)
        return Response(ReturnRequestSerializer(return_response).data, status=status.HTTP_201_CREATED)


class HomepageSectionsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        now = timezone.now()
        sections = HomepageSection.objects.filter(is_visible=True).filter(Q(starts_at__isnull=True) | Q(starts_at__lte=now)).filter(Q(ends_at__isnull=True) | Q(ends_at__gte=now))
        return Response(HomepageSectionSerializer(sections, many=True).data)


class ContentPageView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        page = get_object_or_404(ContentPage, slug=slug)
        return Response(ContentPageSerializer(page).data)


class FAQListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        faqs = FAQ.objects.filter(is_published=True)
        if topic := request.query_params.get("topic"):
            faqs = faqs.filter(topic__iexact=topic)
        return Response(FAQSerializer(faqs, many=True).data)


class NewsletterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = NewsletterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subscriber, created = NewsletterSubscriber.objects.get_or_create(
            email=serializer.validated_data["email"].lower(),
            defaults={"source": serializer.validated_data.get("source", ""), "user": request.user if request.user.is_authenticated else None},
        )
        if not created and subscriber.unsubscribed_at:
            subscriber.unsubscribed_at = None
            subscriber.save(update_fields=["unsubscribed_at"])
        return Response({"email": subscriber.email, "subscribed": True}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ContactView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ContactMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.save()
        return Response({"id": str(message.id), "message": "Thanks — we will be in touch."}, status=status.HTTP_201_CREATED)


class AdminProductViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTeamMember]
    serializer_class = AdminProductSerializer
    queryset = Product.objects.select_related("brand", "category").all()

    def perform_create(self, serializer):
        product = serializer.save()
        audit(self.request, "created", "product", product.pk, serializer.validated_data)

    def perform_update(self, serializer):
        product = serializer.save()
        audit(self.request, "updated", "product", product.pk, serializer.validated_data)

    def perform_destroy(self, instance):
        audit(self.request, "deleted", "product", instance.pk)
        instance.delete()


class AdminVariantViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTeamMember]
    serializer_class = AdminProductVariantSerializer
    queryset = ProductVariant.objects.select_related("product").all()

    def perform_create(self, serializer):
        variant = serializer.save()
        Inventory.objects.get_or_create(variant=variant)
        audit(self.request, "created", "product_variant", variant.pk)

    def perform_update(self, serializer):
        variant = serializer.save()
        audit(self.request, "updated", "product_variant", variant.pk, serializer.validated_data)


class AdminPromoCodeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTeamMember]
    serializer_class = PromoCodeSerializer
    queryset = PromoCode.objects.all()

    def perform_create(self, serializer):
        promo = serializer.save(code=serializer.validated_data["code"].upper())
        audit(self.request, "created", "promo_code", promo.pk)

    def perform_update(self, serializer):
        promo = serializer.save()
        audit(self.request, "updated", "promo_code", promo.pk, serializer.validated_data)


class AdminShippingMethodViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTeamMember]
    serializer_class = ShippingMethodSerializer
    queryset = ShippingMethod.objects.all()


class AdminContentPageViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTeamMember]
    serializer_class = ContentPageSerializer
    queryset = ContentPage.objects.all()

    def perform_create(self, serializer):
        page = serializer.save(updated_by=self.request.user)
        audit(self.request, "created", "content_page", page.pk)

    def perform_update(self, serializer):
        page = serializer.save(updated_by=self.request.user)
        audit(self.request, "updated", "content_page", page.pk)


class AdminHomepageSectionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTeamMember]
    serializer_class = HomepageSectionSerializer
    queryset = HomepageSection.objects.all()


class AdminFAQViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTeamMember]
    serializer_class = FAQSerializer
    queryset = FAQ.objects.all()


class AdminOrderViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsTeamMember]
    serializer_class = OrderSerializer
    queryset = Order.objects.select_related("shipping_method", "user").prefetch_related("items", "addresses", "payments", "shipments", "status_history")

    @action(detail=True, methods=["post"], url_path="status")
    def update_status(self, request, pk=None):
        order = self.get_object()
        new_status = request.data.get("status")
        if new_status not in Order.Status.values:
            raise ValidationError({"status": "A valid order status is required."})
        order = set_order_status(order, new_status, actor=request.user, note=str(request.data.get("note", "")))
        audit(request, "status_changed", "order", order.pk, {"status": new_status})
        order = self.get_queryset().get(pk=order.pk)
        return Response(OrderSerializer(order).data)


class AdminReturnViewSet(viewsets.ModelViewSet):
    permission_classes = [IsTeamMember]
    serializer_class = ReturnRequestSerializer
    queryset = ReturnRequest.objects.select_related("order", "user").prefetch_related("items")


class AdminDashboardView(APIView):
    permission_classes = [IsTeamMember]

    def get(self, request):
        paid = Order.objects.filter(status__in=[Order.Status.PAID, Order.Status.PACKED, Order.Status.SHIPPED, Order.Status.DELIVERED])
        totals = paid.aggregate(revenue=Sum("grand_total"), count=Count("id"))
        low_stock = Inventory.objects.filter(quantity_on_hand__lte=F("low_stock_threshold")).count()
        return Response(
            {
                "orders": Order.objects.count(),
                "pendingOrders": Order.objects.filter(status=Order.Status.PENDING).count(),
                "customers": Product._meta.apps.get_model("accounts", "User").objects.filter(role="customer").count(),
                "revenue": float(totals["revenue"] or Decimal("0")),
                "paidOrders": totals["count"],
                "lowStockVariants": low_stock,
                "openReturns": ReturnRequest.objects.filter(status__in=[ReturnRequest.Status.REQUESTED, ReturnRequest.Status.APPROVED]).count(),
            }
        )


class AdminCustomerListView(APIView):
    permission_classes = [IsTeamMember]

    def get(self, request):
        User = Product._meta.apps.get_model("accounts", "User")
        customers = User.objects.filter(role=User.Role.CUSTOMER).order_by("-created_at")
        return Response(UserSerializer(customers, many=True).data)


class SalesReportView(APIView):
    permission_classes = [IsTeamMember]

    def get(self, request):
        paid = Order.objects.filter(status__in=[Order.Status.PAID, Order.Status.PACKED, Order.Status.SHIPPED, Order.Status.DELIVERED])
        top_products = (
            OrderItem.objects.filter(order__in=paid)
            .values("product_name", "sku")
            .annotate(units=Sum("quantity"), revenue=Sum("line_total"))
            .order_by("-revenue")[:10]
        )
        totals = paid.aggregate(revenue=Sum("grand_total"), orders=Count("id"))
        return Response(
            {
                "revenue": float(totals["revenue"] or Decimal("0")),
                "orders": totals["orders"],
                "topProducts": [
                    {"productName": row["product_name"], "sku": row["sku"], "units": row["units"], "revenue": float(row["revenue"] or 0)}
                    for row in top_products
                ],
            }
        )
