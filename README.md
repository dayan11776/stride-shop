# STRIDE shoe store

STRIDE is a full-stack shoe e-commerce application: a Django REST Framework API in `backend/` and a React + Vite + Tailwind client in `frontend/`. The two applications are designed to run and deploy independently.

## Project layout

```text
backend/    Django, Django REST Framework, PostgreSQL integration, hosted-payment integrations
frontend/   React, Vite, Tailwind, production Nginx container
docs/       Deployment notes
```

## Run locally

Prerequisites: Python 3.13 and a current Node.js LTS release.

On Windows, the quickest persistent local launch is to double-click `start-local.cmd` in the project root. It creates or completes the backend virtual environment as needed, installs missing dependencies, applies migrations, seeds a new local database, and opens separate API and frontend terminal windows. Keep those two windows open, then visit `http://localhost:5173`.

Start the API in one PowerShell window:

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_data
python manage.py runserver
```

`seed_data` loads development/demo catalog data. Do not run it against a production store that already has its live catalog data.

Start the client in another PowerShell window:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

The Vite development server proxies `/api` to Django at `http://localhost:8000`. Keep `VITE_USE_MOCK=false` in `frontend/.env` to exercise the API; setting it to `true` enables UI-only mock data.

For a quick verification, run `python manage.py check` in `backend/` and `npm test` in `frontend/`.

## Configuration

The backend reads process environment variables. `backend/.env.example` is a reference checklist; it is not loaded automatically by Django. Set variables through your shell/IDE locally and through Railway in deployment.

The important production settings are:

| Service | Variables |
| --- | --- |
| Backend | `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, `DJANGO_ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` |
| Frontend | `VITE_API_URL`, `VITE_USE_MOCK=false` |
| Backend PayMongo integration | `PAYMENT_PROVIDER=paymongo`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `PAYMONGO_SUCCESS_REDIRECT_URL`, `PAYMONGO_CANCEL_REDIRECT_URL`, optionally `PAYMONGO_PAYMENT_METHOD_TYPES` |

Never use `VITE_` for credentials, database URLs, or payment secrets: Vite exposes these values in the browser build.

## Deploy to Railway

Deploy the backend, PostgreSQL database, and frontend as three separate Railway services. Full settings, CORS wiring, migration flow, and Xendit webhook setup are in [docs/railway.md](docs/railway.md).

The frontend production container is defined by [frontend/Dockerfile](frontend/Dockerfile). It serves the Vite build through Nginx, includes a SPA fallback, and listens on Railway's assigned `PORT`.

## Deploy to Vercel + Render

The repository includes `frontend/vercel.json` and `render.yaml` for the requested Vercel frontend and Render Django/PostgreSQL deployment. Follow [docs/vercel-render.md](docs/vercel-render.md) after publishing the repository. The Vercel configuration proxies `/api` to Render so Django's session and CSRF cookies stay first-party to the storefront.

## Payments

PayMongo Hosted Checkout is called only by the Django API. The frontend receives a checkout URL/status only; it never receives a secret API key or webhook signing secret. Add the account-specific PayMongo values in Render, then register `https://<render-service>.onrender.com/api/webhooks/paymongo` for `checkout_session.payment.paid`. The signed webhook, rather than the browser redirect, is the source of truth for marking an order paid.

`PAYMENT_PROVIDER=auto` preserves the existing Xendit integration until a complete PayMongo configuration is present. Set it to `paymongo` to require PayMongo for new online orders, or `xendit` to retain the legacy provider during a transition. Existing Xendit checkout and webhook routes remain available for historical orders.

The included integration covers hosted customer checkout and payment callbacks. Store payouts are intentionally outside this build because the supplied schema has no beneficiary or payout records; add those business requirements before enabling any payout flow.


