import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { useProducts } from '@/features/catalog/hooks'
import { Component } from './HomePage'

vi.mock('@/features/catalog/hooks', () => ({ useProducts: vi.fn() }))

const products = [
  { id: 'a', slug: 'adidas-runner', name: 'Adidas Runner', brand: 'adidas', audience: 'men', price: 3000, image: '/adidas.jpg', isNew: true },
  { id: 's', slug: 'stride-women', name: 'Stride Women', brand: 'STRIDE', audience: 'women', price: 2500, image: '/stride.jpg', isNew: true, isExampleStock: true },
  { id: 'o', slug: 'on-kids', name: 'On Kids', brand: 'ON', audience: 'kids', price: 2000, image: '/on.jpg', isNew: true },
]

// These are the actual ten example arrivals imported by the 2026-10-18 batch.
// They intentionally have no verified product photos in the catalog.
const arrivalSlugs = [
  'example-20261018-stride-daily-slip-on',
  'example-20261018-stride-kids-sprint',
  'example-20261018-asics-novablast-6-1011c243-403',
  'example-20261018-on-cloudboom-strike-2',
  'example-20261018-salomon-xt-6',
  'example-nike-air-force-1-07-cw2288-111',
  'example-adidas-tokyo-ih6639',
  'example-adidas-sl-72-rs-kids-reference',
  'example-puma-turino-ii-397452-02',
  'example-vans-mary-jane-leather-reference',
]
const illustrationDisclosure = /not (?:an? |the )?(?:actual |real )?product (?:photo|image)/i

beforeEach(() => {
  useProducts.mockImplementation(() => ({ data: products, isLoading: false, isError: false, refetch: vi.fn() }))
})

function showHome() {
  return render(<MemoryRouter><Component /></MemoryRouter>)
}

function spotlightImage(spotlight) {
  const image = spotlight.querySelector('.home-arrivals-image img')
  expect(image).toBeTruthy()
  return image
}

function brandImage(section) {
  const image = section.querySelector('.home-brand-image img')
  expect(image).toBeTruthy()
  return image
}

test('renders the approved sections and links collection tiles to the correct pages', () => {
  showHome()
  expect(screen.getByRole('heading', { name: /new arrivals/i, level: 1 })).toBeTruthy()
  expect(screen.getByRole('heading', { name: /find your stride/i })).toBeTruthy()
  expect(screen.getByRole('heading', { name: /^brands$/i })).toBeTruthy()
  expect(screen.queryByText(/trail ready/i)).toBeNull()
  expect(screen.getByRole('link', { name: /women explore category/i }).getAttribute('href')).toBe('/women')
  expect(screen.getByRole('link', { name: /^men explore category/i }).getAttribute('href')).toBe('/men')
  expect(screen.getByRole('link', { name: /kids explore category/i }).getAttribute('href')).toBe('/kids')
  expect(screen.getByRole('link', { name: /new arrivals explore category/i }).getAttribute('href')).toBe('/new-arrivals')
})

test('collection tiles use approved isolated artwork instead of rectangular catalog photos or image badges', () => {
  showHome()
  const tiles = [
    [/women explore category/i, '/images/illustration-casual.webp'],
    [/^men explore category/i, '/images/illustration-runner.webp'],
    [/kids explore category/i, '/images/illustration-kids.webp'],
    [/new arrivals explore category/i, '/images/arrival-sage-runner.webp'],
  ]
  for (const [name, source] of tiles) {
    const tile = screen.getByRole('link', { name })
    const image = tile.querySelector('img')
    expect(image).toBeTruthy()
    expect(image.getAttribute('src')).toBe(source)
    expect(within(tile).queryByText('Illustrative shoe image')).toBeNull()
  }
  expect(screen.queryByText('Illustrative shoe image')).toBeNull()
})

test('new-arrival controls select and wrap products while keeping the correct product link', () => {
  showHome()
  const spotlight = screen.getByRole('region', { name: 'New arrivals spotlight' })
  expect(within(spotlight).getByRole('link', { name: /view product/i }).getAttribute('href')).toBe('/products/adidas-runner')
  fireEvent.click(within(spotlight).getByRole('button', { name: 'Next new arrival' }))
  expect(within(spotlight).getByText('Stride Women')).toBeTruthy()
  expect(within(spotlight).getByText(/example stock; confirm availability/i)).toBeTruthy()
  expect(within(spotlight).getByRole('link', { name: /view product/i }).getAttribute('href')).toBe('/products/stride-women')
  fireEvent.click(within(spotlight).getByRole('button', { name: 'Show On Kids, 3 of 3' }))
  fireEvent.click(within(spotlight).getByRole('button', { name: 'Next new arrival' }))
  expect(within(spotlight).getByText('Adidas Runner')).toBeTruthy()
})

