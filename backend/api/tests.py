"""High-value API flow tests for the STRIDE storefront."""
from __future__ import annotations

import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings

from catalog.models import Inventory, Product
from commerce.models import Order, Payment


class CheckoutFlowTests(TestCase):
    def setUp(self):
        call_command("seed_data", stdout=StringIO(), verbosity=0)
        login = self.post(
            "/api/auth/login",
            {"email": "customer@stride.local", "password": "StrideDemo123!"},
        )
        self.assertEqual(login.status_code, 200)
        self.variant = Product.objects.prefetch_related("variants").first().variants.first()
        self.shipping = self.client.get("/api/shipping-methods").json()[0]
        self.checkout = {
            "fullName": "Stride QA",
            "email": "customer@stride.local",
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
