# Railway deployment

Deploy three separate services in one Railway project:

```text
PostgreSQL  ── private DATABASE_URL ──> Django API  <── HTTPS ── React/Vite frontend
                                                ^
                                                └── Xendit webhook
```

This project uses Railway service settings for the backend and the committed frontend Dockerfile for reproducible static hosting. Railway also supports config-as-code if your team prefers it. Do not put backend and frontend in one Railway service.

## 1. Add PostgreSQL and the backend API

1. Create a Railway project and add a **PostgreSQL** service.
2. Add a service from this repository for the Django API. In **Settings → Build**, set the root directory to `backend`.
3. In the backend service's deploy settings, configure:

   | Setting | Value |
   | --- | --- |
   | Build command | `pip install -r requirements.txt && python manage.py collectstatic --noinput` |
   | Pre-deploy command | `python manage.py migrate --noinput` |
   | Start command | `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 120` |
   | Healthcheck path | `/healthz/` |

4. In the backend service's **Variables** tab, add a reference to the PostgreSQL service's generated `DATABASE_URL`. Use Railway's variable-reference picker rather than copying a connection string. If entering a reference manually, its service name must match your own PostgreSQL service name.
5. Generate a public domain for the API and note its host name (without `https://`) and origin (with `https://`).

Set these backend variables before the production deploy:

```dotenv
DJANGO_SECRET_KEY=<a newly generated private Django secret>
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=<api-public-hostname>,healthcheck.railway.app
DATABASE_URL=<Railway PostgreSQL variable reference>
CORS_ALLOWED_ORIGINS=https://<frontend-public-hostname>
CSRF_TRUSTED_ORIGINS=https://<frontend-public-hostname>
```

`DJANGO_ALLOWED_HOSTS` is a comma-separated host list without a scheme. The app automatically accepts Railway's healthcheck host in production; keeping it in the variable as shown makes that requirement explicit. `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` are comma-separated origins with `https://` and no path or trailing slash. Add both domains if you use Railway domains and custom domains during a transition.

The pre-deploy migration runs before the web process starts. Run the optional seed command only for an empty demo/development database:

```text
python manage.py seed_data
```

Do **not** use that command as an automatic production pre-deploy step if the store has live catalog data; it may add demo records to a real storefront.

## 2. Add the frontend service

1. Add another Railway service from the same repository.
2. In **Settings → Build**, set the root directory to `frontend`. Railway detects `frontend/Dockerfile`, builds the Vite bundle, and serves it with Nginx.
3. Generate a public frontend domain.
4. In the frontend service's **Variables** tab, set:

```dotenv
VITE_API_URL=https://<api-public-hostname>/api
VITE_USE_MOCK=false
```

`VITE_API_URL` must not end with a trailing slash. It is a public browser value, not a secret. The Dockerfile declares it as a build argument so Railway can bake it into the Vite bundle. Redeploy/rebuild the frontend after changing either `VITE_` variable.

Set the frontend healthcheck path to `/healthz` if you enable a Railway healthcheck.

## 3. Complete the cross-origin configuration

After the frontend domain exists, update the backend variables with its exact HTTPS origin and redeploy the backend:

```dotenv
CORS_ALLOWED_ORIGINS=https://<frontend-public-hostname>
CSRF_TRUSTED_ORIGINS=https://<frontend-public-hostname>
```

Then redeploy the frontend with its API origin set in `VITE_API_URL`. Confirm:

- `https://<api-public-hostname>/healthz/` returns `{"status":"ok"}`.
- Browser API requests go to `https://<api-public-hostname>/api/...`, not the frontend domain.
- The browser receives no CORS error and the request includes credentials where the application uses session authentication.

## 4. Configure Xendit

Set payment credentials only on the **backend** service:

```dotenv
XENDIT_SECRET_KEY=<test or live secret key from your Xendit account>
XENDIT_WEBHOOK_TOKEN=<callback verification token configured in Xendit>
XENDIT_API_URL=https://api.xendit.co
XENDIT_SUCCESS_REDIRECT_URL=https://<frontend-public-hostname>/order-confirmation/{order_number}
XENDIT_FAILURE_REDIRECT_URL=https://<frontend-public-hostname>/checkout
```

`XENDIT_API_URL` is optional because the backend defaults to Xendit's public API URL. Do not create any `VITE_XENDIT_*` variable.
The backend replaces `{order_number}` and `{order_id}` in either redirect URL with the order it just created, so keep those placeholders intact when you want the customer returned to a specific confirmation page.

The payment creation endpoint is `POST /api/payments/xendit/checkout`. Register this public callback URL in the Xendit dashboard:

```text
https://<api-public-hostname>/api/webhooks/xendit
```

The production/live Xendit credentials, callback token, and webhook registration are deliberately **not** included in this repository. They are account-specific settings that the project owner must configure in Xendit and Railway. Use Xendit's test environment first, verify callback-token delivery and order-status updates, then add the live values only when ready to accept real payments.

## Useful Railway references

- [Railway: build configuration](https://docs.railway.com/builds/build-configuration)
- [Railway: Dockerfile builds and build-time variables](https://docs.railway.com/builds/dockerfiles)
- [Railway: pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command)
- [Railway: frontend environment variables](https://docs.railway.com/guides/frontend-environment-variables)
