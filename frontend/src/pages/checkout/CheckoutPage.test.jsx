import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { useCartStore } from '@/features/cart/cartStore'
import { api } from '@/lib/apiClient'
import { Component, quoteSignature } from './CheckoutPage'

vi.mock('@/lib/apiClient', () => ({
  USE_MOCK: false,
  api: vi.fn(),
  payloadFrom: (data) => data?.data ?? data,
  listFrom: (data) => Array.isArray(data) ? data : data?.results ?? data?.items ?? data?.data ?? [],
}))

let remoteItems
let currentPrice

function makeQuote() {
  const subtotal = remoteItems.reduce((sum, item) => sum + currentPrice * item.quantity, 0)
  return {
    items: remoteItems.map((item) => ({ ...item, unitPrice: currentPrice, lineTotal: currentPrice * item.quantity })),
    subtotal, discountTotal: 100, shippingFee: 150, taxTotal: 0, grandTotal: subtotal + 50,
  }
}

beforeEach(() => {
  remoteItems = []
  currentPrice = 1700.5
  useCartStore.getState().clear()
  useCartStore.getState().add(
    { id: 'runner', name: 'Runner', brand: 'STRIDE', price: 800, image: '/shoe.jpg' },
    40, 1, { id: 'black-40', colorName: 'Black', width: 'regular', currentPrice: 1200, available: 5 },
  )
  useCartStore.getState().setPromoCode('STRIDE10')
  api.mockReset()
  api.mockImplementation(async (path, options = {}) => {
    if (path === '/csrf') return {}
    if (path === '/shipping-methods') return [{ id: 'ship', name: 'Standard', baseFee: 150 }]
    if (path === '/cart') return { items: remoteItems }
    if (path === '/cart/items' && options.method === 'POST') {
      remoteItems.push({ id: 'line-1', variant: { id: options.body.variantId }, quantity: options.body.quantity })
      return {}
    }
    if (path === '/cart/items/line-1' && options.method === 'PATCH') {
      remoteItems[0].quantity = options.body.quantity
      return {}
    }
    if (path === '/cart/promo') return {}
    if (path === '/checkout/quote') return makeQuote()
    if (path === '/checkout/create') {
      currentPrice = 2000
      throw Object.assign(new Error('The order total changed.'), { status: 400, body: { expectedTotal: ['The order total changed.'] } })
    }
    throw new Error(`Unexpected request: ${path}`)
  })
})

function showCheckout() {
  render(<MemoryRouter initialEntries={['/checkout']}><Component /></MemoryRouter>)
}

function completeAddress() {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'buyer@example.test' } })
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Buyer' } })
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '09171234567' } })
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: '1 Test Road' } })
  fireEvent.change(screen.getByLabelText('City / municipality'), { target: { value: 'Manila' } })
  fireEvent.change(screen.getByLabelText('Province'), { target: { value: 'Metro Manila' } })
  fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '1000' } })
  fireEvent.click(screen.getByLabelText(/Cash on delivery/))
}

test('shows the server quote for the selected variant, discount and delivery', async () => {
  showCheckout()
  expect(await screen.findByText(/1,750\.5/)).toBeTruthy()
  expect(screen.getByText(/Black · EU size 40/)).toBeTruthy()
  expect(screen.getAllByText(/1,700\.5/).length).toBeGreaterThan(0)
  expect(screen.getByText('Discount')).toBeTruthy()
  const add = api.mock.calls.find(([path, options]) => path === '/cart/items' && options.method === 'POST')
  expect(add[1].body).toEqual({ variantId: 'black-40', quantity: 1 })
})

test('warns before ordering when the cart has example pricing or stock', async () => {
  const item = useCartStore.getState().items[0]
  useCartStore.setState({ items: [{ ...item, product: { ...item.product, isExamplePrice: true } }] })
  showCheckout()
  expect(screen.getByText(/prices, sizes or stock are examples/i)).toBeTruthy()
  expect(await screen.findByText(/1,750\.5/)).toBeTruthy()
})

test('requires review when the server quote changes before order submission', async () => {
  showCheckout()
  await screen.findByText(/1,750\.5/)
  currentPrice = 2000
  completeAddress()
  fireEvent.submit(screen.getByRole('button', { name: /Place order/i }).closest('form'))
  expect(await screen.findByText(/price, discount or delivery cost changed/i)).toBeTruthy()
  expect(screen.getByText(/2,050/)).toBeTruthy()
  expect(api.mock.calls.some(([path]) => path === '/checkout/create')).toBe(false)
})

test('sends the quoted total and refreshes it if the server rejects a price race', async () => {
  showCheckout()
  await screen.findByText(/1,750\.5/)
  completeAddress()
  fireEvent.submit(screen.getByRole('button', { name: /Place order/i }).closest('form'))
  expect(await screen.findByText(/order total changed/i)).toBeTruthy()
  expect(screen.getByText(/2,050/)).toBeTruthy()
  const create = api.mock.calls.find(([path]) => path === '/checkout/create')
  expect(create[1].body.expectedTotal).toBe('1750.50')
})

test('quote comparison includes variant IDs, prices, quantities and totals', () => {
  const first = { items: [{ variant: { id: 'v1' }, quantity: 1, unitPrice: 500 }], subtotal: 500, discountTotal: 0, shippingFee: 100, taxTotal: 0, grandTotal: 600 }
  expect(quoteSignature({ ...first, items: [{ variant: { id: 'v2' }, quantity: 1, unitPrice: 500 }] })).not.toBe(quoteSignature(first))
  expect(quoteSignature({ ...first, shippingFee: 120, grandTotal: 620 })).not.toBe(quoteSignature(first))
})
