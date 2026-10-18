"""Keep catalog browsing efficient and display only published ratings."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from catalog.models import Brand, Category, Product, ProductVariant, Review


class CatalogQueryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        brand = Brand.objects.create(name="Test brand", slug="test-brand")
        category = Category.objects.create(name="Test shoes", slug="test-shoes")
        cls.products = [
            Product.objects.create(brand=brand, category=category, name=f"Shoe {i}", slug=f"shoe-{i}", audience="men", status="active")
            for i in range(10)
        ]
        for index, product in enumerate(cls.products):
            ProductVariant.objects.create(product=product, sku=f"sku-{index}", color_name="Black", size_eu=40, price=Decimal("2000.00"))
        user_model = get_user_model()
        published_user = user_model.objects.create_user(email="published@example.test", password="TestPassword123!")
        pending_user = user_model.objects.create_user(email="pending@example.test", password="TestPassword123!")
        Review.objects.create(product=cls.products[0], user=published_user, rating=5, status=Review.Status.PUBLISHED)
        Review.objects.create(product=cls.products[0], user=pending_user, rating=1, status=Review.Status.PENDING)

    def test_catalog_loads_reviews_without_one_query_per_product(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get("/api/products")
        self.assertEqual(response.status_code, 200)
        rows = {item["slug"]: item for item in response.json()}
        self.assertEqual(len(rows), 10)
        self.assertEqual(rows["shoe-0"]["reviewAverage"], 5)
        self.assertIsNone(rows["shoe-1"]["reviewAverage"])
        # Product rows, variants, inventory and images: the number should
        # stay fixed as the product count grows, including products with no reviews.
        self.assertLessEqual(len(queries), 4)
