"""Create a compact, repeatable catalog and content fixture for STRIDE."""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.models import Brand, Category, Inventory, Product, ProductImage, ProductVariant
from commerce.models import PromoCode, ShippingMethod
from content.models import ContentPage, FAQ, HomepageSection


PRODUCTS = [
    ("aero-runner", "Aero Runner", "men", "shoe1.jpg", "4495", None, False),
    ("court-classic", "Court Classic", "men", "shoe2.jpg", "3995", "3295", False),
    ("trail-pro", "Trail Pro", "men", "shoe5.jpg", "5295", None, True),
    ("daily-slip-on", "Daily Slip-On", "women", "shoe3.jpg", "2995", None, True),
    ("street-mid", "Street Mid", "women", "shoe4.jpg", "4795", "3995", False),
    ("track-lite", "Track Lite", "women", "shoe7.jpg", "3695", None, True),
    ("kids-sprint", "Kids Sprint", "kids", "shoe6.jpg", "2495", None, True),
    ("school-lace", "School Lace", "kids", "shoe2.jpg", "1995", "1695", False),
]


class Command(BaseCommand):
    help = "Seed a STRIDE catalog, content, shipping methods, and promotion data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--if-empty",
            action="store_true",
            help="Seed only when the catalog has no products.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["if_empty"] and Product.objects.exists():
            self.stdout.write("Catalog already contains products; demo seed skipped.")
            return

        brand, _ = Brand.objects.get_or_create(
            slug="stride", defaults={"name": "STRIDE", "is_featured": True}
        )
        categories = {}
        for position, (slug, name) in enumerate((("men", "Men"), ("women", "Women"), ("kids", "Kids")), start=1):
            categories[slug], _ = Category.objects.get_or_create(
                slug=slug, defaults={"name": name, "position": position}
            )

        product_count = 0
        for index, (slug, name, audience, image, price, sale_price, is_new) in enumerate(PRODUCTS, start=1):
            product, _ = Product.objects.update_or_create(
                slug=slug,
                defaults={
                    "brand": brand,
                    "category": categories[audience],
                    "name": name,
                    "audience": audience,
                    "status": Product.Status.ACTIVE,
                    "is_new_arrival": is_new,
                    "description": f"{name} is engineered for everyday movement with a lightweight, stable ride.",
                    "materials": "Breathable mesh upper, recycled lining, durable rubber outsole.",
                    "fit_note": "True to size. Choose your regular STRIDE size.",
                },
            )
            ProductImage.objects.update_or_create(
                product=product,
                position=0,
                defaults={
                    "url": f"/images/{image}",
                    "alt_text": name,
                    "is_primary": True,
                    "color_name": "Sage",
                },
            )
            for size in (39, 40, 41, 42, 43):
                variant, _ = ProductVariant.objects.update_or_create(
                    product=product,
                    sku=f"STR-{index:02d}-{size}",
                    defaults={
                        "color_name": "Sage",
                        "color_hex": "#8B9A6E",
                        "size_eu": Decimal(f"{size}.0"),
                        "size_us": Decimal(f"{size - 32}.0"),
                        "price": Decimal(price),
                        "sale_price": Decimal(sale_price) if sale_price else None,
                        "is_active": True,
                    },
                )
                Inventory.objects.update_or_create(
                    variant=variant,
                    defaults={"quantity_on_hand": 24, "quantity_reserved": 0, "low_stock_threshold": 4},
                )
            product_count += 1

        ShippingMethod.objects.update_or_create(
            name="Standard delivery",
            defaults={"description": "Metro Manila: 2–4 working days", "base_fee": Decimal("150.00"), "est_days_min": 2, "est_days_max": 4, "is_active": True},
        )
        ShippingMethod.objects.update_or_create(
            name="Express delivery",
            defaults={"description": "Priority dispatch within Metro Manila", "base_fee": Decimal("295.00"), "est_days_min": 1, "est_days_max": 2, "is_active": True},
        )
        PromoCode.objects.update_or_create(
            code="STRIDE10",
            defaults={"discount_type": PromoCode.DiscountType.PERCENT, "value": Decimal("10.00"), "min_subtotal": Decimal("2500.00"), "is_active": True},
        )

        sections = [
            ("hero", "RUN THE CITY", "Built for wherever your day takes you.", "SHOP NEW ARRIVALS", "/new-arrivals", "/images/shoe5.jpg", 1),
            ("new-arrivals", "JUST IN", "New movement, fresh colorways.", "EXPLORE NEW", "/new-arrivals", "/images/shoe7.jpg", 2),
        ]
        for key, title, subtitle, label, url, image, position in sections:
            HomepageSection.objects.update_or_create(
                section_key=key,
                defaults={"title": title, "subtitle": subtitle, "cta_label": label, "cta_url": url, "image_url": image, "position": position, "is_visible": True},
            )

        pages = {
            "about": ("About STRIDE", "We make well-considered shoes for life in motion. Each pair balances comfort, durability, and a quieter footprint."),
            "shipping": ("Shipping policy", "Orders are packed on business days. Standard delivery is free above ₱3,500; express delivery is calculated at checkout."),
            "returns-policy": ("Returns and refunds", "Unworn pairs may be returned within 30 days in their original packaging. Start a return from your account after delivery."),
            "privacy": ("Privacy policy", "We use your details only to process orders, provide support, and improve STRIDE. We never sell your personal information."),
            "terms": ("Terms and conditions", "By using STRIDE, you agree to provide accurate order information and to use the shop only for lawful purchases."),
        }
        for slug, (title, body) in pages.items():
            ContentPage.objects.update_or_create(slug=slug, defaults={"title": title, "body": body})
        faqs = [
            ("Orders", "Can I change my order?", "Contact us as soon as possible. We can update unfulfilled orders when stock and shipping allow."),
            ("Sizing", "How do I find my size?", "Use the size guide on each product page and choose your regular STRIDE size for a true-to-size fit."),
            ("Returns", "How do I start a return?", "Sign in, open Order history, select your delivered order, and submit a return or exchange request."),
        ]
        for position, (topic, question, answer) in enumerate(faqs, start=1):
            FAQ.objects.update_or_create(question=question, defaults={"topic": topic, "answer": answer, "position": position, "is_published": True})

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {product_count} products, shipping methods, promotion data, and content."
        ))
