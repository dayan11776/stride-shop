#!/usr/bin/env bash
set -o errexit

if [ -n "${STRIDE_TEMP_ADMIN_EMAIL:-}" ]; then
  python manage.py promote_temporary_admin || printf '%s\n' 'STRIDE_ADMIN_BOOTSTRAP:error' >&2
fi

exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout 120 \
  --capture-output \
  --error-logfile - \
  --access-logfile -
