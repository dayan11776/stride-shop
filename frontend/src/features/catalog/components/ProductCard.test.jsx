import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { ProductCard } from './ProductCard'

const product = {
  id: 'runner', slug: 'runner', name: 'Runner', brand: 'STRIDE',
  image: '/runner.jpg', price: 1000,
}

function showCard(availableQuantity, isExampleStock = false) {
  return render(<MemoryRouter><ProductCard product={{ ...product, availableQuantity, isExampleStock }} /></MemoryRouter>)
}

describe('product card stock', () => {
  test('shows the total pairs available across product options', () => {
    showCard(12)
    expect(screen.getByText('12 pairs available in total')).toBeTruthy()
  })

  test('shows zero without presenting it as missing stock information', () => {
    showCard(0)
    expect(screen.getByText('0 pairs available in total')).toBeTruthy()
  })

  test('uses the singular label for one pair', () => {
    showCard(1)
    expect(screen.getByText('1 pair available in total')).toBeTruthy()
  })

  test('does not invent a quantity when stock data is unavailable', () => {
    showCard(undefined)
    expect(screen.getByText('Stock information unavailable')).toBeTruthy()
  })

  test('clearly labels example stock as unverified, including zero', () => {
    showCard(0, true)
    expect(screen.getByText('Example stock: 0 pairs (not verified)')).toBeTruthy()
  })

  test('still marks example stock as unverified when its quantity is missing', () => {
    showCard(undefined, true)
    expect(screen.getByText('Example stock: quantity unavailable (not verified)')).toBeTruthy()
  })
})

describe('product card images', () => {
  test('uses a neutral placeholder for an empty image URL', () => {
    render(<MemoryRouter><ProductCard product={{ ...product, image: '   ' }} /></MemoryRouter>)
    expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
  })

  test('labels the normalized placeholder as unavailable too', () => {
    render(<MemoryRouter><ProductCard product={{ ...product, image: '/images/product-placeholder.svg' }} /></MemoryRouter>)
    expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
  })

  test('uses the product image when one is supplied', () => {
    render(<MemoryRouter><ProductCard product={product} /></MemoryRouter>)
    expect(screen.getByAltText('Runner').getAttribute('src')).toBe('/runner.jpg')
  })

  test('falls back when an image fails and tries a different image if the product changes', () => {
    const { rerender } = render(<MemoryRouter><ProductCard product={product} /></MemoryRouter>)
    fireEvent.error(screen.getByAltText('Runner'))
    expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
    rerender(<MemoryRouter><ProductCard product={{ ...product, image: '/new-runner.jpg' }} /></MemoryRouter>)
    expect(screen.getByAltText('Runner').getAttribute('src')).toBe('/new-runner.jpg')
  })
})
