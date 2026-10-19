import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { ProductCard } from './ProductCard'

const product = {
  id: 'runner', slug: 'runner', name: 'Runner', brand: 'STRIDE',
  image: '/runner.jpg', price: 1000,
}

const offCenterAdidasPhoto = 'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/56a1beb6b9614eb8bc244d5d6e65edf2_9366/GALAXY_8_RUNNING_SHOES_Blue_KI7977_HM1.jpg'

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
  test('re-centers the known off-center Adidas photo', () => {
    render(<MemoryRouter><ProductCard product={{ ...product, image: offCenterAdidasPhoto }} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'View Runner' }).className).toContain('tileRecenteredPhoto')
  })

  test.each([
    'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/56a1beb6b9614eb8bc244d5d6e65edf2_9366/GALAXY_8_RUNNING_SHOES_Blue_KI7977_HM2.jpg',
    'https://example.com/images/w_500%2Cf_auto%2Cq_auto/56a1beb6b9614eb8bc244d5d6e65edf2_9366/GALAXY_8_RUNNING_SHOES_Blue_KI7977_HM1.jpg',
  ])('does not re-center an unrecognized, similarly named photo: %s', (image) => {
    render(<MemoryRouter><ProductCard product={{ ...product, image }} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'View Runner' }).className).not.toContain('tileRecenteredPhoto')
  })

  test('removes the centering adjustment when the known photo fails and artwork is shown', () => {
    render(<MemoryRouter><ProductCard product={{ ...product, image: offCenterAdidasPhoto }} artwork="/artwork.webp" /></MemoryRouter>)
    const tile = screen.getByRole('link', { name: 'View Runner' })
    expect(tile.className).toContain('tileRecenteredPhoto')
    fireEvent.error(screen.getByAltText('Runner'))
    expect(screen.getByAltText('Illustration, not the actual product: Runner').getAttribute('src')).toBe('/artwork.webp')
    expect(screen.getByText('Illustration — not actual product')).toBeTruthy()
    expect(tile.className).not.toContain('tileRecenteredPhoto')
  })

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
    expect(screen.queryByText('Illustration — not actual product')).toBeNull()
  })

  test('displays approved artwork with a visible disclosure when the photo is missing', () => {
    render(<MemoryRouter><ProductCard product={{ ...product, image: '/images/product-placeholder.svg' }} artwork="/artwork.webp" /></MemoryRouter>)
    expect(screen.getByAltText('Illustration, not the actual product: Runner').getAttribute('src')).toBe('/artwork.webp')
    expect(screen.getByText('Illustration — not actual product')).toBeTruthy()
  })

  test('prefers a product photo over artwork and discloses the artwork if the photo fails', () => {
    const { rerender } = render(<MemoryRouter><ProductCard product={product} artwork="/artwork.webp" /></MemoryRouter>)
    expect(screen.getByAltText('Runner').getAttribute('src')).toBe('/runner.jpg')
    expect(screen.queryByText('Illustration — not actual product')).toBeNull()
    fireEvent.error(screen.getByAltText('Runner'))
    expect(screen.getByAltText('Illustration, not the actual product: Runner').getAttribute('src')).toBe('/artwork.webp')
    expect(screen.getByText('Illustration — not actual product')).toBeTruthy()
    rerender(<MemoryRouter><ProductCard product={{ ...product, image: '/new-runner.jpg' }} artwork="/artwork.webp" /></MemoryRouter>)
    expect(screen.getByAltText('Runner').getAttribute('src')).toBe('/new-runner.jpg')
    expect(screen.queryByText('Illustration — not actual product')).toBeNull()
  })

  test('uses the neutral placeholder and removes the disclosure if the artwork fails', () => {
    render(<MemoryRouter><ProductCard product={{ ...product, image: '' }} artwork="/artwork.webp" /></MemoryRouter>)
    fireEvent.error(screen.getByAltText('Illustration, not the actual product: Runner'))
    expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
    expect(screen.queryByText('Illustration — not actual product')).toBeNull()
  })

  test('tries a different artwork URL if the prior artwork fails', () => {
    const { rerender } = render(<MemoryRouter><ProductCard product={{ ...product, image: '' }} artwork="/old-artwork.webp" /></MemoryRouter>)
    fireEvent.error(screen.getByAltText('Illustration, not the actual product: Runner'))
    rerender(<MemoryRouter><ProductCard product={{ ...product, image: '' }} artwork="/new-artwork.webp" /></MemoryRouter>)
    expect(screen.getByAltText('Illustration, not the actual product: Runner').getAttribute('src')).toBe('/new-artwork.webp')
    expect(screen.getByText('Illustration — not actual product')).toBeTruthy()
  })

  test('falls back when an image fails and tries a different image if the product changes', () => {
    const { rerender } = render(<MemoryRouter><ProductCard product={product} /></MemoryRouter>)
    fireEvent.error(screen.getByAltText('Runner'))
    expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
    rerender(<MemoryRouter><ProductCard product={{ ...product, image: '/new-runner.jpg' }} /></MemoryRouter>)
    expect(screen.getByAltText('Runner').getAttribute('src')).toBe('/new-runner.jpg')
  })
})

test('identifies example prices separately from example stock', () => {
  render(<MemoryRouter><ProductCard product={{ ...product, isExamplePrice: true }} /></MemoryRouter>)
  expect(screen.getByText('Example price; not verified by the store.')).toBeTruthy()
})
