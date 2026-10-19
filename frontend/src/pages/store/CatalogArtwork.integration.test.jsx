import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { useProducts } from '@/features/catalog/hooks'
import { Component as NewArrivalsPage } from './NewArrivalsPage'
import { Component as SearchPage } from './SearchPage'

// Keep the real page, catalog, artwork mapping, and product cards in this test.
// Only the network-backed hook is replaced so we can exercise the routing behavior.
vi.mock('@/features/catalog/hooks', () => ({ useProducts: vi.fn() }))

const products = [
  {
    id: 'sample',
    slug: 'example-20261018-asics-novablast-6-1011c243-403',
    name: 'Example ASICS NOVABLAST 6',
    brand: 'ASICS',
    price: 9490,
    image: '/images/product-placeholder.svg',
    isNew: true,
  },
  {
    id: 'photo',
    slug: 'example-adidas-tokyo-ih6639',
    name: 'Adidas Tokyo with a genuine photo',
    brand: 'adidas',
    price: 5500,
    image: '/verified-tokyo.jpg',
    isNew: true,
  },
  {
    id: 'unknown',
    slug: 'unrecognized-new-shoe',
    name: 'Unrecognized shoe',
    brand: 'ASICS',
    price: 1000,
    image: '',
    isNew: true,
  },
]

beforeEach(() => {
  useProducts.mockImplementation(() => ({ data: products, isLoading: false, isError: false, refetch: vi.fn() }))
})

function renderPage(Page, url) {
  return render(<MemoryRouter initialEntries={[url]}><Page /></MemoryRouter>)
}

function productCard(name) {
  return screen.getByRole('link', { name: `View ${name}` }).closest('article')
}

function expectIllustration(name, imagePath) {
  const card = within(productCard(name))
  expect(card.getByAltText(`Illustration, not the actual product: ${name}`).getAttribute('src')).toBe(imagePath)
  expect(card.getByText('Illustration — not actual product')).toBeTruthy()
}

function expectPlaceholder(name) {
  const card = within(productCard(name))
  expect(card.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
  expect(card.queryByText('Illustration — not actual product')).toBeNull()
}

test('new arrivals show a disclosed illustration for a known sample and keep unknown products neutral', () => {
  renderPage(NewArrivalsPage, '/new-arrivals')
  expect(useProducts).toHaveBeenCalledWith({ isNew: true })
  expectIllustration('Example ASICS NOVABLAST 6', '/images/arrival-blue-runner.webp')
  expectPlaceholder('Unrecognized shoe')
})

test('an actual product photo takes priority over a known illustration on new arrivals', () => {
  renderPage(NewArrivalsPage, '/new-arrivals')
  const card = within(productCard('Adidas Tokyo with a genuine photo'))
  expect(card.getByAltText('Adidas Tokyo with a genuine photo').getAttribute('src')).toBe('/verified-tokyo.jpg')
  expect(card.queryByText('Illustration — not actual product')).toBeNull()
})

test('brand search shows disclosed artwork for a known sample', () => {
  renderPage(SearchPage, '/search?brand=ASICS')
  expect(useProducts).toHaveBeenCalledWith({ brand: 'ASICS' })
  expectIllustration('Example ASICS NOVABLAST 6', '/images/arrival-blue-runner.webp')
  expectPlaceholder('Unrecognized shoe')
})

test('brand plus keyword search retains its brand filter and disclosed artwork', () => {
  renderPage(SearchPage, '/search?brand=ASICS&q=runner')
  expect(useProducts).toHaveBeenCalledWith({ brand: 'ASICS', q: 'runner' })
  expectIllustration('Example ASICS NOVABLAST 6', '/images/arrival-blue-runner.webp')
})

test('ordinary unfiltered search does not add illustrations to missing product photos', () => {
  renderPage(SearchPage, '/search?q=runner')
  expect(useProducts).toHaveBeenCalledWith({ q: 'runner' })
  expectPlaceholder('Example ASICS NOVABLAST 6')
  expectPlaceholder('Unrecognized shoe')
  const card = within(productCard('Adidas Tokyo with a genuine photo'))
  expect(card.getByAltText('Adidas Tokyo with a genuine photo').getAttribute('src')).toBe('/verified-tokyo.jpg')
})