test('ten example arrivals have distinct editorial images that remain stable when the list is reordered', () => {
  const arrivals = arrivalSlugs.map((slug, index) => ({
    id: slug, slug, name: `Example shoe ${index + 1}`, brand: 'STRIDE', audience: 'men',
    image: '/images/product-placeholder.svg', price: 1000, isNew: true,
  }))
  let currentArrivals = arrivals
  useProducts.mockImplementation((filters) => ({ data: filters.isNew ? currentArrivals : products, isLoading: false, isError: false, refetch: vi.fn() }))
  const rendered = showHome()
  const spotlight = screen.getByRole('region', { name: 'New arrivals spotlight' })
  const imageBySlug = new Map()

  for (let count = 0; count < arrivals.length; count += 1) {
    const slug = within(spotlight).getByRole('link', { name: /view product/i }).getAttribute('href').split('/').pop()
    const image = spotlightImage(spotlight)
    expect(image.getAttribute('src')).not.toBe('/images/product-placeholder.svg')
    expect(`${image.getAttribute('alt')} ${spotlight.textContent}`).toMatch(illustrationDisclosure)
    imageBySlug.set(slug, image.getAttribute('src'))
    fireEvent.click(within(spotlight).getByRole('button', { name: 'Next new arrival' }))
  }
  expect(imageBySlug.size).toBe(10)
  expect(new Set(imageBySlug.values()).size).toBe(10)

  currentArrivals = [...arrivals].reverse()
  rendered.rerender(<MemoryRouter><Component /></MemoryRouter>)
  for (let count = 0; count < arrivals.length; count += 1) {
    const slug = within(spotlight).getByRole('link', { name: /view product/i }).getAttribute('href').split('/').pop()
    expect(spotlightImage(spotlight).getAttribute('src')).toBe(imageBySlug.get(slug))
    fireEvent.click(within(spotlight).getByRole('button', { name: 'Next new arrival' }))
  }
})

test('all ten new arrivals remain reachable beyond the four visible thumbnails', () => {
  const arrivals = Array.from({ length: 10 }, (_, index) => ({
    id: `shoe-${index + 1}`, slug: `shoe-${index + 1}`, name: `Shoe ${index + 1}`,
    brand: 'STRIDE', audience: 'men', image: `/shoe-${index + 1}.jpg`, price: 1000,
  }))
  useProducts.mockImplementation(() => ({ data: arrivals, isLoading: false, isError: false, refetch: vi.fn() }))
  showHome()
  const spotlight = screen.getByRole('region', { name: 'New arrivals spotlight' })
  for (let count = 0; count < 9; count += 1) fireEvent.click(within(spotlight).getByRole('button', { name: 'Next new arrival' }))
  expect(within(spotlight).getByText('Shoe 10')).toBeTruthy()
  expect(within(spotlight).getByRole('link', { name: /view product/i }).getAttribute('href')).toBe('/products/shoe-10')
  expect(within(spotlight).getByRole('button', { name: 'Show Shoe 10, 10 of 10' }).getAttribute('aria-pressed')).toBe('true')
})

test('a real arrival product photo takes priority over editorial artwork', () => {
  const arrival = { ...products[0], slug: arrivalSlugs[0], image: '/actual-product-photo.jpg' }
  useProducts.mockImplementation(() => ({ data: [arrival], isLoading: false, isError: false, refetch: vi.fn() }))
  showHome()
  const image = spotlightImage(screen.getByRole('region', { name: 'New arrivals spotlight' }))
  expect(image.getAttribute('src')).toBe('/actual-product-photo.jpg')
  expect(image.getAttribute('alt')).toBe(arrival.name)
})

