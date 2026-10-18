import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test } from 'vitest'
import { useCartStore } from '@/features/cart/cartStore'
import { Component } from './CartPage'

const product = { id: 'runner', slug: 'runner', name: 'Runner', brand: 'STRIDE', price: 1000, image: '/runner.jpg' }

beforeEach(() => useCartStore.getState().clear())

function showCart(image = product.image) {
  useCartStore.getState().add({ ...product, image }, 40)
  return render(<MemoryRouter><Component /></MemoryRouter>)
}

test('uses a neutral fallback if a saved cart image cannot load', () => {
  showCart()
  const image = screen.getByAltText('Runner')
  expect(image.className).toContain('object-contain')
  fireEvent.error(image)
  expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
})

test('uses a neutral fallback when no cart image is supplied', () => {
  showCart('  ')
  expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
})

test('uses singular and plural labels for the number of cart styles', () => {
  showCart()
  expect(screen.getByText('Your bag · 1 style')).toBeTruthy()
  act(() => useCartStore.getState().add({ ...product, id: 'second', name: 'Second' }, 41))
  expect(screen.getByText('Your bag · 2 styles')).toBeTruthy()
})
