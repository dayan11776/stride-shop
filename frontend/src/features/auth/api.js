import { api, payloadFrom, USE_MOCK } from '@/lib/apiClient'

const mockUser = (email) => ({
  id: 1,
  fullName: email?.startsWith('admin') ? 'STRIDE Admin' : 'Alex Rivera',
  email: email || 'alex@example.com',
  role: email?.startsWith('admin') ? 'admin' : 'customer',
})

export async function signIn(credentials) {
  if (USE_MOCK) return { user: mockUser(credentials.email) }
  await ensureCsrf()
  return payloadFrom(await api('/auth/login', { method: 'POST', body: credentials }))
}

export async function registerAccount(values) {
  if (USE_MOCK) return { user: mockUser(values.email) }
  await ensureCsrf()
  return payloadFrom(await api('/auth/register', { method: 'POST', body: values }))
}

export async function ensureCsrf() {
  if (!USE_MOCK) await api('/csrf')
}

export async function getCurrentUser() {
  if (USE_MOCK) return null
  return payloadFrom(await api('/auth/me'))?.user ?? null
}

export async function signOutRequest() {
  if (!USE_MOCK) await api('/auth/logout', { method: 'POST' })
}
