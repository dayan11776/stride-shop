# Deploy STRIDE with Vercel and Render

The repository is a monorepo: Vercel builds `frontend/` and Render runs `backend/` with a managed PostgreSQL database.

## 1. Create the Render backend

1. In Render, create a Blueprint from this GitHub repository. Render reads the root `render.yaml` file.
2. The included Blueprint requests Render's `free` plans for a demo deployment. Confirm those plans are available to your account; choose a paid plan only if you intend to incur charges.
3. When the first deploy completes, open `https://<render-service>.onrender.com/healthz/` and confirm it returns `{"status": "ok"}`.

The blueprint generates `DJANGO_SECRET_KEY`, sets `DJANGO_DEBUG=False`, wires `DATABASE_URL` to the managed database, runs migrations, and seeds the demo catalog only when the catalog is empty. It deliberately does not commit payment credentials.

Render free services and free PostgreSQL are suitable only for a demo: availability, expiry, and backup policies vary by account and plan. Use a managed production plan before accepting live payments.

## 2. Create the Vercel frontend

1. Import the same GitHub repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Keep the detected Vite build command (`npm run build`) and output directory (`dist`).
4. Add a Production environment variable named `API_ORIGIN` with the Render origin only, for example `https://stride-shop-api.onrender.com`. Do not include `/api`.
5. Deploy. `frontend/vercel.ts` proxies `/api/*` to Render before applying the Vite SPA fallback.

Keep `VITE_API_URL=/api` and `VITE_USE_MOCK=false`. Do not put Xendit keys or any other secrets in `VITE_*` variables.

## 3. Trust the Vercel storefront in Django

After Vercel shows its production URL, add these Render environment variables and redeploy the backend:

```text
CSRF_TRUSTED_ORIGINS=https://your-project.vercel.app
CORS_ALLOWED_ORIGINS=https://your-project.vercel.app
```

The proxy makes browser calls same-origin, which keeps the session and CSRF cookies functional. The CORS setting remains useful for non-proxied API clients.

## 4. Optional Xendit configuration

Set these in Render only when live payments are ready:

```text
XENDIT_SECRET_KEY=
XENDIT_WEBHOOK_TOKEN=
XENDIT_SUCCESS_REDIRECT_URL=https://your-project.vercel.app/order-confirmation/{order_number}
XENDIT_FAILURE_REDIRECT_URL=https://your-project.vercel.app/checkout
```

Register the public webhook at `https://<render-service>.onrender.com/api/webhooks/xendit`. Never commit these values or expose them through Vercel environment variables.
