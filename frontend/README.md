# STRIDE storefront

React, Vite, Tailwind CSS, React Router, TanStack Query, and Zustand power the STRIDE storefront. It is intentionally separate from the Django REST API in `../backend`.

## Run locally

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

The default environment calls `/api`; Vite proxies that path to Django at `http://localhost:8000`. Start the backend first, keep `VITE_USE_MOCK=false`, and visit `http://localhost:5173`.

```powershell
npm test
npm run build
```

## Environment values

```dotenv
VITE_API_URL=/api
VITE_USE_MOCK=false
```

For a separately hosted frontend, set `VITE_API_URL` to the public backend API origin (for example, `https://api.example.com/api`) at build time. These `VITE_` values are browser-visible; never place credentials or Xendit secrets here.

## Structure

- `src/pages/` contains route-level screens.
- `src/features/` owns catalog, cart, auth, checkout, and wishlist state/API adapters.
- `src/components/` contains reusable UI, account views, and back-office views.
- `src/layouts/` provides the storefront, checkout, account, support, and admin shells.
- `src/lib/apiClient.js` is the single JSON/credentialed-fetch boundary.

All shopper, account, checkout, content, and admin routes are lazy loaded in `src/app/router.jsx`. The palette is implemented through Tailwind utilities and the token styles in `src/styles/`.
