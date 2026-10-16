// One place for every HTTP call: base URL, JSON, cookies and error handling.
// Mock data is intentionally opt-in, so a normal build talks to Django.
const BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
export const USE_MOCK = String(import.meta.env.VITE_USE_MOCK).toLowerCase() === 'true'

export class ApiError extends Error {
  constructor(status, body) {
    super(messageFromBody(body) ?? fallbackMessage(status))
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function messageFromBody(body) {
  if (!body) return null
  if (typeof body === 'string') {
    // Django (and reverse proxies) may return an HTML error document for an
    // unexpected server failure. Never render its markup as the checkout
    // error message; the customer only needs a clear, safe next step.
    return /<\/?(?:!doctype|html|head|body|title)\b/i.test(body) ? null : body
  }
  if (body.message || body.detail || body.error) return body.message ?? body.detail ?? body.error
  const first = Object.values(body).flat().find(Boolean)
  return typeof first === 'string' ? first : null
}

function fallbackMessage(status) {
  if (status >= 500) return 'The service is temporarily unavailable. Please try again shortly.'
  return `Request failed (${status})`
}

function getCookie(name) {
  if (typeof document === 'undefined') return null
  const hit = document.cookie.split('; ').find((value) => value.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null
}

export async function api(path, { method = 'GET', body, params, signal } = {}) {
  const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')) : ''
  const csrf = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) ? getCookie('csrftoken') : null
  const res = await fetch(`${BASE}${path}${qs}`, {
    method, signal, credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRFToken': csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const contentType = res.headers.get('content-type') ?? ''
  const data = res.status === 204 ? null : contentType.includes('json') ? await res.json().catch(() => null) : await res.text().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

export function listFrom(data) {
  if (Array.isArray(data)) return data
  return data?.results ?? data?.items ?? data?.data ?? []
}

export function payloadFrom(data) {
  return data?.data ?? data
}
