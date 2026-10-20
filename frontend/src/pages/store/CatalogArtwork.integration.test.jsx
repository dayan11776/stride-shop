import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { useProducts } from '@/features/catalog/hooks'
import { Component as HomePage } from './HomePage'
import { Component as NewArrivalsPage } from './NewArrivalsPage'
import { Component as SearchPage } from './SearchPage'
import { Component as CategoryPage } from './CategoryPage'
import { Component as ShopPage } from './ShopPage'
import { CatalogPage } from '@/features/catalog/components/CatalogPage'

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

function expectMenArtwork(name, imagePath) {
  const element = productCard(name)
  const card = within(element)
  expect(card.getByAltText(`Illustration, not the actual product: ${name}`).getAttribute('src')).toBe(imagePath)
  expect(card.queryByText('Illustration — not actual product')).toBeNull()
  expect(element.className).toContain('menCard')
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
    // The Men route receives the complete product list so it can expose the
    // optional Unisex filter; preserve the route audience on these fixtures
    // so the selected Men default keeps the existing artwork assertions.
    data: [
      { ...products[0], audience, slug, name: sampleName },
      { ...products[1], audience },
      { ...products[2], audience },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })

  renderCategoryPage(audience)
  expect(screen.getByRole('heading', { level: 1, name: audience })).toBeTruthy()
  // The Men collection deliberately fetches Men and Unisex once so its local
  // filter controls can switch between those audiences. Other category pages
  // retain their narrower request.
  expect(useProducts).toHaveBeenCalledWith(audience === 'men' ? {} : { audience })
  if (audience === 'men') {
    expectMenArtwork(sampleName, imagePath)
    expectMenArtwork('Unrecognized shoe', '/images/illustration-runner.webp')
  } else {
    expectIllustration(sampleName, imagePath)
    expectPlaceholder('Unrecognized shoe')
  }

  const card = within(productCard('Adidas Tokyo with a genuine photo'))
  if (audience === 'men') {
    expectMenArtwork('Adidas Tokyo with a genuine photo', '/images/illustration-runner.webp')
  } else {
    expect(card.getByAltText('Adidas Tokyo with a genuine photo').getAttribute('src')).toBe('/verified-tokyo.jpg')
    expect(card.queryByText('Illustration — not actual product')).toBeNull()
  }

  if (audience !== 'men') {
    // A broken genuine photo may fall back, but the illustration must be labeled.
    fireEvent.error(card.getByAltText('Adidas Tokyo with a genuine photo'))
    expectIllustration('Adidas Tokyo with a genuine photo', '/images/illustration-runner.webp')
  }
})

