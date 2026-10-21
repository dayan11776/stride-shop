import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '@/lib/apiClient'
import { Component as ProductControl } from './ProductControlPage'
import { Component as ProductForm } from './ProductFormPage'

vi.mock('@/lib/apiClient', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }))

const brand = { id: 'brand-1', name: 'STRIDE' }
const category = { id: 'category-1', name: 'Sneakers' }
const product = {
  id: 'product-1', name: 'Everyday Runner', slug: 'everyday-runner', brand: brand.id, brand_name: brand.name,
  category: category.id, category_name: category.name, audience: 'unisex', description: 'A good shoe', status: 'active',
  images: [{ id: 'image-1', url: 'https://example.com/shoe.jpg', color_name: 'Sage', alt_text: 'A shoe', position: 0, is_primary: true }],
  variants: [{ id: 'variant-1', sku: 'RUN-40', color_name: 'Sage', color_hex: '#8B9A6E', size_eu: '40.0', size_us: '8.0', width: 'regular', price: '2499.00', sale_price: '1999.00', sale_starts_at: null, sale_ends_at: null, is_active: true, quantity_on_hand: 12, quantity_reserved: 2, low_stock_threshold: 5 }],
}

function renderForm(path) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/products/new" element={<ProductForm />} /><Route path="/admin/product-control/:productId/edit" element={<ProductForm />} /><Route path="/admin/product-control" element={<p>Returned to product control</p>} /></Routes></MemoryRouter>)
}

beforeEach(() => { api.mockReset() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

test('creates a product with the chosen image URL and variant', async () => {
  api.mockImplementation((path, options) => {
    if (path === '/brands') return Promise.resolve([brand])
    if (path === '/categories') return Promise.resolve([category])
    if (path === '/staff/products' && options.method === 'POST') return Promise.resolve({ id: 'new' })
    return Promise.reject(new Error('Unexpected request'))
  })
  renderForm('/admin/products/new')
  fireEvent.change(await screen.findByLabelText('Product name *'), { target: { value: 'Everyday Runner' } })
  expect(screen.getByRole('checkbox', { name: 'Stock quantities are examples (not verified)' }).checked).toBe(false)
  fireEvent.change(screen.getByLabelText('Brand *'), { target: { value: brand.id } })
  fireEvent.change(screen.getByLabelText('Category *'), { target: { value: category.id } })
  fireEvent.change(screen.getByLabelText('Colour *'), { target: { value: 'Sage' } })
  fireEvent.change(screen.getByLabelText('EU size *'), { target: { value: '40' } })
  fireEvent.change(screen.getByLabelText('SKU *'), { target: { value: 'RUN-40' } })
  fireEvent.change(screen.getByLabelText('Price (₱) *'), { target: { value: '2499' } })
  fireEvent.change(screen.getByLabelText('On-hand stock *'), { target: { value: '12' } })
  fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: 'https://example.com/shoe.jpg' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Add image URL' }))
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } })
  fireEvent.click(screen.getByRole('button', { name: 'Publish product' }))
  await screen.findByText('Returned to product control')
  const [, options] = api.mock.calls.find(([path, opts]) => path === '/staff/products' && opts?.method === 'POST')
  expect(options.body).toMatchObject({ name: 'Everyday Runner', slug: 'everyday-runner', brand: brand.id, category: category.id, status: 'active', is_example_stock: false, images: [{ url: 'https://example.com/shoe.jpg', is_primary: true }], variants: [{ sku: 'RUN-40', color_name: 'Sage', size_eu: '40', quantity_on_hand: 12 }] })
})

test.each([[true, false], [false, true]])('editing can change the example-stock flag from %s to %s', async (initial, updated) => {
  api.mockImplementation((path, options = {}) => {
    if (path === '/brands') return Promise.resolve([brand])
    if (path === '/categories') return Promise.resolve([category])
    if (path === '/staff/products/product-1' && !options.method) return Promise.resolve({ ...product, is_example_stock: initial })
    if (path === '/staff/products/product-1' && options.method === 'PATCH') return Promise.resolve(product)
    return Promise.reject(new Error('Unexpected request'))
  })
  renderForm('/admin/product-control/product-1/edit')
  const checkbox = await screen.findByRole('checkbox', { name: 'Stock quantities are examples (not verified)' })
  expect(checkbox.checked).toBe(initial)
  fireEvent.click(checkbox)
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Returned to product control')
  const [, options] = api.mock.calls.find(([path, opts]) => path === '/staff/products/product-1' && opts?.method === 'PATCH')
  expect(options.body).toEqual({ is_example_stock: updated })
})

