import { fireEvent, render, screen, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { useProduct } from '@/features/catalog/hooks'
import { useCartStore, selectSubtotal } from '@/features/cart/cartStore'
import { Component } from './ProductPage'
import styles from './ProductPage.module.css'

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

const mappedExample = {
  ...product,
  id: 'vans-mary-jane',
  slug: 'example-vans-mary-jane-leather-reference',
  name: 'Vans Mary Jane Sneakers - Leather Black/White',
  brand: 'VANS',
  image: '',
  images: [],
}

const knownProductPhoto = 'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/70f198b292f8433791442853f0a62c56_9366/Adizero_EVO_SL_Laceless_LIGHTSTRIKEPRO_Running_Shoes_Beige_HQ9534_01_00_standard.jpg'
const lowSubjectPhoto = 'https://assets.adidas.com/images/w_500%2Cf_auto%2Cq_auto/56a1beb6b9614eb8bc244d5d6e65edf2_9366/GALAXY_8_RUNNING_SHOES_Blue_KI7977_HM1.jpg'

beforeEach(() => {
  useCartStore.getState().clear()
  useProduct.mockReturnValue({ data: product, isLoading: false, isError: false })
})

function showProduct(path = '/products/runner') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/products/:slug" element={<Component />} /></Routes></MemoryRouter>)
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
  expect(screen.getByText('2 pairs available in this option.')).toBeTruthy()
  expect(screen.queryByText(/Example sizes and stock are not verified/)).toBeNull()
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

test('warns that example sizes and stock are unverified before and after selecting a size', () => {
  useProduct.mockReturnValue({ data: { ...product, isExampleStock: true }, isLoading: false, isError: false })
  showProduct()
  expect(screen.getByText('Example sizes and stock are not verified. Please confirm availability with the store.')).toBeTruthy()
  fireEvent.click(within(screen.getByRole('group', { name: 'Select shoe size' })).getByRole('button', { name: '40' }))
  expect(screen.getByText('Example stock: 3 pairs for this option (not verified).')).toBeTruthy()
})

test('warns that the example price may still be charged', () => {
  useProduct.mockReturnValue({ data: { ...product, isExamplePrice: true }, isLoading: false, isError: false })
  showProduct()
  expect(screen.getByText(/Example price; not verified by the store/)).toBeTruthy()
})

test('uses the placeholder when a product image fails, and tries the next colour image', () => {
  useProduct.mockReturnValue({ data: { ...product, images: [
    { colorName: 'Sage', url: '/sage.jpg' },
    { colorName: 'Black', url: '/black.jpg' },
  ] }, isLoading: false, isError: false })
  const { container } = showProduct()
  expect(screen.getByAltText('Runner').getAttribute('src')).toBe('/sage.jpg')
  fireEvent.error(screen.getByAltText('Runner'))
  expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
  expect([...container.querySelectorAll('img')].every((img) => img.getAttribute('src') === '/images/product-placeholder.svg')).toBe(true)
  fireEvent.click(within(screen.getByRole('group', { name: 'Select colour' })).getByRole('button', { name: 'Black' }))
  expect(screen.getByAltText('Runner').getAttribute('src')).toBe('/black.jpg')
})

test('shows each supplied gallery photo once and hides failed extra photos', () => {
  useProduct.mockReturnValue({ data: { ...product, images: [
    { colorName: 'Sage', url: '/sage.jpg' },
    { colorName: 'Sage', url: '/sage-side.jpg', altText: 'Runner side view' },
    { colorName: 'Sage', url: '/sage-side.jpg' },
    { colorName: 'Black', url: '/black.jpg' },
  ] }, isLoading: false, isError: false })
  const { container } = showProduct()
  expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual(['/sage.jpg', '/sage-side.jpg'])
  fireEvent.error(screen.getByAltText('Runner side view'))
  expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual(['/sage.jpg'])
  fireEvent.click(within(screen.getByRole('group', { name: 'Select colour' })).getByRole('button', { name: 'Black' }))
  expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual(['/black.jpg'])
})

test('does not duplicate a missing product-image placeholder', () => {
  useProduct.mockReturnValue({ data: { ...product, image: '', images: [] }, isLoading: false, isError: false })
  const { container } = showProduct()
  expect(container.querySelectorAll('img')).toHaveLength(1)
  expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
})

test.each(['', '/images/product-placeholder.svg'])(
  'shows a clearly labeled illustration for a mapped example with missing photo %j',
  (missingImage) => {
    useProduct.mockReturnValue({ data: { ...mappedExample, image: missingImage }, isLoading: false, isError: false })
    const { container } = showProduct(`/products/${mappedExample.slug}`)
    const illustration = screen.getByAltText(`Illustration, not the actual product: ${mappedExample.name}`)
    expect(illustration.getAttribute('src')).toBe('/images/arrival-mary-jane.webp')
    const label = screen.getByText('Illustrative image')
    expect(label.closest('figure')).toBeNull()
    expect(screen.getByRole('heading', { name: mappedExample.name }).parentElement.parentElement.contains(label)).toBe(true)
    expect(illustration.classList.contains(styles.photo)).toBe(false)
    expect(screen.queryByText('Illustration — not actual product')).toBeNull()
    expect(screen.queryByAltText('Product image unavailable')).toBeNull()
    expect(container.querySelectorAll('img')).toHaveLength(1)
  },
)

test('applies the seamless background only to a known reference photo and removes it on image failure', () => {
  useProduct.mockReturnValue({ data: { ...mappedExample, image: knownProductPhoto }, isLoading: false, isError: false })
  showProduct(`/products/${mappedExample.slug}`)

  const photo = screen.getByAltText(mappedExample.name)
  expect(photo.getAttribute('src')).toBe(knownProductPhoto)
  expect(photo.classList.contains(styles.photo)).toBe(true)
  expect(photo.closest('figure').classList.contains(styles.figure)).toBe(true)
  expect(screen.queryByText('Illustrative image')).toBeNull()

  fireEvent.error(photo)
  const illustration = screen.getByAltText(`Illustration, not the actual product: ${mappedExample.name}`)
  expect(illustration.classList.contains(styles.photo)).toBe(false)
  expect(screen.getByText('Illustrative image')).toBeTruthy()
  fireEvent.error(illustration)
  expect(screen.getByAltText('Product image unavailable').classList.contains(styles.photo)).toBe(false)
  expect(screen.queryByText('Illustrative image')).toBeNull()
})

test.each([
  '/verified-product.jpg',
  `${knownProductPhoto}?different-crop=true`,
])('does not apply the background adjustment to an unknown photo %s', (image) => {
  useProduct.mockReturnValue({ data: { ...mappedExample, image }, isLoading: false, isError: false })
  showProduct(`/products/${mappedExample.slug}`)
  const photo = screen.getByAltText(mappedExample.name)
  expect(photo.getAttribute('src')).toBe(image)
  expect(photo.classList.contains(styles.photo)).toBe(false)
  expect(screen.queryByText('Illustrative image')).toBeNull()
})

test('re-centers a known low-subject photo, but not an unknown photo or fallback illustration', () => {
  useProduct.mockReturnValue({ data: { ...mappedExample, image: lowSubjectPhoto }, isLoading: false, isError: false })
  const { rerender } = showProduct(`/products/${mappedExample.slug}`)

  expect(screen.getByAltText(mappedExample.name).classList.contains(styles.recenteredPhoto)).toBe(true)
  fireEvent.error(screen.getByAltText(mappedExample.name))
  expect(screen.getByAltText(`Illustration, not the actual product: ${mappedExample.name}`).classList.contains(styles.recenteredPhoto)).toBe(false)

  useProduct.mockReturnValue({ data: { ...mappedExample, image: `${lowSubjectPhoto}?different-crop=true` }, isLoading: false, isError: false })
  rerender(<MemoryRouter initialEntries={[`/products/${mappedExample.slug}`]}><Routes><Route path="/products/:slug" element={<Component />} /></Routes></MemoryRouter>)
  expect(screen.getByAltText(mappedExample.name).classList.contains(styles.recenteredPhoto)).toBe(false)
})

test('applies the background adjustment to known extra gallery photos only', () => {
  useProduct.mockReturnValue({ data: { ...product, images: [
    { colorName: 'Sage', url: '/sage.jpg' },
    { colorName: 'Sage', url: knownProductPhoto, altText: 'Known detail' },
    { colorName: 'Sage', url: '/unknown-detail.jpg', altText: 'Unknown detail' },
  ] }, isLoading: false, isError: false })
  showProduct()

  expect(screen.getByAltText('Known detail').classList.contains(styles.galleryPhoto)).toBe(true)
  expect(screen.getByAltText('Unknown detail').classList.contains(styles.galleryPhoto)).toBe(false)
  fireEvent.error(screen.getByAltText('Known detail'))
  expect(screen.queryByAltText('Known detail')).toBeNull()
  expect(screen.getByAltText('Unknown detail')).toBeTruthy()
})

test('shows a real photo instead of the example illustration when one is supplied', () => {
  useProduct.mockReturnValue({ data: { ...mappedExample, image: '/verified-product.jpg' }, isLoading: false, isError: false })
  showProduct(`/products/${mappedExample.slug}`)
  expect(screen.getByAltText(mappedExample.name).getAttribute('src')).toBe('/verified-product.jpg')
  expect(screen.queryByText('Illustrative image')).toBeNull()
  expect(screen.queryByText('Illustration — not actual product')).toBeNull()
})

test('uses a labeled illustration if a real photo fails, and a placeholder if the illustration also fails', () => {
  useProduct.mockReturnValue({ data: { ...mappedExample, image: '/broken-product.jpg' }, isLoading: false, isError: false })
  const { container } = showProduct(`/products/${mappedExample.slug}`)
  fireEvent.error(screen.getByAltText(mappedExample.name))
  const illustration = screen.getByAltText(`Illustration, not the actual product: ${mappedExample.name}`)
  expect(illustration.getAttribute('src')).toBe('/images/arrival-mary-jane.webp')
  expect(screen.getByText('Illustrative image')).toBeTruthy()
  fireEvent.error(illustration)
  expect(screen.getByAltText('Product image unavailable').getAttribute('src')).toBe('/images/product-placeholder.svg')
  expect(screen.queryByText('Illustrative image')).toBeNull()
  expect(screen.queryByText('Illustration — not actual product')).toBeNull()
  expect(container.querySelectorAll('img')).toHaveLength(1)
})

test('tries a different colour photo after a mapped example falls back to an illustration', () => {
  useProduct.mockReturnValue({ data: { ...mappedExample, images: [
    { colorName: 'Sage', url: '/sage.jpg' },
    { colorName: 'Black', url: '/black.jpg' },
  ] }, isLoading: false, isError: false })
  showProduct(`/products/${mappedExample.slug}`)
  fireEvent.error(screen.getByAltText(mappedExample.name))
  expect(screen.getByAltText(`Illustration, not the actual product: ${mappedExample.name}`)).toBeTruthy()
  fireEvent.click(within(screen.getByRole('group', { name: 'Select colour' })).getByRole('button', { name: 'Black' }))
  expect(screen.getByAltText(mappedExample.name).getAttribute('src')).toBe('/black.jpg')
  expect(screen.queryByText('Illustrative image')).toBeNull()
  expect(screen.queryByText('Illustration — not actual product')).toBeNull()
})

test('keeps an illustration from being saved in the cart as a real product photo', () => {
  useProduct.mockReturnValue({ data: mappedExample, isLoading: false, isError: false })
  showProduct(`/products/${mappedExample.slug}`)
  fireEvent.click(within(screen.getByRole('group', { name: 'Select shoe size' })).getByRole('button', { name: '40' }))
  fireEvent.click(screen.getByRole('button', { name: /Add to bag/i }))
  expect(useCartStore.getState().items).toHaveLength(1)
  expect(useCartStore.getState().items[0].product.image).not.toBe('/images/arrival-mary-jane.webp')
})

test('updates the example illustration when navigating between products', () => {
  const next = { ...mappedExample, id: 'hoka', slug: 'example-20261018-hoka-arahi-8', name: 'Example HOKA Arahi 8' }
  useProduct.mockImplementation((slug) => ({ data: slug === next.slug ? next : mappedExample, isLoading: false, isError: false }))
  render(<MemoryRouter initialEntries={[`/products/${mappedExample.slug}`]}><Link to={`/products/${next.slug}`}>Next product</Link><Routes><Route path="/products/:slug" element={<Component />} /></Routes></MemoryRouter>)
  expect(screen.getByAltText(`Illustration, not the actual product: ${mappedExample.name}`).getAttribute('src')).toBe('/images/arrival-mary-jane.webp')
  fireEvent.click(screen.getByRole('link', { name: 'Next product' }))
  expect(screen.getByAltText(`Illustration, not the actual product: ${next.name}`).getAttribute('src')).toBe('/images/arrival-blue-runner.webp')
  expect(screen.getByText('Illustrative image')).toBeTruthy()
})

test('retries a shared illustration for a different product after it fails', () => {
  const next = { ...mappedExample, id: 'reebok', slug: 'example-reebok-ultra-lo-mary-jane-100261003', name: 'Reebok Mary Jane' }
  useProduct.mockImplementation((slug) => ({ data: slug === next.slug ? next : mappedExample, isLoading: false, isError: false }))
  render(<MemoryRouter initialEntries={[`/products/${mappedExample.slug}`]}><Link to={`/products/${next.slug}`}>Next product</Link><Routes><Route path="/products/:slug" element={<Component />} /></Routes></MemoryRouter>)
  fireEvent.error(screen.getByAltText(`Illustration, not the actual product: ${mappedExample.name}`))
  expect(screen.getByAltText('Product image unavailable')).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Next product' }))
  expect(screen.getByAltText(`Illustration, not the actual product: ${next.name}`).getAttribute('src')).toBe('/images/arrival-mary-jane.webp')
  expect(screen.getByText('Illustrative image')).toBeTruthy()
})

test('retries a shared photo for a different product after it fails', () => {
  const first = { ...mappedExample, image: '/shared.jpg' }
  const next = { ...product, id: 'another', slug: 'another', name: 'Another shoe', image: '/shared.jpg' }
  useProduct.mockImplementation((slug) => ({ data: slug === next.slug ? next : first, isLoading: false, isError: false }))
  render(<MemoryRouter initialEntries={[`/products/${first.slug}`]}><Link to={`/products/${next.slug}`}>Next product</Link><Routes><Route path="/products/:slug" element={<Component />} /></Routes></MemoryRouter>)
  fireEvent.error(screen.getByAltText(first.name))
  expect(screen.getByAltText(`Illustration, not the actual product: ${first.name}`)).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Next product' }))
  expect(screen.getByAltText(next.name).getAttribute('src')).toBe('/shared.jpg')
  expect(screen.queryByText('Illustrative image')).toBeNull()
  expect(screen.queryByText('Illustration — not actual product')).toBeNull()
})

test('retries a shared gallery photo when navigating to another product', () => {
  const first = { ...mappedExample, images: [
    { colorName: 'Sage', url: '/first.jpg' },
    { colorName: 'Sage', url: '/shared-detail.jpg', altText: 'First detail' },
  ] }
  const next = { ...product, id: 'another', slug: 'another', name: 'Another shoe', images: [
    { colorName: 'Sage', url: '/next.jpg' },
    { colorName: 'Sage', url: '/shared-detail.jpg', altText: 'Next detail' },
  ] }
  useProduct.mockImplementation((slug) => ({ data: slug === next.slug ? next : first, isLoading: false, isError: false }))
  render(<MemoryRouter initialEntries={[`/products/${first.slug}`]}><Link to={`/products/${next.slug}`}>Next product</Link><Routes><Route path="/products/:slug" element={<Component />} /></Routes></MemoryRouter>)
  fireEvent.error(screen.getByAltText('First detail'))
  expect(screen.queryByAltText('First detail')).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'Next product' }))
  expect(screen.getByAltText('Next detail').getAttribute('src')).toBe('/shared-detail.jpg')
})

