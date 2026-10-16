"""High-value API flow tests for the STRIDE storefront."""
from __future__ import annotations

import json
import hashlib
import hmac
import time
from io import BytesIO, StringIO
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings

from catalog.models import Inventory, Product
from commerce.models import Order, Payment


class CheckoutFlowTests(TestCase):
    def setUp(self):
        call_command("seed_data", stdout=StringIO(), verbosity=0)
        self.customer = get_user_model().objects.create_user(
            email="customer@example.test",
            password="StrideTest123!",
            full_name="Stride QA",
        )
        login = self.post(
            "/api/auth/login",
            {"email": self.customer.email, "password": "StrideTest123!"},
        )
        self.assertEqual(login.status_code, 200)
        self.variant = Product.objects.prefetch_related("variants").first().variants.first()
        self.shipping = self.client.get("/api/shipping-methods").json()[0]
        self.checkout = {
            "fullName": "Stride QA",
            "email": self.customer.email,
            "phone": "09171234567",
            "line1": "1 Test Lane",
            "city": "Quezon City",
            "province": "Metro Manila",
            "postalCode": "1100",
            "country": "PH",
            "shippingMethod": self.shipping["id"],
        }

    def post(self, path, payload, **extra):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json", **extra)

    def add_line(self, quantity=1):
        response = self.post("/api/cart/items", {"variantId": str(self.variant.id), "quantity": quantity})
        self.assertIn(response.status_code, {200, 201}, response.content)

    def test_catalog_cart_and_cash_on_delivery_checkout(self):
        catalog = self.client.get("/api/products")
        self.assertEqual(catalog.status_code, 200)
        self.assertGreaterEqual(len(catalog.json()), 1)

        self.add_line(quantity=2)
        cart = self.client.get("/api/cart").json()
        self.assertEqual(cart["items"][0]["quantity"], 2)

        created = self.post("/api/checkout/create", {**self.checkout, "paymentMethod": "cod"})
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(created.json()["nextAction"], "order_received")
        self.assertEqual(created.json()["payment"]["method"], "cod")

    def test_unconfigured_xendit_does_not_create_an_order(self):
        self.add_line()
        before = Order.objects.count()

        response = self.post("/api/checkout/create", {**self.checkout, "paymentMethod": "ewallet"})

        self.assertEqual(response.status_code, 503, response.content)
        self.assertEqual(Order.objects.count(), before)

    @override_settings(XENDIT_SECRET_KEY="unit-test-key", XENDIT_WEBHOOK_TOKEN="unit-test-callback")
    def test_failed_xendit_callback_releases_stock(self):
        self.add_line()
        created = self.post("/api/checkout/create", {**self.checkout, "paymentMethod": "ewallet"})
        self.assertEqual(created.status_code, 201, created.content)
        payload = created.json()
        order = Order.objects.get(pk=payload["order"]["id"])
        payment = Payment.objects.get(pk=payload["payment"]["id"])
        inventory = Inventory.objects.get(variant=self.variant)
        self.assertEqual(inventory.quantity_reserved, 1)

        callback = self.post(
            "/api/webhooks/xendit",
            {"external_id": order.order_number, "status": "EXPIRED"},
            HTTP_X_CALLBACK_TOKEN="unit-test-callback",
        )
        self.assertEqual(callback.status_code, 200, callback.content)

        order.refresh_from_db()
        payment.refresh_from_db()
        inventory.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.assertEqual(payment.status, Payment.Status.FAILED)
        self.assertEqual(inventory.quantity_reserved, 0)

    @override_settings(
        PAYMENT_PROVIDER="paymongo",
        PAYMONGO_SECRET_KEY="sk_test_unit",
        PAYMONGO_WEBHOOK_SECRET="unit-paymongo-webhook-secret",
        PAYMONGO_SUCCESS_REDIRECT_URL="https://store.example.test/order-confirmation/{order_number}",
        PAYMONGO_CANCEL_REDIRECT_URL="https://store.example.test/checkout?paymentCancelled={payment_id}",
        PAYMONGO_PAYMENT_METHOD_TYPES=["card", "gcash", "qrph"],
    )
    @patch("commerce.paymongo.urlopen")
    def test_paymongo_session_and_signed_paid_callback_capture_payment(self, mock_urlopen):
        self.add_line()
        created = self.post("/api/checkout/create", {**self.checkout, "paymentMethod": "ewallet"})
        self.assertEqual(created.status_code, 201, created.content)
        payload = created.json()
        self.assertEqual(payload["payment"]["provider"], Payment.Provider.PAYMONGO)
        order = Order.objects.get(pk=payload["order"]["id"])
        payment = Payment.objects.get(pk=payload["payment"]["id"])

        provider_response = {
            "data": {
                "id": "cs_unit_test",
                "type": "checkout_session",
                "attributes": {"checkout_url": "https://checkout.paymongo.test/cs_unit_test"},
            }
        }
        http_response = MagicMock()
        http_response.read.return_value = json.dumps(provider_response).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = http_response

        checkout = self.post(
            "/api/payments/checkout",
            {"paymentId": str(payment.id), "orderId": str(order.id), "email": self.customer.email},
        )
        self.assertEqual(checkout.status_code, 200, checkout.content)
        self.assertEqual(checkout.json()["provider"], Payment.Provider.PAYMONGO)
        self.assertEqual(checkout.json()["checkoutUrl"], "https://checkout.paymongo.test/cs_unit_test")
        request = mock_urlopen.call_args.args[0]
        request_payload = json.loads(request.data.decode("utf-8"))
        attributes = request_payload["data"]["attributes"]
        self.assertEqual(request.full_url, "https://api.paymongo.com/v2/checkout_sessions")
        self.assertEqual(attributes["reference_number"], order.order_number)
        self.assertEqual(attributes["line_items"][0]["amount"], int(payment.amount * 100))
        self.assertEqual(attributes["payment_method_types"], ["card", "gcash", "qrph"])
        self.assertEqual(attributes["cancel_url"], f"https://store.example.test/checkout?paymentCancelled={payment.id}")

        payment.refresh_from_db()
        self.assertEqual(payment.provider_ref, "cs_unit_test")
        event = {
            "event_type": "send.webhook",
            "data": {
                "type": "checkout_session.payment.paid",
                "livemode": False,
                "data": {
                    "id": "cs_unit_test",
                    "type": "checkout_session",
                    "attributes": {"reference_number": order.order_number, "payments": [{"id": "pay_unit_test", "attributes": {"status": "paid"}}]},
                },
            },
        }
        raw_event = json.dumps(event, separators=(",", ":")).encode("utf-8")
        timestamp = str(int(time.time()))
        signature = hmac.new(
            b"unit-paymongo-webhook-secret",
            f"{timestamp}.".encode("utf-8") + raw_event,
            hashlib.sha256,
        ).hexdigest()
        callback = self.client.post(
            "/api/webhooks/paymongo",
            data=raw_event,
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=f"t={timestamp},te={signature},li=",
        )
        self.assertEqual(callback.status_code, 200, callback.content)

        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.CAPTURED)
        self.assertEqual(order.status, Order.Status.PAID)

    @override_settings(PAYMONGO_SECRET_KEY="sk_test_unit", PAYMONGO_WEBHOOK_SECRET="unit-paymongo-webhook-secret")
    def test_paymongo_webhook_rejects_an_invalid_signature(self):
        response = self.client.post(
            "/api/webhooks/paymongo",
            data=b'{"data":{}}',
            content_type="application/json",
            HTTP_PAYMONGO_SIGNATURE=f"t={int(time.time())},te=not-valid,li=",
        )
        self.assertEqual(response.status_code, 403, response.content)

    @override_settings(
        PAYMENT_PROVIDER="paymongo",
        PAYMONGO_SECRET_KEY="sk_test_unit",
        PAYMONGO_WEBHOOK_SECRET="unit-paymongo-webhook-secret",
        PAYMONGO_SUCCESS_REDIRECT_URL="https://store.example.test/order-confirmation/{order_number}",
        PAYMONGO_CANCEL_REDIRECT_URL="https://store.example.test/checkout?paymentCancelled={payment_id}",
        PAYMONGO_PAYMENT_METHOD_TYPES=["card", "gcash", "qrph"],
    )
    @patch("commerce.paymongo.urlopen")
    def test_paymongo_provider_details_are_not_returned_to_shopper(self, mock_urlopen):
        self.add_line()
        created = self.post("/api/checkout/create", {**self.checkout, "paymentMethod": "ewallet"})
        payment = Payment.objects.get(pk=created.json()["payment"]["id"])
        mock_urlopen.side_effect = HTTPError(
            "https://api.paymongo.com",
            422,
            "Unprocessable Content",
            None,
            BytesIO(b'{"error":"provider-internal-detail"}'),
        )

        response = self.post(
            "/api/payments/checkout",
            {"paymentId": str(payment.id), "email": self.customer.email},
        )
        self.assertEqual(response.status_code, 503, response.content)
        self.assertNotIn("provider-internal-detail", response.content.decode("utf-8"))

    @override_settings(
        PAYMENT_PROVIDER="paymongo",
        PAYMONGO_SECRET_KEY="sk_test_unit",
        PAYMONGO_WEBHOOK_SECRET="unit-paymongo-webhook-secret",
        PAYMONGO_SUCCESS_REDIRECT_URL="https://store.example.test/order-confirmation/{order_number}",
        PAYMONGO_CANCEL_REDIRECT_URL="https://store.example.test/checkout?paymentCancelled={payment_id}",
        PAYMONGO_PAYMENT_METHOD_TYPES=["card", "gcash", "qrph"],
    )
    @patch("commerce.paymongo.urlopen")
    def test_explicit_paymongo_cancellation_expires_session_and_releases_stock(self, mock_urlopen):
        self.add_line()
        created = self.post("/api/checkout/create", {**self.checkout, "paymentMethod": "ewallet"})
        self.assertEqual(created.status_code, 201, created.content)
        order = Order.objects.get(pk=created.json()["order"]["id"])
        payment = Payment.objects.get(pk=created.json()["payment"]["id"])
        payment.provider_ref = "cs_cancel_unit_test"
        payment.save(update_fields=["provider_ref"])

        provider_response = {"data": {"id": payment.provider_ref, "attributes": {"status": "expired"}}}
        http_response = MagicMock()
        http_response.read.return_value = json.dumps(provider_response).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = http_response

        cancelled = self.post(
            "/api/payments/paymongo/cancel",
            {"paymentId": str(payment.id), "email": self.customer.email},
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.content)
        self.assertTrue(cancelled.json()["cancelled"])
        request = mock_urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.paymongo.com/v1/checkout_sessions/cs_cancel_unit_test/expire")
        self.assertEqual(request.get_method(), "POST")

        payment.refresh_from_db()
        order.refresh_from_db()
        inventory = Inventory.objects.get(variant=self.variant)
        self.assertEqual(payment.status, Payment.Status.FAILED)
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.assertEqual(inventory.quantity_reserved, 0)

    @override_settings(
        PAYMENT_PROVIDER="paymongo",
        PAYMONGO_SECRET_KEY="sk_test_unit",
        PAYMONGO_WEBHOOK_SECRET="unit-paymongo-webhook-secret",
        PAYMONGO_SUCCESS_REDIRECT_URL="https://store.example.test/order-confirmation/{order_number}",
        PAYMONGO_CANCEL_REDIRECT_URL="https://store.example.test/checkout?paymentCancelled={payment_id}",
        PAYMONGO_PAYMENT_METHOD_TYPES=["card", "gcash", "qrph"],
    )
    @patch("commerce.paymongo.urlopen")
    def test_paymongo_processing_payment_is_not_cancelled_or_released(self, mock_urlopen):
        self.add_line()
        created = self.post("/api/checkout/create", {**self.checkout, "paymentMethod": "ewallet"})
        self.assertEqual(created.status_code, 201, created.content)
        order = Order.objects.get(pk=created.json()["order"]["id"])
        payment = Payment.objects.get(pk=created.json()["payment"]["id"])
        payment.provider_ref = "cs_processing_unit_test"
        payment.save(update_fields=["provider_ref"])

        active_response = {
            "data": {
                "id": payment.provider_ref,
                "attributes": {"status": "active", "payments": [{"attributes": {"status": "processing"}}]},
            }
        }
        http_response = MagicMock()
        http_response.read.return_value = json.dumps(active_response).encode("utf-8")
        mock_urlopen.side_effect = [
            HTTPError("https://api.paymongo.com", 400, "Bad Request", None, BytesIO(b"{}")),
            MagicMock(__enter__=MagicMock(return_value=http_response)),
        ]

        cancelled = self.post(
            "/api/payments/paymongo/cancel",
            {"paymentId": str(payment.id), "email": self.customer.email},
        )
        self.assertEqual(cancelled.status_code, 409, cancelled.content)

        payment.refresh_from_db()
        order.refresh_from_db()
        inventory = Inventory.objects.get(variant=self.variant)
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(order.status, Order.Status.PENDING)
        self.assertEqual(inventory.quantity_reserved, 1)

    @override_settings(
        PAYMENT_PROVIDER="paymongo",
        PAYMONGO_SECRET_KEY="sk_test_unit",
        PAYMONGO_WEBHOOK_SECRET="unit-paymongo-webhook-secret",
        PAYMONGO_SUCCESS_REDIRECT_URL="https://store.example.test/order-confirmation/{order_number}",
        PAYMONGO_CANCEL_REDIRECT_URL="https://store.example.test/checkout?paymentCancelled={payment_id}",
        PAYMONGO_PAYMENT_METHOD_TYPES=["card", "gcash", "qrph"],
    )
    def test_legacy_xendit_checkout_route_refuses_a_paymongo_payment(self):
        self.add_line()
        created = self.post("/api/checkout/create", {**self.checkout, "paymentMethod": "ewallet"})
        self.assertEqual(created.status_code, 201, created.content)
        payment = Payment.objects.get(pk=created.json()["payment"]["id"])
        self.assertEqual(payment.provider, Payment.Provider.PAYMONGO)

        response = self.post(
            "/api/payments/xendit/checkout",
            {"paymentId": str(payment.id), "email": self.customer.email},
        )
        self.assertEqual(response.status_code, 400, response.content)
        payment.refresh_from_db()
        self.assertEqual(payment.provider, Payment.Provider.PAYMONGO)
        self.assertEqual(payment.provider_ref, "")

    @override_settings(PAYMENT_PROVIDER="paymongo")
    def test_legacy_xendit_reference_is_not_routed_to_paymongo(self):
        self.add_line()
        created = self.post("/api/checkout/create", {**self.checkout, "paymentMethod": "cod"})
        payment = Payment.objects.get(pk=created.json()["payment"]["id"])
        payment.method = Payment.Method.EWALLET
        payment.provider = ""
        payment.provider_ref = "inv_legacy_xendit"
        payment.save(update_fields=["method", "provider", "provider_ref"])

        from commerce.payments import provider_for_payment

        self.assertEqual(provider_for_payment(payment), Payment.Provider.XENDIT)


