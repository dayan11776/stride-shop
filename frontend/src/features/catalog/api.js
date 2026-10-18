import { api, listFrom, payloadFrom, USE_MOCK } from '@/lib/apiClient'
import { products } from '@/lib/mockData'
import { unitPrice } from '@/lib/format'

// filters: { audience, brand, sale, isNew, q }
export async function getProducts(filters = {}) {
  if (!USE_MOCK) {
    const data = await api('/products', { params: filters })
    return listFrom(data).map(normalizeProduct)
  }
  const q = filters.q?.toLowerCase()
  return products.filter((p) =>
    (!filters.audience || p.audience === filters.audience) &&
    (!filters.brand || p.brand?.trim().toLowerCase() === filters.brand.trim().toLowerCase()) &&
    (!filters.sale || p.salePrice != null) &&
    (!filters.isNew || p.isNew) &&
    (!q || `${p.name} ${p.audience}`.toLowerCase().includes(q)))
}

export async function getProduct(slug) {
  if (!USE_MOCK) return normalizeProduct(payloadFrom(await api(`/products/${slug}`)))
  const p = products.find((x) => x.slug === slug)
  if (!p) throw new Error('Product not found')
  return p
}

export const sortByPrice = (list, dir) => [...list].sort((a, b) => (unitPrice(a) - unitPrice(b)) * dir)

// Keep the screen resilient to common DRF serializer conventions while the
// backend remains free to return useful nested product data.
export function normalizeProduct(source = {}) {
  const variants = source.variants ?? source.product_variants ?? []
  const images = source.images ?? source.product_images ?? []
  // The API returns an empty string when a product has no image. A neutral
  // placeholder avoids both a broken image and showing an unrelated shoe.
  const image = [source.image, source.image_url, source.primary_image, images[0]?.image, images[0]?.url]
    .find((value) => typeof value === 'string' && value.trim()) || '/images/product-placeholder.svg'
  const brand = typeof source.brand === 'object' ? source.brand?.name : source.brand
  const audience = source.audience ?? source.category?.slug ?? source.category ?? 'men'
  const price = Number(source.price ?? source.base_price ?? 0)
  const sale = source.salePrice ?? source.sale_price ?? source.discounted_price
  return {
    ...source,
    id: source.id ?? source.pk,
    slug: source.slug ?? String(source.id ?? source.pk ?? ''),
    name: source.name ?? source.title ?? 'STRIDE shoe',
    brand: brand ?? 'STRIDE',
    audience: typeof audience === 'object' ? audience.slug ?? audience.name : audience,
    price,
    salePrice: sale == null || sale === '' ? null : Number(sale),
    image,
    isNew: Boolean(source.isNew ?? source.is_new ?? source.new_arrival),
    sizes: source.sizes ?? variants.map((variant) => variant.sizeEu ?? variant.size_eu ?? variant.size ?? variant.size_label).filter(Boolean),
    variants,
  }
}
