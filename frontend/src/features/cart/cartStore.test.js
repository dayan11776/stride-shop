import { useCartStore, selectCount, selectSubtotal } from './cartStore'
const shoe = { id: 1, price: 1000, salePrice: 800 }
beforeEach(() => useCartStore.getState().clear())
test('adding the same size twice merges the line', () => {
  const { add } = useCartStore.getState()
  add(shoe, 9); add(shoe, 9)
  expect(useCartStore.getState().items).toHaveLength(1)
  expect(selectCount(useCartStore.getState())).toBe(2)
})
test('subtotal uses the sale price', () => {
  useCartStore.getState().add(shoe, 9, 2)
  expect(selectSubtotal(useCartStore.getState())).toBe(1600)
})
test('clearing the bag also clears the saved promo code', () => {
  useCartStore.getState().add(shoe, 9)
  useCartStore.getState().setPromoCode('STRIDE10')
  useCartStore.getState().clear()
  expect(useCartStore.getState().items).toEqual([])
  expect(useCartStore.getState().promoCode).toBe('')
})