class SeedDataSecurityTests(TestCase):
    def test_seed_data_never_creates_public_demo_accounts(self):
        call_command("seed_data", stdout=StringIO(), verbosity=0)
        user_model = get_user_model()
        self.assertFalse(user_model.objects.filter(email="admin@stride.local").exists())
        self.assertFalse(user_model.objects.filter(email="customer@stride.local").exists())

    def test_legacy_demo_accounts_are_disabled(self):
        user_model = get_user_model()
        demo_admin = user_model.objects.create_superuser(
            email="admin@stride.local",
            password="known-demo-password",
            full_name="Legacy Demo Admin",
        )
        call_command("disable_demo_accounts", stdout=StringIO(), verbosity=0)
        demo_admin.refresh_from_db()
        self.assertFalse(demo_admin.is_active)
        self.assertFalse(demo_admin.is_staff)
        self.assertFalse(demo_admin.is_superuser)
        self.assertFalse(demo_admin.has_usable_password())
        self.assertFalse(demo_admin.is_team_member)


class FixedBugTests(TestCase):
    """Regression tests for the bugs found in the 2026-10-14 retest."""

    def setUp(self):
        call_command("seed_data", stdout=StringIO(), verbosity=0)
        self.product = Product.objects.get(slug="school-lace")
        self.variant = self.product.variants.first()
        self.shipping = self.client.get("/api/shipping-methods").json()[0]

    def post(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def checkout_body(self, email="qa@example.test"):
        return {
            "fullName": "QA",
            "email": email,
            "phone": "09171234567",
            "line1": "1 Lane",
            "city": "Bacoor",
            "province": "Cavite",
            "postalCode": "4102",
            "shippingMethod": self.shipping["id"],
            "paymentMethod": "cod",
        }

    def test_list_price_is_not_the_sale_price(self):
        data = self.client.get("/api/products/school-lace").json()
        self.assertGreater(data["price"], data["salePrice"])

    def test_unknown_variant_stock_alert_is_a_400_not_a_500(self):
        response = self.post(
            "/api/stock-notifications",
            {"email": "a@b.com", "variantId": "00000000-0000-0000-0000-000000000000"},
        )
        self.assertEqual(response.status_code, 400)

    def test_visitor_me_is_not_an_error(self):
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["user"])

    def test_cart_quantity_is_capped_at_stock(self):
        Inventory.objects.filter(variant=self.variant).update(quantity_on_hand=3, quantity_reserved=0)
        self.assertEqual(self.post("/api/cart/items", {"variantId": str(self.variant.id), "quantity": 3}).status_code, 201)
        self.assertEqual(self.post("/api/cart/items", {"variantId": str(self.variant.id), "quantity": 1}).status_code, 400)
        item = self.client.get("/api/cart").json()["items"][0]
        patch = self.client.patch(
            f"/api/cart/items/{item['id']}",
            data=json.dumps({"quantity": 9999}),
            content_type="application/json",
        )
        self.assertEqual(patch.status_code, 400)

    def test_order_status_cannot_jump_or_leave_a_final_state(self):
        self.post("/api/cart/items", {"variantId": str(self.variant.id), "quantity": 1})
        order = Order.objects.get(order_number=self.post("/api/checkout/create", self.checkout_body()).json()["order"]["orderNumber"])
        from commerce.services import set_order_status
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            set_order_status(order, "shipped")  # pending cannot ship
        set_order_status(order, "cancelled")
        with self.assertRaises(ValidationError):
            set_order_status(order, "paid")  # cancelled is final