test('editing product details omits unchanged image and variant collections', async () => {
  api.mockImplementation((path, options) => {
    if (path === '/brands') return Promise.resolve([brand])
    if (path === '/categories') return Promise.resolve([category])
    if (path === '/staff/products/product-1' && !options.method) return Promise.resolve(product)
    if (path === '/staff/products/product-1' && options.method === 'PATCH') return Promise.resolve(product)
    return Promise.reject(new Error('Unexpected request'))
  })
  renderForm('/admin/product-control/product-1/edit')
  fireEvent.change(await screen.findByLabelText('Product name *'), { target: { value: 'Updated Runner' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Returned to product control')
  const [, options] = api.mock.calls.find(([path, opts]) => path === '/staff/products/product-1' && opts?.method === 'PATCH')
  expect(options.body).toEqual({ name: 'Updated Runner' })
})

test('a variant edit sends only the changed field so stock and other variants are not overwritten', async () => {
  api.mockImplementation((path, options = {}) => {
    if (path === '/brands') return Promise.resolve([brand])
    if (path === '/categories') return Promise.resolve([category])
    if (path === '/staff/products/product-1' && !options.method) return Promise.resolve(product)
    if (path === '/staff/products/product-1' && options.method === 'PATCH') return Promise.resolve(product)
    return Promise.reject(new Error('Unexpected request'))
  })
  renderForm('/admin/product-control/product-1/edit')
  fireEvent.change(await screen.findByLabelText('Price (₱) *'), { target: { value: '2599' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Returned to product control')
  const [, options] = api.mock.calls.find(([path, opts]) => path === '/staff/products/product-1' && opts?.method === 'PATCH')
  expect(options.body.variants).toEqual([{ id: 'variant-1', price: '2599' }])
  expect(options.body).not.toHaveProperty('images')
})

test('stock updates include the original quantity and show concurrent-update errors', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  api.mockImplementation((path, options = {}) => {
    if (path === '/brands') return Promise.resolve([brand])
    if (path === '/categories') return Promise.resolve([category])
    if (path === '/staff/products/product-1' && !options.method) return Promise.resolve(product)
    if (path === '/staff/products/product-1' && options.method === 'PATCH') return Promise.reject({ status: 400, body: { variants: ['Stock changed while you were editing.'] }, message: 'Request failed (400)' })
    return Promise.reject(new Error('Unexpected request'))
  })
  renderForm('/admin/product-control/product-1/edit')
  fireEvent.change(await screen.findByLabelText('On-hand stock *'), { target: { value: '14' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Stock changed while you were editing.'))
  const [, options] = api.mock.calls.find(([path, opts]) => path === '/staff/products/product-1' && opts?.method === 'PATCH')
  expect(options.body.variants).toEqual([{ id: 'variant-1', quantity_on_hand: 14, expected_quantity_on_hand: 12 }])
})

test('adding an image sends only the new image without replacing other images', async () => {
  api.mockImplementation((path, options = {}) => {
    if (path === '/brands') return Promise.resolve([brand])
    if (path === '/categories') return Promise.resolve([category])
    if (path === '/staff/products/product-1' && !options.method) return Promise.resolve(product)
    if (path === '/staff/products/product-1' && options.method === 'PATCH') return Promise.resolve(product)
    return Promise.reject(new Error('Unexpected request'))
  })
  renderForm('/admin/product-control/product-1/edit')
  fireEvent.change(await screen.findByLabelText('Image URL'), { target: { value: 'https://example.com/new.jpg' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Add image URL' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Returned to product control')
  const [, options] = api.mock.calls.find(([path, opts]) => path === '/staff/products/product-1' && opts?.method === 'PATCH')
  expect(options.body.images).toEqual([expect.objectContaining({ url: 'https://example.com/new.jpg' })])
  expect(options.body).not.toHaveProperty('variants')
})

test('removing an image and variant submits only their explicitly selected IDs', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  api.mockImplementation((path, options = {}) => {
    if (path === '/brands') return Promise.resolve([brand])
    if (path === '/categories') return Promise.resolve([category])
    if (path === '/staff/products/product-1' && !options.method) return Promise.resolve({ ...product, status: 'draft' })
    if (path === '/staff/products/product-1' && options.method === 'PATCH') return Promise.resolve(product)
    return Promise.reject(new Error('Unexpected request'))
  })
  renderForm('/admin/product-control/product-1/edit')
  fireEvent.click(await screen.findByRole('button', { name: 'Remove variant 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove image 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Returned to product control')
  const [, options] = api.mock.calls.find(([path, opts]) => path === '/staff/products/product-1' && opts?.method === 'PATCH')
  expect(options.body).toEqual({ remove_variant_ids: ['variant-1'], remove_image_ids: ['image-1'] })
})

test('prevents stock below reserved quantity and displays nested server errors', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  api.mockImplementation((path, options) => {
    if (path === '/brands') return Promise.resolve([brand])
    if (path === '/categories') return Promise.resolve([category])
    if (path === '/staff/products/product-1' && !options.method) return Promise.resolve(product)
    if (path === '/staff/products/product-1' && options.method === 'PATCH') return Promise.reject({ status: 400, body: { variants: [{ sku: ['That SKU is already in use.'] }] }, message: 'Request failed (400)' })
    return Promise.reject(new Error('Unexpected request'))
  })
  renderForm('/admin/product-control/product-1/edit')
  fireEvent.change(await screen.findByLabelText('On-hand stock *'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(screen.getByRole('alert').textContent).toContain('at least equal to the 2 reserved')
  expect(api.mock.calls.some(([path, options]) => path === '/staff/products/product-1' && options?.method === 'PATCH')).toBe(false)
  fireEvent.change(screen.getByLabelText('On-hand stock *'), { target: { value: '12' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('That SKU is already in use.'))
})

test('requires confirmation to recycle and restores products as drafts', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  api.mockImplementation((path, options = {}) => {
    if (path === '/staff/products' && options.params?.recycled === 'true') return Promise.resolve([{ ...product, recycled_at: '2026-10-17T00:00:00Z' }])
    if (path === '/staff/products') return Promise.resolve([product])
    if (path === '/staff/products/product-1' && options.method === 'DELETE') return Promise.resolve(null)
    if (path === '/staff/products/product-1/restore' && options.method === 'POST') return Promise.resolve({ ...product, status: 'draft' })
    return Promise.reject(new Error('Unexpected request'))
  })
  render(<MemoryRouter initialEntries={['/admin/product-control']}><ProductControl /></MemoryRouter>)
  const move = await screen.findByRole('button', { name: /Move to bin Everyday Runner/ })
  fireEvent.click(move)
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(api.mock.calls.some(([path, options]) => path === '/staff/products/product-1' && options?.method === 'DELETE')).toBe(false)
  fireEvent.click(move)
  await screen.findByText('“Everyday Runner” was moved to the recycle bin.')
  fireEvent.click(screen.getByRole('tab', { name: 'Recycle Bin' }))
  fireEvent.click(await screen.findByRole('button', { name: /Restore Everyday Runner/ }))
  await screen.findByText('“Everyday Runner” was restored as a draft.')
})

test('Recycle Bin confirms before permanently deleting a product', async () => {
  api.mockImplementation((path, options = {}) => {
    if (path === '/staff/products' && options.params?.recycled === 'true') return Promise.resolve([{ ...product, recycled_at: '2026-10-17T00:00:00Z' }])
    if (path === '/staff/products/product-1/permanent-delete' && options.method === 'DELETE') return Promise.resolve(null)
    return Promise.reject(new Error('Unexpected request'))
  })
  render(<MemoryRouter initialEntries={['/admin/product-control?tab=recycled']}><ProductControl /></MemoryRouter>)

  const deleteButton = await screen.findByRole('button', { name: 'Delete Everyday Runner permanently' })
  expect(screen.getByRole('button', { name: /Restore Everyday Runner/ })).toBeTruthy()
  fireEvent.click(deleteButton)
  expect(screen.getByRole('alertdialog', { name: 'Delete permanently?' })).toBeTruthy()
  expect(screen.getByText('“Everyday Runner” and its product information will be permanently removed. This cannot be undone.')).toBeTruthy()
  expect(api.mock.calls.some(([path]) => path === '/staff/products/product-1/permanent-delete')).toBe(false)

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(screen.getByRole('button', { name: 'Delete Everyday Runner permanently' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Delete Everyday Runner permanently' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
  await screen.findByText('“Everyday Runner” was permanently deleted.')
  expect(api.mock.calls.filter(([path, options]) => path === '/staff/products/product-1/permanent-delete' && options?.method === 'DELETE')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Delete Everyday Runner permanently' })).toBeNull()
})

test('Recycle Bin keeps a product visible when permanent deletion is blocked', async () => {
  api.mockImplementation((path, options = {}) => {
    if (path === '/staff/products' && options.params?.recycled === 'true') return Promise.resolve([{ ...product, recycled_at: '2026-10-17T00:00:00Z' }])
    if (path === '/staff/products/product-1/permanent-delete' && options.method === 'DELETE') return Promise.reject(new Error('This product cannot be permanently deleted because it has cart, order, or inventory history.'))
    return Promise.reject(new Error('Unexpected request'))
  })
  render(<MemoryRouter initialEntries={['/admin/product-control?tab=recycled']}><ProductControl /></MemoryRouter>)

  fireEvent.click(await screen.findByRole('button', { name: 'Delete Everyday Runner permanently' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
  expect((await screen.findByRole('alert')).textContent).toContain('This product cannot be permanently deleted because it has cart, order, or inventory history.')
  expect(screen.getByRole('alertdialog', { name: 'Delete permanently?' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Delete Everyday Runner permanently' })).toBeTruthy()
})
