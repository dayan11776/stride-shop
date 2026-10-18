"""Regression tests for the storefront's published delivery policy."""
from decimal import Decimal
from io import StringIO
import json

from django.core.management import call_command
from django.test import TestCase

from catalog.models import Product
from commerce.models import Order, Payment, PromoCode, ShippingMethod


class ShippingPolicyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_data", stdout=StringIO(), verbosity=0)
        cls.variant = Product.objects.get(slug="school-lace").variants.first()
        cls.variant.sale_price = None
        cls.variant.save(update_fields=["sale_price"])
        cls.standard = ShippingMethod.objects.get(name="Standard delivery")
        cls.express = ShippingMethod.objects.get(name="Express delivery")

    def setUp(self):
        response = self.post("/api/cart/items", {"variantId": str(self.variant.id), "quantity": 1})
        self.assertEqual(response.status_code, 201, response.content)

    def post(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def quote(self, method):
        response = self.post("/api/checkout/quote", {"shippingMethod": str(method.id)})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def set_price(self, amount):
        self.variant.price = Decimal(amount)
        self.variant.save(update_fields=["price"])

    def test_standard_delivery_threshold_is_strictly_above_3500(self):
        for price, expected_fee in (("3499.99", 150), ("3500.00", 150), ("3500.01", 0)):
            with self.subTest(price=price):
                self.set_price(price)
                quote = self.quote(self.standard)
                self.assertEqual(quote["shippingFee"], expected_fee)
                self.assertEqual(Decimal(str(quote["grandTotal"])), Decimal(price) + expected_fee)

    def test_express_delivery_still_has_its_normal_fee_above_threshold(self):
        self.set_price("5000.00")
        quote = self.quote(self.express)
        self.assertEqual(quote["shippingFee"], 295)
        self.assertEqual(quote["grandTotal"], 5295)

    def test_threshold_uses_merchandise_subtotal_before_promo_discount(self):
        self.set_price("3600.00")
        PromoCode.objects.create(code="SAVE500", discount_type=PromoCode.DiscountType.FIXED, value=Decimal("500.00"))
        response = self.post("/api/cart/promo", {"promoCode": "SAVE500"})
        self.assertEqual(response.status_code, 200, response.content)
        quote = self.quote(self.standard)
        self.assertEqual(quote["subtotal"], 3600)
        self.assertEqual(quote["discountTotal"], 500)
        self.assertEqual(quote["shippingFee"], 0)
        self.assertEqual(quote["grandTotal"], 3100)

    def test_free_shipping_promo_can_waive_express_below_threshold(self):
        self.set_price("1000.00")
        PromoCode.objects.create(code="SHIPFREE", discount_type=PromoCode.DiscountType.FREE_SHIPPING)
        response = self.post("/api/cart/promo", {"promoCode": "SHIPFREE"})
        self.assertEqual(response.status_code, 200, response.content)
        quote = self.quote(self.express)
        self.assertEqual(quote["shippingFee"], 0)
        self.assertEqual(quote["grandTotal"], 1000)

    def test_order_and_payment_match_the_free_standard_delivery_quote(self):
        self.set_price("3600.00")
        quote = self.quote(self.standard)
        response = self.post("/api/checkout/create", {
            "fullName": "Test Buyer", "email": "buyer@example.test", "phone": "09171234567",
            "line1": "1 Test Road", "city": "Manila", "postalCode": "1000", "country": "PH",
            "shippingMethod": str(self.standard.id), "paymentMethod": "cod",
            "expectedTotal": str(quote["grandTotal"]),
        })
        self.assertEqual(response.status_code, 201, response.content)
        order = Order.objects.get(pk=response.json()["order"]["id"])
        payment = Payment.objects.get(order=order)
        self.assertEqual(order.shipping_fee, Decimal("0.00"))
        self.assertEqual(order.grand_total, Decimal("3600.00"))
        self.assertEqual(payment.amount, order.grand_total)