test('brands carousel uses editorial images rather than catalog photos and exact brand filters', () => {
  showHome()
  const section = screen.getByRole('region', { name: 'Shop by brand' })
  expect(within(section).getByText('ADIDAS', { selector: '.home-brand-label' })).toBeTruthy()
  expect(brandImage(section).getAttribute('src')).not.toBe('/adidas.jpg')
  expect(brandImage(section).getAttribute('src')).toMatch(/^\/images\/.*\.webp$/)
  expect(`${brandImage(section).getAttribute('alt')} ${section.textContent}`).toMatch(illustrationDisclosure)
  expect(within(section).getByRole('link', { name: /shop this brand/i }).getAttribute('href')).toBe('/search?brand=ADIDAS')
  for (let count = 0; count < 4; count += 1) fireEvent.click(within(section).getByRole('button', { name: 'Next brand' }))
  expect(within(section).getByText('ON', { selector: '.home-brand-label' })).toBeTruthy()
  expect(brandImage(section).getAttribute('src')).not.toBe('/on.jpg')
  expect(`${brandImage(section).getAttribute('alt')} ${section.textContent}`).toMatch(illustrationDisclosure)
  expect(within(section).getByRole('link', { name: /shop this brand/i }).getAttribute('href')).toBe('/search?brand=ON')
  fireEvent.click(within(section).getByRole('button', { name: 'Next brand' }))
  expect(within(section).getByText('Products coming soon')).toBeTruthy()
  expect(`${brandImage(section).getAttribute('alt')} ${section.textContent}`).toMatch(illustrationDisclosure)
})

test('each brand slide has a distinct image and the carousel wraps', () => {
  showHome()
  const section = screen.getByRole('region', { name: 'Shop by brand' })
  const sources = new Set()
  for (let count = 0; count < 12; count += 1) {
    sources.add(brandImage(section).getAttribute('src'))
    fireEvent.click(within(section).getByRole('button', { name: 'Next brand' }))
  }
  expect(sources.size).toBe(12)
  expect(within(section).getByText('ADIDAS', { selector: '.home-brand-label' })).toBeTruthy()
})

test('shows an honest editorial fallback when a catalog photo fails', () => {
  showHome()
  const spotlight = screen.getByRole('region', { name: 'New arrivals spotlight' })
  const original = spotlightImage(spotlight)
  expect(original.getAttribute('src')).toBe('/adidas.jpg')
  fireEvent.error(original)
  const fallback = spotlightImage(spotlight)
  expect(fallback.getAttribute('src')).not.toBe('/adidas.jpg')
  expect(`${fallback.getAttribute('alt')} ${spotlight.textContent}`).toMatch(illustrationDisclosure)
  expect(within(spotlight).queryByText('Illustrative shoe image')).toBeNull()
})

test('labels example pricing and truthfully describes editorial arrival images', () => {
  const arrival = { ...products[0], image: '', isExamplePrice: true }
  useProducts.mockImplementation(() => ({ data: [arrival], isLoading: false, isError: false, refetch: vi.fn() }))
  showHome()
  const spotlight = screen.getByRole('region', { name: 'New arrivals spotlight' })
  expect(within(spotlight).getByText('Example price; not verified.')).toBeTruthy()
  expect(`${spotlightImage(spotlight).getAttribute('alt')} ${spotlight.textContent}`).toMatch(illustrationDisclosure)
  expect(within(spotlight).queryByText('Illustrative shoe image')).toBeNull()
})

test('shows empty and retry states when products cannot be loaded', () => {
  const retry = vi.fn()
  useProducts.mockImplementation((filters) => filters.isNew
    ? { data: [], isLoading: false, isError: false }
    : { data: [], isLoading: false, isError: true, refetch: retry })
  showHome()
  expect(screen.getByText('New arrivals are on their way.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /products unavailable · try again/i }))
  expect(retry).toHaveBeenCalledOnce()
})

test('retries when the new-arrivals request fails', () => {
  const retry = vi.fn()
  useProducts.mockImplementation((filters) => filters.isNew
    ? { data: [], isLoading: false, isError: true, refetch: retry }
    : { data: products, isLoading: false, isError: false, refetch: vi.fn() })
  showHome()
  const spotlight = screen.getByRole('region', { name: 'New arrivals spotlight' })
  expect(within(spotlight).getByText('New arrivals could not be loaded.')).toBeTruthy()
  fireEvent.click(within(spotlight).getByRole('button', { name: 'Try again' }))
  expect(retry).toHaveBeenCalledOnce()
})
