const apiOrigin = process.env.API_ORIGIN?.replace(/\/+$/, '')

if (!apiOrigin) {
  throw new Error('API_ORIGIN must point to the Render API origin, for example https://stride-shop-api.onrender.com')
}

export default {
  rewrites: [
    // Keep Django's session and CSRF cookies first-party to the Vercel site.
    { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
    // Vite SPA history fallback must come after the API proxy.
    { source: '/(.*)', destination: '/index.html' },
  ],
}
