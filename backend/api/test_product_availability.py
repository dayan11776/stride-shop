from django.contrib.auth import get_user_model
from django.test import TestCase

from catalog.models import Brand, Category, Inventory, Product, ProductVariant, WishlistItem


class ProductAvailabilityTests(TestCase):
    def setUp(self):
        brand = Brand.objects.create(name="Test brand", slug="test-brand")
        category = Category.objects.create(name="Sneakers", slug="sneakers")
        self.product = Product.objects.create(
            brand=brand, category=category, name="Test shoe", slug="test-shoe",
            audience="men", status=Product.Status.ACTIVE,
        )
        self.first = ProductVariant.objects.create(
            product=self.product, sku="TEST-40", color_name="Olive", size_eu=40, price=100,
        )
        Inventory.objects.create(variant=self.first, quantity_on_hand=12, quantity_reserved=2)
        second = ProductVariant.objects.create(
            product=self.product, sku="TEST-41", color_name="Olive", size_eu=41, price=100,
        )
        Inventory.objects.create(variant=second, quantity_on_hand=3, quantity_reserved=1)
        inactive = ProductVariant.objects.create(
            product=self.product, sku="TEST-42", color_name="Olive", size_eu=42, price=100, is_active=False,
        )
        Inventory.objects.create(variant=inactive, quantity_on_hand=50)
        ProductVariant.objects.create(
            product=self.product, sku="TEST-43", color_name="Olive", size_eu=43, price=100,
        )  # Missing inventory counts as zero.

    def test_catalog_and_details_show_available_across_active_sizes(self):
        response = self.client.get("/api/products?audience=men")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["availableQuantity"], 12)
        self.assertFalse(response.json()[0]["isExampleStock"])
        self.assertFalse(response.json()[0]["isExamplePrice"])

        detail = self.client.get("/api/products/test-shoe")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["availableQuantity"], 12)

    def test_counts_reflect_new_reservations_and_wishlist(self):
        self.first.inventory.quantity_reserved = 5
        self.first.inventory.save(update_fields=["quantity_reserved"])
        user = get_user_model().objects.create_user(email="stock@example.test", password="test-password")
        WishlistItem.objects.create(user=user, product=self.product)
        self.client.force_login(user)

        response = self.client.get("/api/account/wishlist")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["product"]["availableQuantity"], 9)

    def test_missing_inventory_and_inactive_variants_count_as_zero(self):
        ProductVariant.objects.filter(product=self.product).update(is_active=False)
        ProductVariant.objects.create(
            product=self.product, sku="TEST-44", color_name="Olive", size_eu=44, price=100,
        )
        response = self.client.get("/api/products?audience=men")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["availableQuantity"], 0)

    def test_example_stock_marker_is_visible_to_customers_and_staff_can_change_it(self):
        self.product.is_example_stock = True
        self.product.save(update_fields=["is_example_stock"])
        self.assertTrue(self.client.get("/api/products/test-shoe").json()["isExampleStock"])
        user = get_user_model().objects.create_user(email="staff@example.test", password="test-password", role="admin")
        self.client.force_login(user)
        response = self.client.patch(
            f"/api/staff/products/{self.product.id}",
            data='{"is_example_stock": false}', content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.json()["is_example_stock"])
        self.assertFalse(self.client.get("/api/products/test-shoe").json()["isExampleStock"])

    def test_example_price_marker_is_visible_and_staff_can_change_it(self):
        self.product.is_example_price = True
        self.product.save(update_fields=["is_example_price"])
        self.assertTrue(self.client.get("/api/products").json()[0]["isExamplePrice"])
        self.assertTrue(self.client.get("/api/products/test-shoe").json()["isExamplePrice"])
        user = get_user_model().objects.create_user(email="pricing@example.test", password="test-password", role="admin")
        self.client.force_login(user)
        response = self.client.patch(f"/api/staff/products/{self.product.id}", data='{"is_example_price": false}', content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.json()["is_example_price"])
        self.assertFalse(self.client.get("/api/products/test-shoe").json()["isExamplePrice"])
