import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { useProducts } from '@/features/catalog/hooks'
import { Component as HomePage } from './HomePage'
import { Component as NewArrivalsPage } from './NewArrivalsPage'
import { Component as SearchPage } from './SearchPage'
import { Component as CategoryPage } from './CategoryPage'
import { Component as ShopPage } from './ShopPage'

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
  useProducts.mockClear()
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

function renderCategoryPage(audience) {
  // CategoryPage reads the audience from a data-router route handle.
  const router = createMemoryRouter(
    ['men', 'women', 'kids'].map((category) => ({
      path: `/${category}`,
      element: <CategoryPage />,
      handle: { audience: category },
    })),
    { initialEntries: [`/${audience}`] },
  )
  return render(<RouterProvider router={router} />)
}

test('View all shoes shows mapped artwork with disclosure and preserves photo and fallback behavior', async () => {
  const router = createMemoryRouter(
    [
      { path: '/', element: <HomePage /> },
      { path: '/shop', element: <ShopPage /> },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)

  fireEvent.click(screen.getByRole('link', { name: /view all shoes/i }))
  await screen.findByRole('heading', { level: 1, name: 'All shoes' })
  expect(router.state.location.pathname).toBe('/shop')
  expect(useProducts).toHaveBeenLastCalledWith({})

  expectIllustration('Example ASICS NOVABLAST 6', '/images/arrival-blue-runner.webp')
  expectPlaceholder('Unrecognized shoe')

  const card = within(productCard('Adidas Tokyo with a genuine photo'))
  expect(card.getByAltText('Adidas Tokyo with a genuine photo').getAttribute('src')).toBe('/verified-tokyo.jpg')
  expect(card.queryByText('Illustration — not actual product')).toBeNull()

  fireEvent.error(card.getByAltText('Adidas Tokyo with a genuine photo'))
  expectIllustration('Adidas Tokyo with a genuine photo', '/images/illustration-runner.webp')

  fireEvent.error(card.getByAltText('Illustration, not the actual product: Adidas Tokyo with a genuine photo'))
  expectPlaceholder('Adidas Tokyo with a genuine photo')
})

test.each([
  ['men', 'example-adidas-gazelle-men-reference', '/images/arrival-retro.webp'],
  ['women', 'example-adidas-handball-spezial-women-reference', '/images/illustration-casual.webp'],
  ['kids', 'example-adidas-sl-72-rs-kids-reference', '/images/illustration-kids.webp'],
])('%s category displays disclosed artwork while preserving genuine photos and unknown placeholders', (audience, slug, imagePath) => {
  const sampleName = `Example ${audience} shoe`
  useProducts.mockReturnValue({
    data: [{ ...products[0], slug, name: sampleName }, products[1], products[2]],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })

  renderCategoryPage(audience)
  expect(screen.getByRole('heading', { level: 1, name: audience })).toBeTruthy()
  expect(useProducts).toHaveBeenCalledWith({ audience })
  expectIllustration(sampleName, imagePath)
  expectPlaceholder('Unrecognized shoe')

  const card = within(productCard('Adidas Tokyo with a genuine photo'))
  expect(card.getByAltText('Adidas Tokyo with a genuine photo').getAttribute('src')).toBe('/verified-tokyo.jpg')
  expect(card.queryByText('Illustration — not actual product')).toBeNull()

  // A broken genuine photo may fall back, but the illustration must be labeled.
  fireEvent.error(card.getByAltText('Adidas Tokyo with a genuine photo'))
  expectIllustration('Adidas Tokyo with a genuine photo', '/images/illustration-runner.webp')
})

test('Men keeps its product cards, prices, and verified stock while hiding example price and stock metadata', () => {
  const exampleMenShoe = {
    ...products[0],
    slug: 'example-men-runner',
    name: 'Example Men Runner',
    price: 6490,
    isExamplePrice: true,
    isExampleStock: true,
    availableQuantity: 8,
  }
  const verifiedMenShoe = {
    ...products[1],
    slug: 'verified-men-runner',
    name: 'Verified Men Runner',
    price: 5290,
    availableQuantity: 7,
  }
  useProducts.mockReturnValue({
    data: [exampleMenShoe, verifiedMenShoe],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })

  renderCategoryPage('men')

  const exampleCard = within(productCard('Example Men Runner'))
  expect(exampleCard.getByText('₱6,490')).toBeTruthy()
  expect(exampleCard.queryByText('Example price; not verified by the store.')).toBeNull()
  expect(exampleCard.queryByText(/^Example stock:/)).toBeNull()
  expect(exampleCard.queryByText('8 pairs available in total')).toBeNull()

  const verifiedCard = within(productCard('Verified Men Runner'))
  expect(verifiedCard.getByText('₱5,290')).toBeTruthy()
  expect(verifiedCard.getByText('7 pairs available in total')).toBeTruthy()
})

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
