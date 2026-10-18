"""Import explicitly supplied catalog data without updating existing listings.

This command is never run automatically during deployment. It creates drafts by
default. Example quantities must be explicitly marked on every product.
"""
import json
from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from rest_framework.exceptions import ValidationError as APIValidationError

from api.serializers import AdminProductSerializer
from catalog.models import Brand, Category, Product


AUDIENCES = {"men": "Men", "women": "Women", "kids": "Kids"}
PRODUCT_FIELDS = {"name", "slug", "description", "materials", "audience", "fit_note", "is_new_arrival", "is_example_stock", "is_example_price", "images", "variants"}
IMAGE_FIELDS = {"url", "color_name", "alt_text", "position", "is_primary"}
VARIANT_FIELDS = {"sku", "color_name", "color_hex", "size_eu", "size_us", "width", "price", "sale_price", "sale_starts_at", "sale_ends_at", "quantity_on_hand", "low_stock_threshold"}


def validate_shape(products, expected_count):
    if not isinstance(products, list) or not products:
        raise CommandError("The input must be a nonempty JSON array of products.")
    counts = {audience: 0 for audience in AUDIENCES}
    slugs = set()
    for index, item in enumerate(products, start=1):
        prefix = f"Product {index}"
        if not isinstance(item, dict):
            raise CommandError(f"{prefix} must be an object.")
        unknown = set(item) - PRODUCT_FIELDS - {"brand"}
        if unknown:
            raise CommandError(f"{prefix} has unsupported fields: {', '.join(sorted(unknown))}.")
        slug = item.get("slug")
        if not isinstance(slug, str) or not slug:
            raise CommandError(f"{prefix} needs a slug.")
        if slug in slugs:
            raise CommandError(f"The input contains the duplicate product slug {slug}.")
        slugs.add(slug)
        audience = item.get("audience")
        if not isinstance(audience, str) or audience not in AUDIENCES:
            raise CommandError(f"{prefix} audience must be men, women, or kids.")
        counts[audience] += 1
        if not isinstance(item.get("is_example_stock"), bool):
            raise CommandError(f"{prefix} needs an explicit boolean is_example_stock flag.")
        if "is_example_price" in item and not isinstance(item["is_example_price"], bool):
            raise CommandError(f"{prefix} is_example_price must be a boolean.")
        brand = item.get("brand")
        if not isinstance(brand, dict) or set(brand) != {"name", "slug"} or any(not isinstance(v, str) or not v for v in brand.values()):
            raise CommandError(f"{prefix} needs a brand object with nonempty name and slug.")
        images = item.get("images", [])
        if not isinstance(images, list) or any(not isinstance(image, dict) or set(image) - IMAGE_FIELDS for image in images):
            raise CommandError(f"{prefix} images must contain only supported image fields.")
        variants = item.get("variants")
        if not isinstance(variants, list) or not variants:
            raise CommandError(f"{prefix} needs at least one size variant.")
        for variant in variants:
            if not isinstance(variant, dict) or set(variant) - VARIANT_FIELDS:
                raise CommandError(f"{prefix} variants must contain only supported variant fields.")
            quantity = variant.get("quantity_on_hand")
            if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 0:
                raise CommandError(f"{prefix} needs an explicit nonnegative integer quantity_on_hand for every variant.")
    if expected_count is not None and any(value != expected_count for value in counts.values()):
        raise CommandError(f"Expected {expected_count} products per audience; input contains {counts}.")


class Command(BaseCommand):
    help = "Import product JSON as drafts, with explicit per-variant stock; never changes existing product records."

    def add_arguments(self, parser):
        parser.add_argument("input_file", help="Path to a UTF-8 JSON array of catalog products.")
        parser.add_argument("--expected-per-audience", type=int, help="Require exactly this many products for men, women and kids.")
        parser.add_argument("--dry-run", action="store_true", help="Validate the whole import and roll back all changes.")
        parser.add_argument("--publish", action="store_true", help="Publish NEW products after review. Example stock labels do not prevent purchases.")
        parser.add_argument(
            "--require-complete-batch", action="store_true",
            help="Require either none or all input slugs to exist; reject a partially imported batch before writing.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            products = json.loads(Path(options["input_file"]).read_text(encoding="utf-8-sig"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise CommandError(f"Cannot read product JSON: {exc}") from exc
        expected_count = options["expected_per_audience"]
        if expected_count is not None and expected_count < 1:
            raise CommandError("--expected-per-audience must be positive.")
        validate_shape(products, expected_count)

        existing_batch = None
        if options["require_complete_batch"]:
            slugs = [item["slug"] for item in products]
            # Row locks protect existing rows from concurrent deletion. For an
            # initially empty batch, do not switch to skipping later if another
            # writer races this importer: a uniqueness failure rolls back all
            # of our writes instead of leaving an accidental partial batch.
            existing_batch = set(Product.objects.select_for_update().filter(slug__in=slugs).values_list("slug", flat=True))
            if 0 < len(existing_batch) < len(slugs):
                raise CommandError(
                    f"Partial batch detected ({len(existing_batch)} of {len(slugs)} input slugs exist); no changes made."
                )

        created = 0
        skipped = []
        for index, item in enumerate(products, start=1):
            slug = item["slug"]
            # Never update a previously imported, manually edited, or recycled
            # listing, or reset quantities/reservations on a subsequent run.
            already_exists = slug in existing_batch if existing_batch is not None else Product.objects.filter(slug=slug).exists()
            if already_exists:
                skipped.append(slug)
                continue

            info = item["brand"]
            brand = Brand.objects.filter(slug=info["slug"]).first()
            if brand and brand.name != info["name"]:
                raise CommandError(f"Product {index}: brand slug {info['slug']} belongs to {brand.name}.")
            if not brand:
                brand = Brand(**info)
                try:
                    brand.full_clean()
                except DjangoValidationError as exc:
                    raise CommandError(f"Product {index}: invalid brand: {exc}") from exc
                brand.save()
            audience = item["audience"]
            category, _ = Category.objects.get_or_create(slug=audience, defaults={"name": AUDIENCES[audience]})
            payload = {key: value for key, value in item.items() if key in PRODUCT_FIELDS}
            payload.update(brand=str(brand.pk), category=str(category.pk), status=Product.Status.ACTIVE if options["publish"] else Product.Status.DRAFT)
            serializer = AdminProductSerializer(data=payload)
            try:
                serializer.is_valid(raise_exception=True)
                serializer.save()
            except APIValidationError as exc:
                raise CommandError(f"Product {index} ({slug}) failed validation: {exc.detail}") from exc
            created += 1

        if options["dry_run"]:
            transaction.set_rollback(True)
        verb = "Would create" if options["dry_run"] else "Created"
        status = "active" if options["publish"] else "draft"
        self.stdout.write(f"{verb} {created} products as {status}; skipped {len(skipped)} existing slugs without changes.")
        if skipped:
            self.stdout.write("Skipped: " + ", ".join(skipped))
        if options["publish"] and any(item["is_example_stock"] for item in products):
            self.stdout.write(self.style.WARNING("Example stock labels are informational and do not prevent customers from placing real orders."))