test('reports the actual amount added and warns when the bag is already at the stock limit', () => {
  showProduct()
  fireEvent.click(within(screen.getByRole('group', { name: 'Select shoe size' })).getByRole('button', { name: '40' }))
  fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
  fireEvent.click(screen.getByRole('button', { name: /Add to bag/i }))
  expect(useCartStore.getState().items[0].qty).toBe(2)
  fireEvent.click(screen.getByRole('button', { name: /Add to bag/i }))
  expect(useCartStore.getState().items[0].qty).toBe(3)
  expect(screen.getByRole('status').textContent).toMatch(/1 pair was added/)
  fireEvent.click(screen.getByRole('button', { name: /Add to bag/i }))
  expect(useCartStore.getState().items[0].qty).toBe(3)
  expect(screen.getByRole('status').textContent).toMatch(/already contains the maximum/)
})

test('explains when a saved cart quantity is reduced to match newly fetched stock', () => {
  useCartStore.getState().add(product, 40, 5, { ...product.variants[0], available: 5 })
  showProduct()
  fireEvent.click(within(screen.getByRole('group', { name: 'Select shoe size' })).getByRole('button', { name: '40' }))
  fireEvent.click(screen.getByRole('button', { name: /Add to bag/i }))
  expect(useCartStore.getState().items[0].qty).toBe(3)
  expect(screen.getByRole('status').textContent).toMatch(/adjusted to the latest available stock/)
})
