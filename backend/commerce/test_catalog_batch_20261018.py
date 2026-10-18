import json
from collections import Counter
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase

from catalog.models import Product


class ApprovedBrandBatchTests(TestCase):
    def test_batch_counts_labels_and_safe_repeat(self):
        path = Path(__file__).with_name("catalog_batch_20261018.json")
        items = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(len(items), 60)
        self.assertEqual(set(Counter(item["brand"]["name"] for item in items).values()), {5})
        self.assertEqual(len({item["brand"]["name"] for item in items}), 12)
        self.assertEqual(sum(item["is_new_arrival"] for item in items), 10)
        self.assertTrue(all(item["is_example_price"] and item["is_example_stock"] for item in items))

        output = StringIO()
        call_command("import_catalog", str(path), dry_run=True, publish=True, require_complete_batch=True, stdout=output)
        self.assertIn("Would create 60 products", output.getvalue())
        self.assertFalse(Product.objects.exists())

        call_command("import_catalog", str(path), publish=True, require_complete_batch=True, stdout=StringIO())
        self.assertEqual(Product.objects.filter(status=Product.Status.ACTIVE).count(), 60)
        self.assertEqual(Product.objects.filter(is_new_arrival=True).count(), 10)
        self.assertEqual(Product.objects.filter(is_example_price=True, is_example_stock=True).count(), 60)
        product = Product.objects.get(slug=items[0]["slug"])
        inventory = product.variants.first().inventory
        inventory.quantity_reserved = 1
        inventory.save(update_fields=["quantity_reserved"])
        output = StringIO()
        call_command("import_catalog", str(path), publish=True, require_complete_batch=True, stdout=output)
        self.assertIn("skipped 60 existing slugs", output.getvalue())
        inventory.refresh_from_db()
        self.assertEqual(inventory.quantity_reserved, 1)
