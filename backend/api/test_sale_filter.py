"""Only currently discounted product variants belong in the sale catalog."""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from catalog.models import Brand, Category, Product, ProductVariant


class SaleFilterTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        brand = Brand.objects.create(name="Example", slug="example")
        category = Category.objects.create(name="Shoes", slug="shoes")

        def product(slug):
            return Product.objects.create(brand=brand, category=category, name=slug, slug=slug, audience="men", status="active")

        def variant(shoe, suffix, **fields):
            return ProductVariant.objects.create(
                product=shoe, sku=f"{shoe.slug}-{suffix}", color_name=suffix, size_eu=40,
                price=Decimal("2000.00"), **fields,
            )

        now = timezone.now()
        variant(product("active-sale"), "black", sale_price=Decimal("1500.00"), sale_starts_at=now - timedelta(days=1), sale_ends_at=now + timedelta(days=1))
        variant(product("open-ended-sale"), "black", sale_price=Decimal("1500.00"))
        variant(product("future-sale"), "black", sale_price=Decimal("1500.00"), sale_starts_at=now + timedelta(days=1))
        expired = product("expired-sale")
        variant(expired, "black", sale_price=Decimal("1500.00"), sale_ends_at=now - timedelta(days=1))
        # Another regular variant must not accidentally make an expired sale
        # pass through separate SQL joins.
        variant(expired, "white")
        variant(product("inactive-sale"), "black", sale_price=Decimal("1500.00"), is_active=False)
        variant(product("regular"), "black")

    def test_sale_endpoint_only_returns_currently_discounted_active_variants(self):
        response = self.client.get("/api/products", {"sale": "true"})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual({item["slug"] for item in response.json()}, {"active-sale", "open-ended-sale"})
