import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { useProduct } from '@/features/catalog/hooks'
import { useCartStore, selectSubtotal } from '@/features/cart/cartStore'
import { Component } from './ProductPage'

vi.mock('@/features/catalog/hooks', () => ({ useProduct: vi.fn() }))

const product = {
  id: 'runner', slug: 'runner', name: 'Runner', brand: 'STRIDE', image: '/runner.jpg',
  price: 1000, salePrice: null,
  variants: [
    { id: 'sage-40', colorName: 'Sage', sizeEu: '40.0', width: 'regular', price: '1000', currentPrice: 1000, available: 3, isActive: true },
    { id: 'black-40', colorName: 'Black', sizeEu: '40.0', width: 'regular', price: '1790.50', currentPrice: 1790.5, available: 2, isActive: true },
    { id: 'black-41', colorName: 'Black', sizeEu: '41.0', width: 'regular', price: '1000', currentPrice: 1000, available: 0, isActive: true },
    { id: 'blue-40', colorName: 'Blue', sizeEu: '40.0', width: 'regular', price: '1000', currentPrice: 1000, available: 2, isActive: false },
  ],
}

beforeEach(() => {
  useCartStore.getState().clear()
  useProduct.mockReturnValue({ data: product, isLoading: false, isError: false })
})

function showProduct() {
  return render(<MemoryRouter initialEntries={['/products/runner']}><Routes><Route path="/products/:slug" element={<Component />} /></Routes></MemoryRouter>)
}

test('selecting a colour and size adds the matching active variant and price', () => {
  showProduct()
  const colors = screen.getByRole('group', { name: 'Select colour' })
  expect(within(colors).queryByRole('button', { name: 'Blue' })).toBeNull()
  fireEvent.click(within(colors).getByRole('button', { name: 'Black' }))
  const sizes = screen.getByRole('group', { name: 'Select shoe size' })
  expect(within(sizes).queryByRole('button', { name: '41' })).toBeNull()
  fireEvent.click(within(sizes).getByRole('button', { name: '40' }))
  expect(screen.getByText(/1,790\.5/)).toBeTruthy()
  expect(screen.getByText('2 pairs available in this option.')).toBeTruthy()
  expect(screen.queryByText(/Example sizes and stock are not verified/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Add to bag/i }))
  expect(useCartStore.getState().items[0].variantId).toBe('black-40')
  expect(selectSubtotal(useCartStore.getState())).toBe(1790.5)
})

test('cannot add a live product when all variants are unavailable', () => {
  useProduct.mockReturnValue({ data: { ...product, variants: product.variants.filter((v) => v.available === 0 || !v.isActive) }, isLoading: false, isError: false })
  showProduct()
  expect(screen.getByText('No sizes are currently available.')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Add to bag/i }).disabled).toBe(true)
})

test('warns that example sizes and stock are unverified before and after selecting a size', () => {
  useProduct.mockReturnValue({ data: { ...product, isExampleStock: true }, isLoading: false, isError: false })
  showProduct()
  expect(screen.getByText('Example sizes and stock are not verified. Please confirm availability with the store.')).toBeTruthy()
  fireEvent.click(within(screen.getByRole('group', { name: 'Select shoe size' })).getByRole('button', { name: '40' }))
  expect(screen.getByText('Example stock: 3 pairs for this option (not verified).')).toBeTruthy()
})

test('warns that the example price may still be charged', () => {
  useProduct.mockReturnValue({ data: { ...product, isExamplePrice: true }, isLoading: false, isError: false })
  showProduct()
  expect(screen.getByText(/Example price; not verified by the store/)).toBeTruthy()
})

test('uses the placeholder when a product image fails, and tries the next colour image', () => {
  useProduct.mockReturnValue({ data: { ...product, images: [
    { colorName: 'Sage', url: '/sage.jpg' },
    { colorName: 'Black', url: '/black.jpg' },
  ] }, isLoading: false, isError: false })
  const { container } = showProduct()
  expect(screen.getByAltText('Runner').getAttribute('src')).toBe('/sage.jpg')
  fireEvent.error(screen.getByAltText('Runner'))
  expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
  expect([...container.querySelectorAll('img')].every((img) => img.getAttribute('src') === '/images/product-placeholder.svg')).toBe(true)
  fireEvent.click(within(screen.getByRole('group', { name: 'Select colour' })).getByRole('button', { name: 'Black' }))
  expect(screen.getByAltText('Runner').getAttribute('src')).toBe('/black.jpg')
})

test('shows each supplied gallery photo once and hides failed extra photos', () => {
  useProduct.mockReturnValue({ data: { ...product, images: [
    { colorName: 'Sage', url: '/sage.jpg' },
    { colorName: 'Sage', url: '/sage-side.jpg', altText: 'Runner side view' },
    { colorName: 'Sage', url: '/sage-side.jpg' },
    { colorName: 'Black', url: '/black.jpg' },
  ] }, isLoading: false, isError: false })
  const { container } = showProduct()
  expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual(['/sage.jpg', '/sage-side.jpg'])
  fireEvent.error(screen.getByAltText('Runner side view'))
  expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual(['/sage.jpg'])
  fireEvent.click(within(screen.getByRole('group', { name: 'Select colour' })).getByRole('button', { name: 'Black' }))
  expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual(['/black.jpg'])
})

test('does not duplicate a missing product-image placeholder', () => {
  useProduct.mockReturnValue({ data: { ...product, image: '', images: [] }, isLoading: false, isError: false })
  const { container } = showProduct()
  expect(container.querySelectorAll('img')).toHaveLength(1)
  expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
})

test('reports the actual amount added and warns when the bag is already at the stock limit', () => {
  showProduct()
  fireEvent.click(within(screen.getByRole('group', { name: 'Select shoe size' })).getByRole('button', { name: '40' }))
  fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
  fireEvent.click(screen.getByRole('button', { name: /Add to bag/i }))
  expect(useCartStore.getState().items[0].qty).toBe(2)
  fireEvent.click(screen.getByRole('button', { name: /Add to bag/i }))
  expect(useCartStore.getState().items[0].qty).toBe(3)
  expect(screen.getByRole('status').textContent).toMatch(/1 pair was added/)
  fireEvent.click(screen.getByRole('button', { name: /Add to bag/i }))
  expect(useCartStore.getState().items[0].qty).toBe(3)
  expect(screen.getByRole('status').textContent).toMatch(/already contains the maximum/)
})

test('explains when a saved cart quantity is reduced to match newly fetched stock', () => {
  useCartStore.getState().add(product, 40, 5, { ...product.variants[0], available: 5 })
  showProduct()
  fireEvent.click(within(screen.getByRole('group', { name: 'Select shoe size' })).getByRole('button', { name: '40' }))
  fireEvent.click(screen.getByRole('button', { name: /Add to bag/i }))
  expect(useCartStore.getState().items[0].qty).toBe(3)
  expect(screen.getByRole('status').textContent).toMatch(/adjusted to the latest available stock/)
})
