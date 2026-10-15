"""High-value API flow tests for the STRIDE storefront."""
from __future__ import annotations

import json
from io import StringIO

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
