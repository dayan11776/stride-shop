import { useCartStore, selectCount, selectSubtotal, priceForItem } from './cartStore'
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

test('different colours in the same size are separate cart lines at their own prices', () => {
  const product = { id: 'runner', price: 1000, salePrice: 800 }
  const sage = { id: 'sage-40', colorName: 'Sage', sizeEu: '40.0', available: 5, currentPrice: 1200 }
  const black = { id: 'black-40', colorName: 'Black', sizeEu: '40.0', available: 5, currentPrice: '1500.50' }
  useCartStore.getState().add(product, 40, 2, sage)
  useCartStore.getState().add(product, 40, 1, black)
  const state = useCartStore.getState()
  expect(state.items.map((item) => item.variantId)).toEqual(['sage-40', 'black-40'])
  expect(priceForItem(state.items[1])).toBe(1500.5)
  expect(selectSubtotal(state)).toBe(3900.5)
})

test('uses the backend current price even when a sale is scheduled', () => {
  const product = { id: 'p', price: 100, salePrice: 50 }
  const variant = { id: 'v', price: '200', salePrice: '150', currentPrice: 200 }
  expect(priceForItem({ product, variant })).toBe(200)
})
