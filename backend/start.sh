#!/usr/bin/env bash
set -o errexit

exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout 120 \
  --capture-output \
  --error-logfile - \
  --access-logfile -
