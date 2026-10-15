import { beforeEach, expect, test } from 'vitest'
import { maxQtyFor, useCartStore } from './cartStore'

const product = { id: 'p1', price: 1000 }
beforeEach(() => useCartStore.getState().clear())

test('adding more than the stock left keeps the line at the stock level', () => {
  useCartStore.getState().add(product, 40, 12, { id: 'v1', available: 5 })
  expect(useCartStore.getState().items[0].qty).toBe(5)
})

test('the + button cannot go past the per-line cap', () => {
  useCartStore.getState().add(product, 40, 1, { id: 'v1', available: 50 })
  useCartStore.getState().setQty('p1-v1', 99)
  expect(useCartStore.getState().items[0].qty).toBe(10)
})

test('lines without stock info use the default cap', () => {
  expect(maxQtyFor({})).toBe(10)
})
