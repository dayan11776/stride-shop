import { afterEach, expect, test, vi } from 'vitest'

vi.mock('@/lib/mockData', () => ({ products: [
  { id: 1, name: 'Canvas shoe', brand: 'STRIDE', audience: 'men', description: 'Breathable upper' },
  { id: 2, name: 'Cloud shoe', brand: 'ON', audience: 'women' },
] }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

test('mock catalog filters brands exactly and case-insensitively', async () => {
  vi.stubEnv('VITE_USE_MOCK', 'true')
  vi.resetModules()
  const { getProducts } = await import('./api')
  expect((await getProducts({ brand: 'on' })).map((product) => product.id)).toEqual([2])
  expect((await getProducts({ brand: 'ON', q: 'cloud' })).map((product) => product.id)).toEqual([2])
  expect(await getProducts({ brand: 'ON', q: 'canvas' })).toEqual([])
})

test('mock keyword search includes brand and description like the live API', async () => {
  vi.stubEnv('VITE_USE_MOCK', 'true')
  vi.resetModules()
  const { getProducts } = await import('./api')
  expect((await getProducts({ q: 'stride' })).map((product) => product.id)).toEqual([1])
  expect((await getProducts({ q: 'breathable' })).map((product) => product.id)).toEqual([1])
})
