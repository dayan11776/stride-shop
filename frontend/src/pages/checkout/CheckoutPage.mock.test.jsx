import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/authStore'
import { useCartStore } from '@/features/cart/cartStore'
import { formatPeso } from '@/lib/format'
import { Component as CheckoutPage } from './CheckoutPage'
import { Component as ConfirmationPage } from './ConfirmationPage'

vi.mock('@/lib/apiClient', () => ({
  USE_MOCK: true,
  api: vi.fn(),
  payloadFrom: (data) => data?.data ?? data,
  listFrom: (data) => Array.isArray(data) ? data : data?.results ?? data?.items ?? data?.data ?? [],
}))

beforeEach(() => {
  useCartStore.getState().clear()
  useAuthStore.getState().setGuest()
})

test.each([[1000, 1180], [3600, 3600]])('mock guest COD confirmation shows the numeric total for a ₱%s subtotal', async (price, expectedTotal) => {
  useCartStore.getState().add(
    { id: 'runner', name: 'Runner', brand: 'STRIDE', price, image: '/shoe.jpg' },
    40, 1, { id: 'black-40', colorName: 'Black', width: 'regular', currentPrice: price, available: 5 },
  )
  render(<MemoryRouter initialEntries={['/checkout']}><Routes>
    <Route path="/checkout" element={<CheckoutPage />} />
    <Route path="/order-confirmation/:orderNumber" element={<ConfirmationPage />} />
  </Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'buyer@example.test' } })
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Buyer' } })
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '09171234567' } })
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: '1 Test Road' } })
  fireEvent.change(screen.getByLabelText('City / municipality'), { target: { value: 'Manila' } })
  fireEvent.change(screen.getByLabelText('Province'), { target: { value: 'Metro Manila' } })
  fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '1000' } })
  fireEvent.click(screen.getByLabelText(/Cash on delivery/))
  fireEvent.submit(screen.getByRole('button', { name: /Place order/i }).closest('form'))
  expect(await screen.findByText('You are all set.')).toBeTruthy()
  expect(screen.getByText(formatPeso(expectedTotal))).toBeTruthy()
  expect(screen.queryByText(/NaN/)).toBeNull()
  expect(screen.getByRole('link', { name: 'Get help with this order' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Track your order' })).toBeNull()
  expect(useCartStore.getState().items).toHaveLength(0)
})
