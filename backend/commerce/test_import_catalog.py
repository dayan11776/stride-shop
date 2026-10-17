import json
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from catalog.models import Brand, Category, Inventory, Product, ProductImage, ProductVariant
from commerce.models import InventoryMovement


def catalog():
    items = []
    for audience in ("men", "women", "kids"):
        for index in range(10):
            items.append({
                "name": f"Test {audience} shoe {index}",
                "slug": f"test-{audience}-{index}",
                "brand": {"slug": "test-brand", "name": "Test Brand"},
                "audience": audience,
                "is_example_stock": True,
                "description": "Test data only",
                "images": [{"url": "https://example.test/shoe.png", "is_primary": True}],
                "variants": [
                    {"sku": f"TEST-{audience}-{index}-{size}", "color_name": "Black", "size_eu": str(size), "price": "1200.00", "quantity_on_hand": quantity}
                    for size, quantity in ((39, 2), (40, 4), (41, 0))
                ],
            })
    return items


class ImportCatalogCommandTests(TestCase):
    def import_items(self, items, **options):
        output = StringIO()
        with patch("commerce.management.commands.import_catalog.Path.read_text", return_value=json.dumps(items)):
            call_command("import_catalog", "catalog.json", stdout=output, **options)
        return output.getvalue()

    def test_create_requested_count_as_drafts_and_track_quantities(self):
        output = self.import_items(catalog(), expected_per_audience=10)
        self.assertIn("Created 30 products as draft", output)
        for audience in ("men", "women", "kids"):
            self.assertEqual(Product.objects.filter(audience=audience, status="draft").count(), 10)
        self.assertEqual(ProductImage.objects.count(), 30)
        self.assertEqual(Inventory.objects.count(), 90)
        self.assertEqual(InventoryMovement.objects.count(), 60)
        for inventory in Inventory.objects.all():
            self.assertEqual(inventory.quantity_reserved, 0)
            self.assertEqual(inventory.available, inventory.quantity_on_hand)
            if inventory.quantity_on_hand:
                self.assertEqual(InventoryMovement.objects.get(variant=inventory.variant).change, inventory.quantity_on_hand)

    def test_repeat_does_not_touch_edited_or_recycled_products_and_reservations(self):
        self.import_items(catalog())
        product = Product.objects.get(slug="test-men-0")
        product.name = "Admin edited this product"
        product.recycled_at = timezone.now()
        product.save()
        inventory = product.variants.first().inventory
        inventory.quantity_on_hand = 9
        inventory.quantity_reserved = 2
        inventory.save()
        output = self.import_items(catalog(), publish=True)
        product.refresh_from_db()
        inventory.refresh_from_db()
        self.assertEqual(product.name, "Admin edited this product")
        self.assertEqual(product.status, Product.Status.DRAFT)
        self.assertIsNotNone(product.recycled_at)
        self.assertEqual((inventory.quantity_on_hand, inventory.quantity_reserved), (9, 2))
        self.assertEqual(Product.objects.count(), 30)
        self.assertIn("skipped 30 existing slugs", output)

    def test_dry_run_rolls_back_everything(self):
        output = self.import_items(catalog(), dry_run=True, publish=True)
        self.assertIn("Would create 30 products as active", output)
        self.assertFalse(Product.objects.exists())
        self.assertFalse(Brand.objects.exists())
        self.assertFalse(Category.objects.exists())
        self.assertFalse(InventoryMovement.objects.exists())

    def test_publish_requires_explicit_option_and_api_reports_available_not_on_hand(self):
        self.import_items(catalog(), publish=True)
        product = Product.objects.get(slug="test-men-0")
        inventory = product.variants.first().inventory
        inventory.quantity_reserved = 1
        inventory.save()
        response = self.client.get("/api/products/test-men-0")
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json()["isExampleStock"], True)
        self.assertEqual([item["available"] for item in response.json()["variants"]], [1, 4, 0])

    def test_missing_stock_or_wrong_audience_count_fails_before_creating_anything(self):
        items = catalog()
        del items[12]["variants"][0]["quantity_on_hand"]
        with self.assertRaisesMessage(CommandError, "explicit nonnegative integer"):
            self.import_items(items)
        self.assertFalse(Product.objects.exists())
        with self.assertRaisesMessage(CommandError, "Expected 10 products per audience"):
            self.import_items(catalog()[:-1], expected_per_audience=10)
        self.assertFalse(Brand.objects.exists())

    def test_example_stock_flag_must_be_explicit_and_is_persisted(self):
        items = catalog()
        del items[2]["is_example_stock"]
        with self.assertRaisesMessage(CommandError, "explicit boolean is_example_stock"):
            self.import_items(items)
        self.assertFalse(Product.objects.exists())
        items = catalog()
        items[0]["is_example_stock"] = "false"
        with self.assertRaisesMessage(CommandError, "explicit boolean is_example_stock"):
            self.import_items(items)
        items[0]["is_example_stock"] = False
        self.import_items(items)
        self.assertFalse(Product.objects.get(slug="test-men-0").is_example_stock)
        self.assertTrue(Product.objects.get(slug="test-men-1").is_example_stock)

    def test_conflicting_sku_rolls_back_whole_import(self):
        brand = Brand.objects.create(name="Existing", slug="existing")
        category = Category.objects.create(name="Existing", slug="existing")
        product = Product.objects.create(brand=brand, category=category, name="Existing", slug="existing", audience="men")
        ProductVariant.objects.create(product=product, sku="TEST-women-1-39", color_name="Black", size_eu=39, price=100)
        with self.assertRaisesMessage(CommandError, "already in use"):
            self.import_items(catalog(), require_complete_batch=True)
        self.assertEqual(Product.objects.count(), 1)
        self.assertEqual(Product.objects.get().name, "Existing")
        self.assertEqual(ProductVariant.objects.count(), 1)
        self.assertFalse(Brand.objects.filter(slug="test-brand").exists())
        self.assertFalse(Inventory.objects.exists())

    def test_unsupported_removal_keys_and_duplicate_slugs_are_rejected(self):
        items = catalog()
        items[0]["remove_variant_ids"] = ["unsafe"]
        with self.assertRaisesMessage(CommandError, "unsupported fields"):
            self.import_items(items)
        items = catalog()
        items[1]["slug"] = items[0]["slug"]
        with self.assertRaisesMessage(CommandError, "duplicate product slug"):
            self.import_items(items)
        self.assertFalse(Product.objects.exists())

    def test_complete_batch_option_creates_all_then_safely_skips_all(self):
        items = catalog()
        output = self.import_items(items, require_complete_batch=True)
        self.assertIn("Created 30 products as draft", output)
        inventory = Product.objects.get(slug="test-men-0").variants.first().inventory
        inventory.quantity_on_hand = 12
        inventory.quantity_reserved = 2
        inventory.save()
        output = self.import_items(items, require_complete_batch=True, publish=True)
        inventory.refresh_from_db()
        self.assertEqual((inventory.quantity_on_hand, inventory.quantity_reserved), (12, 2))
        self.assertEqual(Product.objects.count(), 30)
        self.assertEqual(Product.objects.filter(status=Product.Status.DRAFT).count(), 30)
        self.assertIn("skipped 30 existing slugs", output)

    def test_complete_batch_option_rejects_partial_matches_before_writing(self):
        items = catalog()
        # Put the existing record later in the input so a per-row check would
        # otherwise already have created at least one new listing.
        self.import_items([items[1]])
        original = Product.objects.get(slug=items[1]["slug"])
        original.name = "Already edited"
        original.save()
        existing_counts = (Product.objects.count(), ProductVariant.objects.count(), InventoryMovement.objects.count())
        with self.assertRaisesMessage(CommandError, "Partial batch detected (1 of 30 input slugs exist); no changes made"):
            self.import_items(items, expected_per_audience=10, require_complete_batch=True)
        original.refresh_from_db()
        self.assertEqual(original.name, "Already edited")
        self.assertEqual((Product.objects.count(), ProductVariant.objects.count(), InventoryMovement.objects.count()), existing_counts)
        self.assertFalse(Product.objects.filter(slug=items[0]["slug"]).exists())

    def test_reference_catalog_is_30_labeled_products_with_matching_model_references(self):
        path = Path(__file__).resolve().parent / "fixtures" / "reference_catalog_20261017.json"
        items = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(len(items), 30)
        self.assertEqual(len({item["slug"] for item in items}), 30)
        for item in items:
            code = item["slug"].rsplit("-", 1)[-1].upper()
            self.assertTrue(item["is_example_stock"])
            self.assertIn(f"/{code}.html", item["description"])
            self.assertIn(f"_{code}_", item["images"][0]["url"])
            self.assertEqual(len(item["variants"]), 3)
            for variant in item["variants"]:
                self.assertTrue(variant["sku"].startswith("EXAMPLE-"))
                self.assertGreater(variant["quantity_on_hand"], 0)
        self.import_items(items, expected_per_audience=10, require_complete_batch=True, dry_run=True, publish=True)
        self.assertFalse(Product.objects.exists())
