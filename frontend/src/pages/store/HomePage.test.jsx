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

beforeEach(() => {
  useProducts.mockImplementation((filters) => ({ data: filters.isNew ? products : products, isLoading: false, isError: false, refetch: vi.fn() }))
})

function showHome() {
  return render(<MemoryRouter><Component /></MemoryRouter>)
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

test('brands carousel uses a matching product and an exact brand filter', () => {
  showHome()
  const section = screen.getByRole('region', { name: 'Shop by brand' })
  expect(within(section).getByRole('img', { name: 'Adidas Runner' }).getAttribute('src')).toBe('/adidas.jpg')
  expect(within(section).getByRole('link', { name: /shop this brand/i }).getAttribute('href')).toBe('/search?brand=ADIDAS')
  for (let count = 0; count < 4; count += 1) fireEvent.click(within(section).getByRole('button', { name: 'Next brand' }))
  expect(within(section).getByRole('img', { name: 'On Kids' }).getAttribute('src')).toBe('/on.jpg')
  expect(within(section).getByRole('link', { name: /shop this brand/i }).getAttribute('href')).toBe('/search?brand=ON')
  fireEvent.click(within(section).getByRole('button', { name: 'Next brand' }))
  expect(within(section).getByText('Products coming soon')).toBeTruthy()
  expect(within(section).getByRole('img', { name: /illustrative shoe/i })).toBeTruthy()
  expect(within(section).getByText('Illustrative shoe image')).toBeTruthy()
})

test('shows an honest fallback when a catalog photo fails', () => {
  showHome()
  const spotlight = screen.getByRole('region', { name: 'New arrivals spotlight' })
  fireEvent.error(within(spotlight).getByRole('img', { name: 'Adidas Runner' }))
  expect(within(spotlight).getByRole('img', { name: /illustrative shoe/i }).getAttribute('src')).toBe('/images/illustration-runner.png')
  expect(within(spotlight).getByText('Illustrative shoe image')).toBeTruthy()
})

test('labels example pricing and generic homepage illustrations', () => {
  const arrival = { ...products[0], image: '', isExamplePrice: true }
  useProducts.mockImplementation(() => ({ data: [arrival], isLoading: false, isError: false, refetch: vi.fn() }))
  showHome()
  const spotlight = screen.getByRole('region', { name: 'New arrivals spotlight' })
  expect(within(spotlight).getByText('Example price; not verified.')).toBeTruthy()
  expect(within(spotlight).getByText('Illustrative shoe image')).toBeTruthy()
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
