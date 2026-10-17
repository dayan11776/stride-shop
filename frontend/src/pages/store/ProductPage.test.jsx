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
