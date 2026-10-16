import { ApiError, api } from './apiClient'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('replaces an HTML server error with a safe customer message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: () => Promise.resolve('<!doctype html><html><title>Server Error (500)</title></html>'),
  }))

  const error = await api('/payments/checkout', { method: 'POST', body: { paymentId: 'test' } }).catch((reason) => reason)

  expect(error).toBeInstanceOf(ApiError)
  expect(error.status).toBe(500)
  expect(error.message).toBe('The service is temporarily unavailable. Please try again shortly.')
  expect(error.message).not.toContain('<!doctype')
})
