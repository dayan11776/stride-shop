#!/usr/bin/env bash
set -o errexit

python -m pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate --noinput
python manage.py import_catalog commerce/fixtures/reference_catalog_20261017.json --expected-per-audience 10 --require-complete-batch --dry-run --publish
python manage.py import_catalog commerce/fixtures/reference_catalog_20261017.json --expected-per-audience 10 --require-complete-batch --publish
python manage.py disable_demo_accounts
python manage.py seed_data --if-empty
