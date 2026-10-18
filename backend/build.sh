#!/usr/bin/env bash
set -o errexit

python -m pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate --noinput
python manage.py import_catalog commerce/catalog_batch_20261018.json --require-complete-batch --dry-run --publish
python manage.py import_catalog commerce/catalog_batch_20261018.json --require-complete-batch --publish
python manage.py disable_demo_accounts
python manage.py seed_data --if-empty
