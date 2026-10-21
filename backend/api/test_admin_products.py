import json
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from catalog.models import Brand, Category, Inventory, Product, ProductImage, ProductVariant, Review, WishlistItem
from commerce.models import InventoryMovement, Order, Payment, ShippingMethod
from commerce.services import capture_payment
from content.models import AuditLog


class AdminProductManagementTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.staff = User.objects.create_user(email="staff@example.test", password="secret", full_name="Staff", role=User.Role.ADMIN)
        self.customer = User.objects.create_user(email="customer@example.test", password="secret", full_name="Customer")
        self.brand = Brand.objects.create(name="Brand", slug="brand")
        self.category = Category.objects.create(name="Shoes", slug="shoes")
        self.product = Product.objects.create(brand=self.brand, category=self.category, name="Original", slug="original", audience="unisex", status="active")
        self.variant = ProductVariant.objects.create(product=self.product, sku="SKU-1", color_name="Black", size_eu=42, price=100)
        self.inventory = Inventory.objects.create(variant=self.variant, quantity_on_hand=12, quantity_reserved=2)
        self.image = ProductImage.objects.create(product=self.product, url="https://example.test/one.jpg", is_primary=True)

    def request_json(self, method, path, body):
        return getattr(self.client, method)(path, data=json.dumps(body), content_type="application/json")

    def login_staff(self):
        self.client.force_login(self.staff)

    def payload(self):
        return {
            "name": "New shoe", "slug": "new-shoe", "brand": str(self.brand.id), "category": str(self.category.id), "audience": "unisex", "status": "active",
            "variants": [{"sku": "NEW-42", "color_name": "Olive", "color_hex": "#8B9A6E", "size_eu": "42.0", "price": "120.00", "sale_price": "100.00", "quantity_on_hand": 8, "low_stock_threshold": 2}],
            "images": [{"url": "https://example.test/new.jpg", "is_primary": True, "position": 0}],
        }

    def test_staff_create_saves_product_variants_images_inventory_and_audit(self):
        self.login_staff()
        response = self.request_json("post", "/api/staff/products", self.payload())
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        variant = ProductVariant.objects.get(pk=data["variants"][0]["id"])
        self.assertEqual(variant.inventory.quantity_on_hand, 8)
        self.assertEqual(variant.inventory.low_stock_threshold, 2)
        self.assertEqual(len(data["images"]), 1)
        self.assertEqual(InventoryMovement.objects.get(variant=variant).change, 8)
        self.assertEqual(data["brand_name"], "Brand")

    def test_access_is_limited_to_team_members(self):
        self.assertIn(self.client.get("/api/staff/products").status_code, (401, 403))
        self.client.force_login(self.customer)
        for method, path, body in [("post", "/api/staff/products", self.payload()), ("patch", f"/api/staff/products/{self.product.id}", {"name": "Hacked"}), ("delete", f"/api/staff/products/{self.product.id}", {}), ("delete", f"/api/staff/products/{self.product.id}/permanent-delete", {})]:
            self.assertIn(self.request_json(method, path, body).status_code, (401, 403))
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, "Original")

    def test_update_preserves_ids_and_records_stock_adjustment(self):
        self.login_staff()
        body = {"variants": [{"id": str(self.variant.id), "sku": "SKU-1", "color_name": "Black", "size_eu": "42.0", "width": "regular", "price": "110.00", "quantity_on_hand": 6}], "images": [{"id": str(self.image.id), "url": "https://example.test/updated.jpg", "is_primary": True}]}
        response = self.request_json("patch", f"/api/staff/products/{self.product.id}", body)
        self.assertEqual(response.status_code, 200, response.content)
        self.variant.refresh_from_db()
        self.image.refresh_from_db()
        self.inventory.refresh_from_db()
        self.assertEqual(self.variant.price, Decimal("110.00"))
        self.assertEqual(self.inventory.quantity_on_hand, 6)
        self.assertEqual(self.inventory.quantity_reserved, 2)
        self.assertEqual(self.image.url, "https://example.test/updated.jpg")
        self.assertEqual(InventoryMovement.objects.get(variant=self.variant).change, -6)

    def test_omitted_collections_are_unchanged_and_explicit_removal_deactivates_variant(self):
        self.login_staff()
        response = self.request_json("patch", f"/api/staff/products/{self.product.id}", {"name": "Renamed"})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(ProductVariant.objects.get(pk=self.variant.pk).is_active)
        self.assertTrue(ProductImage.objects.filter(pk=self.image.pk).exists())
        response = self.request_json("patch", f"/api/staff/products/{self.product.id}", {"variants": [], "images": []})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(ProductVariant.objects.get(pk=self.variant.pk).is_active)
        self.assertTrue(ProductImage.objects.filter(pk=self.image.pk).exists())
        response = self.request_json("patch", f"/api/staff/products/{self.product.id}", {"remove_variant_ids": [str(self.variant.id)], "remove_image_ids": [str(self.image.id)]})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(ProductVariant.objects.get(pk=self.variant.pk).is_active)
        self.assertFalse(ProductImage.objects.filter(pk=self.image.pk).exists())

    def test_partial_collections_preserve_concurrently_added_variants_and_images(self):
        self.login_staff()
        other_variant = ProductVariant.objects.create(product=self.product, sku="NEW", color_name="White", size_eu=43, price=200)
        other_image = ProductImage.objects.create(product=self.product, url="https://example.test/new.jpg")
        response = self.request_json("patch", f"/api/staff/products/{self.product.id}", {"variants": [{"id": str(self.variant.id), "price": "110.00"}], "images": [{"id": str(self.image.id), "alt_text": "Updated"}]})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(ProductVariant.objects.get(pk=other_variant.id).is_active)
        self.assertTrue(ProductImage.objects.filter(pk=other_image.id).exists())

    def test_stale_expected_stock_fails_atomically(self):
        self.login_staff()
        body = {"name": "Should not save", "variants": [{"id": str(self.variant.id), "quantity_on_hand": 8, "expected_quantity_on_hand": 11}]}
        response = self.request_json("patch", f"/api/staff/products/{self.product.id}", body)
        self.assertEqual(response.status_code, 400, response.content)
        self.product.refresh_from_db()
        self.inventory.refresh_from_db()
        self.assertEqual(self.product.name, "Original")
        self.assertEqual(self.inventory.quantity_on_hand, 12)
        body["variants"][0]["expected_quantity_on_hand"] = 12
        self.assertEqual(self.request_json("patch", f"/api/staff/products/{self.product.id}", body).status_code, 200)

    def test_foreign_duplicate_and_overlapping_remove_ids_are_rejected(self):
        self.login_staff()
        other = Product.objects.create(brand=self.brand, category=self.category, name="Other", slug="other", audience="men")
        other_variant = ProductVariant.objects.create(product=other, sku="OTHER", color_name="Red", size_eu=40, price=100)
        other_image = ProductImage.objects.create(product=other, url="https://example.test/other.jpg")
        cases = [
            {"remove_variant_ids": [str(other_variant.id)]},
            {"remove_image_ids": [str(other_image.id)]},
            {"remove_variant_ids": [str(self.variant.id), str(self.variant.id)]},
            {"variants": [{"id": str(self.variant.id)}], "remove_variant_ids": [str(self.variant.id)]},
            {"images": [{"id": str(self.image.id)}], "remove_image_ids": [str(self.image.id)]},
        ]
        for body in cases:
            with self.subTest(body=body):
                self.assertEqual(self.request_json("patch", f"/api/staff/products/{self.product.id}", body).status_code, 400)

    def test_bare_existing_ids_preserve_variant_and_image(self):
        self.login_staff()
        body = {"variants": [{"id": str(self.variant.id)}], "images": [{"id": str(self.image.id)}]}
        response = self.request_json("patch", f"/api/staff/products/{self.product.id}", body)
        self.assertEqual(response.status_code, 200, response.content)
        self.variant.refresh_from_db()
        self.inventory.refresh_from_db()
        self.assertEqual(self.variant.sku, "SKU-1")
        self.assertTrue(self.variant.is_active)
        self.assertEqual(self.inventory.quantity_on_hand, 12)
        self.assertEqual(ProductImage.objects.get(pk=self.image.id).url, "https://example.test/one.jpg")

    def test_audit_failure_rolls_back_all_product_changes(self):
        self.login_staff()
        with patch("api.views.audit", side_effect=RuntimeError("audit unavailable")):
            response = self.request_json("post", "/api/staff/products", self.payload())
        self.assertEqual(response.status_code, 500)
        self.assertFalse(Product.objects.filter(slug="new-shoe").exists())
        self.assertFalse(ProductVariant.objects.filter(sku="NEW-42").exists())
        self.assertFalse(ProductImage.objects.filter(url="https://example.test/new.jpg").exists())

    def test_invalid_quantities_price_and_image_urls_are_rejected(self):
        self.login_staff()
        path = f"/api/staff/products/{self.product.id}"
        cases = [
            {"variants": [{"id": str(self.variant.id), "quantity_on_hand": -1}]},
            {"variants": [{"id": str(self.variant.id), "sale_price": "-1.00"}]},
            {"variants": [{"id": str(self.variant.id), "sale_price": "100.00"}]},
            {"images": [{"url": "ftp://example.test/image.jpg"}]},
        ]
        for body in cases:
            with self.subTest(body=body):
                response = self.request_json("patch", path, body)
                self.assertEqual(response.status_code, 400, response.content)

    def test_product_card_uses_price_and_sale_price_from_same_cheapest_variant(self):
        self.variant.price = Decimal("1000.00")
        self.variant.save(update_fields=["price"])
        other = ProductVariant.objects.create(product=self.product, sku="SALE", color_name="White", size_eu=43, price=2000, sale_price=1800)
        card = self.client.get("/api/products/original").json()
        self.assertEqual(card["price"], 1000)
        self.assertIsNone(card["salePrice"])
        other.sale_price = Decimal("800.00")
        other.save(update_fields=["sale_price"])
        card = self.client.get("/api/products/original").json()
        self.assertEqual(card["price"], 2000)
        self.assertEqual(card["salePrice"], 800)

    def test_stock_cannot_be_reduced_below_reservations_and_update_rolls_back(self):
        self.login_staff()
        body = {"name": "Must roll back", "variants": [{"id": str(self.variant.id), "quantity_on_hand": 1}]}
        response = self.request_json("patch", f"/api/staff/products/{self.product.id}", body)
        self.assertEqual(response.status_code, 400, response.content)
        self.product.refresh_from_db()
        self.inventory.refresh_from_db()
        self.assertEqual(self.product.name, "Original")
        self.assertEqual(self.inventory.quantity_on_hand, 12)

    def test_invalid_or_duplicate_sku_rejects_whole_create(self):
        self.login_staff()
        body = self.payload()
        body["variants"][0]["sku"] = self.variant.sku
        response = self.request_json("post", "/api/staff/products", body)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(Product.objects.filter(slug="new-shoe").exists())
        self.assertEqual(ProductVariant.objects.count(), 1)

    def test_foreign_or_repeated_ids_cannot_be_used_to_edit_another_product(self):
        self.login_staff()
        other = Product.objects.create(brand=self.brand, category=self.category, name="Other", slug="other", audience="men")
        other_variant = ProductVariant.objects.create(product=other, sku="OTHER", color_name="Red", size_eu=40, price=100)
        path = f"/api/staff/products/{self.product.id}"
        for variants in [[{"id": str(other_variant.id), "price": "1.00"}], [{"id": str(self.variant.id)}, {"id": str(self.variant.id)}]]:
            self.assertEqual(self.request_json("patch", path, {"variants": variants}).status_code, 400)
        other_variant.refresh_from_db()
        self.assertEqual(other_variant.price, Decimal("100.00"))

    def test_existing_cart_protects_variant_identity_but_permits_price_changes(self):
        self.inventory.quantity_reserved = 0
        self.inventory.save()
        self.client.force_login(self.customer)
        self.request_json("post", "/api/cart/items", {"variantId": str(self.variant.id), "quantity": 1})
        self.login_staff()
        path = f"/api/staff/products/{self.product.id}"
        response = self.request_json("patch", path, {"variants": [{"id": str(self.variant.id), "size_eu": "41.0"}]})
        self.assertEqual(response.status_code, 400, response.content)
        response = self.request_json("patch", f"/api/staff/variants/{self.variant.id}", {"sku": "NEW-SKU"})
        self.assertEqual(response.status_code, 400, response.content)
        response = self.request_json("patch", path, {"variants": [{"id": str(self.variant.id), "price": "105.00"}]})
        self.assertEqual(response.status_code, 200, response.content)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.size_eu, Decimal("42.0"))
        self.assertEqual(self.variant.price, Decimal("105.00"))

    def test_recycle_and_restore_preserve_records_and_hide_from_storefront(self):
        WishlistItem.objects.create(user=self.customer, product=self.product)
        review = Review.objects.create(user=self.customer, product=self.product, rating=5, status="published")
        archived = Product.objects.create(brand=self.brand, category=self.category, name="Archived", slug="archived", audience="men", status="archived")
        self.login_staff()
        response = self.client.delete(f"/api/staff/products/{self.product.id}")
        self.assertEqual(response.status_code, 204, response.content)
        self.product.refresh_from_db()
        self.assertIsNotNone(self.product.recycled_at)
        self.assertEqual(self.product.status, "draft")
        self.assertIn(str(archived.id), [p["id"] for p in self.client.get("/api/staff/products").json()])
        self.assertEqual([p["id"] for p in self.client.get("/api/staff/products?recycled=true").json()], [str(self.product.id)])
        self.assertEqual(self.client.get("/api/products/original").status_code, 404)
        self.assertEqual(self.client.get("/api/products/original/reviews").status_code, 404)
        self.client.force_login(self.customer)
        self.assertEqual(self.client.get("/api/account/wishlist").json(), [])
        self.assertEqual(self.request_json("post", "/api/stock-notifications", {"variantId": str(self.variant.id), "email": "a@example.test"}).status_code, 400)
        self.client.force_login(self.staff)
        self.assertEqual(self.request_json("patch", f"/api/staff/products/{self.product.id}", {"status": "active"}).status_code, 404)
        response = self.request_json("post", f"/api/staff/products/{self.product.id}/restore", {})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "draft")
        self.assertIsNone(response.json()["recycled_at"])
        self.assertEqual(self.client.get("/api/products/original").status_code, 404)
        self.assertTrue(WishlistItem.objects.filter(product=self.product).exists())
        self.assertTrue(Review.objects.filter(pk=review.pk).exists())
        self.assertTrue(ProductVariant.objects.filter(pk=self.variant.pk).exists())
        self.assertTrue(ProductImage.objects.filter(pk=self.image.pk).exists())
        self.assertEqual(self.request_json("patch", f"/api/staff/products/{self.product.id}", {"status": "active"}).status_code, 200)
        self.assertEqual(self.client.get("/api/products/original").status_code, 200)

    def test_permanent_delete_removes_an_unreferenced_recycled_product_and_audits_it(self):
        WishlistItem.objects.create(user=self.customer, product=self.product)
        review = Review.objects.create(user=self.customer, product=self.product, rating=5, status="published")
        product_id = self.product.id
        variant_id = self.variant.id
        image_id = self.image.id
        self.login_staff()
        self.assertEqual(self.client.delete(f"/api/staff/products/{product_id}").status_code, 204)

        response = self.client.delete(f"/api/staff/products/{product_id}/permanent-delete")

        self.assertEqual(response.status_code, 204, response.content)
        self.assertFalse(Product.objects.filter(pk=product_id).exists())
        self.assertFalse(ProductVariant.objects.filter(pk=variant_id).exists())
        self.assertFalse(ProductImage.objects.filter(pk=image_id).exists())
        self.assertFalse(Inventory.objects.filter(variant_id=variant_id).exists())
        self.assertFalse(WishlistItem.objects.filter(product_id=product_id).exists())
        self.assertFalse(Review.objects.filter(pk=review.pk).exists())
        self.assertTrue(AuditLog.objects.filter(action="permanently_deleted", entity="product", entity_id=str(product_id), changes={"name": "Original"}).exists())

    def test_permanent_delete_requires_a_recycled_product_and_preserves_protected_history(self):
        self.login_staff()
        response = self.client.delete(f"/api/staff/products/{self.product.id}/permanent-delete")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertTrue(Product.objects.filter(pk=self.product.pk).exists())

        self.assertEqual(self.client.delete(f"/api/staff/products/{self.product.id}").status_code, 204)
        InventoryMovement.objects.create(variant=self.variant, change=1, reason=InventoryMovement.Reason.ADJUSTMENT)

        response = self.client.delete(f"/api/staff/products/{self.product.id}/permanent-delete")

        self.assertEqual(response.status_code, 409, response.content)
        self.product.refresh_from_db()
        self.assertIsNotNone(self.product.recycled_at)
        self.assertTrue(ProductVariant.objects.filter(pk=self.variant.pk).exists())
        self.assertTrue(ProductImage.objects.filter(pk=self.image.pk).exists())
        self.assertFalse(AuditLog.objects.filter(action="permanently_deleted", entity_id=str(self.product.id)).exists())

    def test_old_cart_cannot_buy_recycled_product(self):
        self.inventory.quantity_reserved = 0
        self.inventory.save()
        self.client.force_login(self.customer)
        self.assertEqual(self.request_json("post", "/api/cart/items", {"variantId": str(self.variant.id), "quantity": 1}).status_code, 201)
        item_id = self.client.get("/api/cart").json()["items"][0]["id"]
        self.client.force_login(self.staff)
        self.assertEqual(self.client.delete(f"/api/staff/products/{self.product.id}").status_code, 204)
        self.client.force_login(self.customer)
        self.assertEqual(self.request_json("patch", f"/api/cart/items/{item_id}", {"quantity": 1}).status_code, 400)
        self.assertEqual(self.request_json("post", "/api/cart/items", {"variantId": str(self.variant.id), "quantity": 1}).status_code, 400)
        shipping = ShippingMethod.objects.create(name="Standard", base_fee=10, is_active=True)
        body = {"fullName": "Customer", "email": self.customer.email, "phone": "09171234567", "line1": "1 Test", "city": "Manila", "postalCode": "1000", "shippingMethod": str(shipping.id), "paymentMethod": "cod"}
        self.assertEqual(self.request_json("post", "/api/checkout/create", body).status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    def test_reserved_order_can_be_captured_after_recycle(self):
        self.inventory.quantity_reserved = 0
        self.inventory.save()
        self.client.force_login(self.customer)
        self.request_json("post", "/api/cart/items", {"variantId": str(self.variant.id), "quantity": 1})
        shipping = ShippingMethod.objects.create(name="Standard", base_fee=10, is_active=True)
        body = {"fullName": "Customer", "email": self.customer.email, "phone": "09171234567", "line1": "1 Test", "city": "Manila", "postalCode": "1000", "shippingMethod": str(shipping.id), "paymentMethod": "cod"}
        response = self.request_json("post", "/api/checkout/create", body)
        self.assertEqual(response.status_code, 201, response.content)
        payment = Payment.objects.get(pk=response.json()["payment"]["id"])
        order = payment.order
        self.client.force_login(self.staff)
        self.assertEqual(self.client.delete(f"/api/staff/products/{self.product.id}").status_code, 204)
        capture_payment(payment)
        order.refresh_from_db()
        self.inventory.refresh_from_db()
        self.assertEqual(order.status, "paid")
        self.assertEqual(self.inventory.quantity_reserved, 0)
        self.assertEqual(order.items.get().variant_id, self.variant.id)

    def test_checkout_rejects_stale_expected_total_without_creating_any_order(self):
        self.inventory.quantity_reserved = 0
        self.inventory.save()
        self.client.force_login(self.customer)
        self.request_json("post", "/api/cart/items", {"variantId": str(self.variant.id), "quantity": 1})
        shipping = ShippingMethod.objects.create(name="Standard", base_fee=10, is_active=True)
        body = {"fullName": "Customer", "email": self.customer.email, "phone": "09171234567", "line1": "1 Test", "city": "Manila", "postalCode": "1000", "shippingMethod": str(shipping.id), "paymentMethod": "cod", "expectedTotal": "99.99"}
        response = self.request_json("post", "/api/checkout/create", body)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("expectedTotal", response.json())
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(Payment.objects.count(), 0)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity_reserved, 0)
        self.assertEqual(len(self.client.get("/api/cart").json()["items"]), 1)

    def test_checkout_uses_one_price_snapshot_for_total_order_line_and_payment(self):
        self.inventory.quantity_reserved = 0
        self.inventory.save()
        self.client.force_login(self.customer)
        self.request_json("post", "/api/cart/items", {"variantId": str(self.variant.id), "quantity": 1})
        shipping = ShippingMethod.objects.create(name="Standard", base_fee=10, is_active=True)
        body = {"fullName": "Customer", "email": self.customer.email, "phone": "09171234567", "line1": "1 Test", "city": "Manila", "postalCode": "1000", "shippingMethod": str(shipping.id), "paymentMethod": "cod", "expectedTotal": "110.00"}
        with patch("commerce.services.get_unit_price", side_effect=[Decimal("100.00"), Decimal("999.00")]) as price:
            response = self.request_json("post", "/api/checkout/create", body)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(price.call_count, 1)
        order = Order.objects.get(pk=response.json()["order"]["id"])
        self.assertEqual(order.items.get().line_total, Decimal("100.00"))
        self.assertEqual(order.grand_total, Decimal("110.00"))
        self.assertEqual(order.payments.get().amount, Decimal("110.00"))