test('Men keeps its product cards and prices while hiding example and stock metadata', () => {
  const exampleMenShoe = {
    ...products[0],
    audience: 'men',
    slug: 'example-men-runner',
    name: 'Example Men Runner',
    price: 6490,
    isExamplePrice: true,
    isExampleStock: true,
    availableQuantity: 8,
  }
  const verifiedMenShoe = {
    ...products[1],
    audience: 'men',
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
  expect(verifiedCard.queryByText('7 pairs available in total')).toBeNull()
})

const menFilterProducts = [
  {
    id: 'men-nike-42',
    slug: 'men-nike-42',
    name: 'Men Nike Runner',
    brand: 'NIKE',
    audience: 'men',
    sizes: [42],
    price: 6000,
    image: '/men-nike.jpg',
  },
  {
    id: 'men-adidas-40',
    slug: 'men-adidas-40',
    name: 'Men Adidas Court',
    brand: 'ADIDAS',
    audience: 'men',
    sizes: [40],
    price: 4500,
    image: '/men-adidas.jpg',
  },
  {
    id: 'unisex-nike-42',
    slug: 'unisex-nike-42',
    name: 'Unisex Nike Runner',
    brand: 'NIKE',
    audience: 'unisex',
    sizes: [42],
    price: 6200,
    image: '/unisex-nike.jpg',
  },
  {
    id: 'women-outside-men-catalog',
    slug: 'women-outside-men-catalog',
    name: 'Women Shoe Outside Men',
    brand: 'PUMA',
    audience: 'women',
    sizes: [39],
    price: 5000,
    image: '/women.jpg',
  },
]

function renderMenFilters() {
  useProducts.mockReturnValue({ data: menFilterProducts, isLoading: false, isError: false, refetch: vi.fn() })
  renderCategoryPage('men')
}

function expectVisibleProduct(name) {
  expect(screen.getByRole('link', { name: `View ${name}` })).toBeTruthy()
}

function expectHiddenProduct(name) {
  expect(screen.queryByRole('link', { name: `View ${name}` })).toBeNull()
}

function openFilterGroup(label) {
  const toggle = screen.getByRole('button', { name: label })
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
  return toggle
}

test('Men filters default to Men, expose selected chips, and clear back to the Men catalogue', () => {
  renderMenFilters()

  expect(useProducts).toHaveBeenCalledWith({})
  const [genderToggle, brandToggle, sizeToggle, priceToggle] = ['Gender', 'Brand', 'Size (EU)', 'Price'].map((label) => screen.getByRole('button', { name: label }))
  expect(genderToggle.getAttribute('aria-expanded')).toBe('false')
  expect(brandToggle.getAttribute('aria-expanded')).toBe('false')
  expect(sizeToggle.getAttribute('aria-expanded')).toBe('false')
  expect(priceToggle.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('checkbox', { name: 'Men' })).toBeNull()
  fireEvent.click(genderToggle)
  expect(genderToggle.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('checkbox', { name: 'Men' }).checked).toBe(true)
  expect(screen.getByRole('checkbox', { name: 'Unisex' }).checked).toBe(false)
  expect(screen.getByRole('combobox', { name: 'Sort products' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Remove Men filter' })).toBeNull()
  expectVisibleProduct('Men Nike Runner')
  expectVisibleProduct('Men Adidas Court')
  expectHiddenProduct('Unisex Nike Runner')
  expectHiddenProduct('Women Shoe Outside Men')

  openFilterGroup('Brand')
  expect(genderToggle.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(screen.getByRole('checkbox', { name: 'NIKE' }))
  expect(screen.getByRole('button', { name: 'Remove NIKE filter' })).toBeTruthy()
  expectVisibleProduct('Men Nike Runner')
  expectHiddenProduct('Men Adidas Court')

  fireEvent.click(screen.getByRole('button', { name: 'Remove NIKE filter' }))
  expect(screen.queryByRole('button', { name: 'Remove NIKE filter' })).toBeNull()
  expectVisibleProduct('Men Nike Runner')
  expectVisibleProduct('Men Adidas Court')

  fireEvent.click(screen.getByRole('checkbox', { name: 'Unisex' }))
  expect(screen.getByRole('button', { name: 'Remove Unisex filter' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Men filter' })).toBeTruthy()
  expectVisibleProduct('Unisex Nike Runner')

  fireEvent.click(screen.getByRole('checkbox', { name: 'Men' }))
  expect(screen.getByRole('checkbox', { name: 'Men' }).checked).toBe(false)
  expect(screen.getByRole('checkbox', { name: 'Unisex' }).checked).toBe(true)
  expectVisibleProduct('Unisex Nike Runner')
  expectHiddenProduct('Men Nike Runner')

  // A gender filter never falls into an unexplained empty state: removing
  // the final Unisex selection returns the collection to its Men baseline.
  fireEvent.click(screen.getByRole('checkbox', { name: 'Unisex' }))
  expect(screen.getByRole('checkbox', { name: 'Men' }).checked).toBe(true)
  expect(screen.getByRole('checkbox', { name: 'Unisex' }).checked).toBe(false)
  expectVisibleProduct('Men Nike Runner')
  expectHiddenProduct('Unisex Nike Runner')

  fireEvent.click(screen.getByRole('checkbox', { name: 'Unisex' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
  openFilterGroup('Gender')
  expect(screen.getByRole('checkbox', { name: 'Men' }).checked).toBe(true)
  expect(screen.getByRole('checkbox', { name: 'Unisex' }).checked).toBe(false)
  expect(screen.getByRole('checkbox', { name: 'NIKE' }).checked).toBe(false)
  expectVisibleProduct('Men Nike Runner')
  expectVisibleProduct('Men Adidas Court')
  expectHiddenProduct('Unisex Nike Runner')
  expectHiddenProduct('Women Shoe Outside Men')
})

test('Men filters combine EU size and price and show the no-result recovery state', () => {
  renderMenFilters()

  openFilterGroup('Size (EU)')
  fireEvent.click(screen.getByRole('checkbox', { name: '42' }))
  openFilterGroup('Price')
  fireEvent.change(screen.getByLabelText('Minimum price'), { target: { value: '5500' } })
  fireEvent.change(screen.getByLabelText('Maximum price'), { target: { value: '6500' } })

  expect(screen.getByRole('button', { name: 'Remove EU 42 filter' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove ₱5,500 – ₱6,500 filter' })).toBeTruthy()
  expectVisibleProduct('Men Nike Runner')
  expectHiddenProduct('Men Adidas Court')
  expectHiddenProduct('Unisex Nike Runner')

  fireEvent.change(screen.getByLabelText('Maximum price'), { target: { value: '5800' } })
  expect(screen.getByRole('heading', { level: 2, name: 'No matching shoes' })).toBeTruthy()
  expect(screen.getByText('Try a different filter or clear your selections.')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
  openFilterGroup('Gender')
  expect(screen.getByRole('checkbox', { name: 'Men' }).checked).toBe(true)
  expect(screen.getByRole('checkbox', { name: '42' }).checked).toBe(false)
  expect(screen.getByLabelText('Minimum price').value).toBe('')
  expect(screen.getByLabelText('Maximum price').value).toBe('')
  expectVisibleProduct('Men Nike Runner')
  expectVisibleProduct('Men Adidas Court')
  expectHiddenProduct('Unisex Nike Runner')
})

test('Men displays 20 products per page and returns to page one when filters or page size change', () => {
  const paginatedMenProducts = Array.from({ length: 50 }, (_, index) => ({
    id: `paginated-men-${index + 1}`,
    slug: `paginated-men-${index + 1}`,
    name: `Paginated Men Shoe ${index + 1}`,
    brand: index % 2 === 0 ? 'NIKE' : 'ADIDAS',
    audience: 'men',
    sizes: [42],
    price: 5000 + index,
    image: '/men-pagination.jpg',
  }))
  useProducts.mockReturnValue({ data: paginatedMenProducts, isLoading: false, isError: false, refetch: vi.fn() })

  renderCategoryPage('men')

  expect(screen.getByText('Showing 1–20 of 50')).toBeTruthy()
  expect(screen.getAllByRole('link', { name: /^View Paginated Men Shoe/ })).toHaveLength(20)
  expect(screen.getByRole('button', { name: 'Previous page' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('combobox', { name: 'Products per page' }).value).toBe('20')

  fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
  expect(screen.getByText('Showing 21–40 of 50')).toBeTruthy()
  expect(screen.getAllByRole('link', { name: /^View Paginated Men Shoe/ })).toHaveLength(20)
  expect(screen.queryByRole('link', { name: 'View Paginated Men Shoe 1' })).toBeNull()
  expect(screen.getByRole('link', { name: 'View Paginated Men Shoe 21' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('page')

  fireEvent.change(screen.getByRole('combobox', { name: 'Products per page' }), { target: { value: '40' } })
  expect(screen.getByText('Showing 1–40 of 50')).toBeTruthy()
  expect(screen.getAllByRole('link', { name: /^View Paginated Men Shoe/ })).toHaveLength(40)
  expect(screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe('page')

  fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
  expect(screen.getByText('Showing 41–50 of 50')).toBeTruthy()
  openFilterGroup('Brand')
  fireEvent.click(screen.getByRole('checkbox', { name: 'NIKE' }))
  expect(screen.getByText('Showing 1–25 of 25')).toBeTruthy()
  expect(screen.getAllByRole('link', { name: /^View Paginated Men Shoe/ })).toHaveLength(25)
  expect(screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe('page')
})

test('Men pagination keeps a valid final page while refreshed results shrink', () => {
  let catalogData = Array.from({ length: 50 }, (_, index) => ({
    id: `refresh-men-${index + 1}`,
    slug: `refresh-men-${index + 1}`,
    name: `Refresh Men Shoe ${index + 1}`,
    brand: 'NIKE',
    audience: 'men',
    sizes: [42],
    price: 5000 + index,
    image: '/men-refresh.jpg',
  }))
  useProducts.mockImplementation(() => ({ data: catalogData, isLoading: false, isError: false, refetch: vi.fn() }))

  const renderMenPage = () => <MemoryRouter><CatalogPage title="men" filters={{ audience: 'men' }} showEditorialArtwork showExampleMetadata={false} enableMenFilters /></MemoryRouter>
  const view = render(renderMenPage())

  fireEvent.click(screen.getByRole('button', { name: 'Page 3' }))
  expect(screen.getByText('Showing 41–50 of 50')).toBeTruthy()

  catalogData = catalogData.slice(0, 25)
  view.rerender(renderMenPage())

  expect(screen.getByText('Showing 21–25 of 25')).toBeTruthy()
  expect(screen.getAllByRole('link', { name: /^View Refresh Men Shoe/ })).toHaveLength(5)
  expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('page')
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
