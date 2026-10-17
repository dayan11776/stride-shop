# Importing catalog products

The `import_catalog` command adds products from a supplied JSON file. It is
never run automatically by a deploy. A repeat import skips existing slugs and
does not change their prices, quantities, reservations, or recycle status.

Every variant needs an explicitly supplied `quantity_on_hand`; a zero means
out of stock, not an estimate of the real inventory. Each product also needs an
explicit `is_example_stock` boolean. Set it to `true` when quantities are only
examples. Confirm the price and permission to use each image before publishing.
Example-stock labels are informational: they do not prevent customers from
placing actual orders. The structure
below is only an example and does not describe a real product:

```json
[
  {
    "name": "Example shoe",
    "slug": "example-shoe",
    "brand": {"name": "Example Brand", "slug": "example-brand"},
    "audience": "men",
    "is_example_stock": true,
    "description": "Example description",
    "images": [{"url": "https://example.test/shoe.jpg", "alt_text": "Example shoe", "is_primary": true}],
    "variants": [
      {"sku": "EXAMPLE-40", "color_name": "Black", "size_eu": "40.0", "price": "1000.00", "quantity_on_hand": 0}
    ]
  }
]
```

Supported audiences are `men`, `women`, and `kids`. Prices are PHP in the
store's configured currency; sizes are EU. A file intended to contain exactly
10 products per audience can be validated without committing it using:

```shell
python manage.py import_catalog products.json --expected-per-audience 10 --require-complete-batch --dry-run
```

Remove `--dry-run` to create the listings as drafts. Add `--publish` only after
the catalog data has been reviewed and the seller is ready to accept orders.
Existing slugs remain untouched even when
`--publish` is supplied. A validation failure rolls back the entire import.
The `--require-complete-batch` option also stops before writing if some, but
not all, input slugs already exist. With all slugs present, a repeat is a safe
no-op; with none present, the command can create the complete batch.
