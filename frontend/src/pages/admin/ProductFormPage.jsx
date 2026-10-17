import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '@/components/ui/PageState'
import { api, listFrom, payloadFrom } from '@/lib/apiClient'
import './productManagement.css'

let localKeySequence = 0
const newLocalKey = (kind) => `${kind}-${++localKeySequence}`
const newVariant = () => ({ _clientKey: newLocalKey('variant'), sku: '', color_name: '', color_hex: '', size_eu: '', size_us: '', width: 'regular', price: '', sale_price: '', sale_starts_at: null, sale_ends_at: null, is_active: true, quantity_on_hand: '0', quantity_reserved: 0, low_stock_threshold: 5 })
const newProduct = () => ({ name: '', slug: '', brand: '', category: '', audience: 'unisex', description: '', status: 'draft', is_example_stock: false, images: [], variants: [newVariant()] })
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

function normalizeProduct(product) {
  return { ...product, is_example_stock: product.is_example_stock === true, brand: product.brand?.id || product.brand || '', category: product.category?.id || product.category || '', images: product.images || [], variants: (product.variants || []).map((variant) => ({ ...newVariant(), ...variant, quantity_on_hand: String(variant.quantity_on_hand ?? 0), sale_price: variant.sale_price ?? '', size_us: variant.size_us ?? '' })) }
}

function readableErrors(error) {
  if (!error?.body || error.status >= 500 || typeof error.body !== 'object') return [error.message || 'The product could not be saved. Please try again.']
  const messages = []
  const visit = (value, path = []) => {
    if (typeof value === 'string') {
      if (!/<\/?(?:!doctype|html|head|body|title)\b/i.test(value)) messages.push(`${path.length ? `${path.join(' › ')}: ` : ''}${value}`)
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, typeof item === 'object' && item !== null ? [...path, String(index + 1)] : path))
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => visit(item, ['message', 'detail', 'errors', 'non_field_errors'].includes(key) ? path : [...path, key.replaceAll('_', ' ')]))
    }
  }
  visit(error.body)
  return [...new Set(messages)].slice(0, 12).length ? [...new Set(messages)].slice(0, 12) : [error.message || 'The product could not be saved.']
}

function validate(form, pendingImageUrl) {
  const errors = []
  if (!form.name.trim()) errors.push('Enter a product name.')
  if (!form.brand) errors.push('Choose a brand.')
  if (!form.category) errors.push('Choose a category.')
  if (!/^[a-zA-Z0-9_-]+$/.test(form.slug)) errors.push('Enter a URL slug using only letters, numbers, hyphens, or underscores.')
  if (pendingImageUrl.trim()) errors.push('Add the image URL using “Add image URL”, or clear it before saving.')
  if (form.status === 'active' && !form.variants.some((variant) => variant.is_active !== false)) errors.push('Add at least one active variant before publishing.')
  const skus = new Set()
  const dimensions = new Set()
  form.variants.forEach((variant, index) => {
    const label = `Variant ${index + 1}`
    const sku = variant.sku.trim()
    if (!sku || !variant.color_name.trim()) errors.push(`${label}: enter a colour and SKU.`)
    if (!/^\d{1,2}(\.\d)?$/.test(String(variant.size_eu)) || Number(variant.size_eu) <= 0) errors.push(`${label}: enter a valid EU size (up to one decimal place).`)
    if (variant.size_us !== '' && variant.size_us != null && (!/^\d{1,2}(\.\d)?$/.test(String(variant.size_us)) || Number(variant.size_us) <= 0)) errors.push(`${label}: enter a valid US size (up to one decimal place).`)
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(String(variant.price))) errors.push(`${label}: enter a valid price with up to two decimal places.`)
    if (variant.sale_price !== '' && variant.sale_price != null && (!/^\d{1,10}(\.\d{1,2})?$/.test(String(variant.sale_price)) || Number(variant.sale_price) >= Number(variant.price))) errors.push(`${label}: the sale price must be lower than the regular price.`)
    if (!/^\d+$/.test(String(variant.quantity_on_hand)) || Number(variant.quantity_on_hand) < Number(variant.quantity_reserved || 0)) errors.push(`${label}: on-hand stock must be a whole number at least equal to the ${variant.quantity_reserved || 0} reserved.`)
    if (!/^\d+$/.test(String(variant.low_stock_threshold))) errors.push(`${label}: low stock threshold must be a whole number.`)
    if (variant.color_hex && !/^#[0-9a-fA-F]{6}$/.test(variant.color_hex)) errors.push(`${label}: colour hex must look like #8B9A6E.`)
    if (skus.has(sku.toLowerCase())) errors.push(`${label}: each SKU must be different.`)
    skus.add(sku.toLowerCase())
    const dimension = `${variant.color_name.trim().toLowerCase()}|${variant.size_eu}|${variant.width}`
    if (dimensions.has(dimension)) errors.push(`${label}: each colour, EU size, and width combination must be different.`)
    dimensions.add(dimension)
  })
  return errors
}

function variantPayload(variant) {
  const { id, sku, color_name, color_hex, size_eu, size_us, width, price, sale_price, sale_starts_at, sale_ends_at, is_active, quantity_on_hand, low_stock_threshold } = variant
  return { ...(id ? { id } : {}), sku: sku.trim(), color_name: color_name.trim(), color_hex: color_hex || '', size_eu, size_us: size_us === '' ? null : size_us, width, price, sale_price: sale_price === '' ? null : sale_price, sale_starts_at: sale_starts_at || null, sale_ends_at: sale_ends_at || null, is_active, quantity_on_hand: Number(quantity_on_hand), low_stock_threshold: Number(low_stock_threshold ?? 5) }
}

function imagePayload(image, index) {
  const { id, url, color_name, alt_text, is_primary } = image
  return { ...(id ? { id } : {}), url, color_name: color_name || '', alt_text: alt_text || '', position: index, is_primary: Boolean(is_primary) }
}

// For existing objects, only send the fields the admin actually changed. This
// avoids overwriting inventory or metadata that may have changed meanwhile.
function changedFields(current, original) {
  if (!original) return current
  const result = { id: current.id }
  Object.entries(current).forEach(([key, value]) => {
    if (key !== 'id' && JSON.stringify(value) !== JSON.stringify(original[key])) result[key] = value
  })
  return result
}

export function Component() {
  const { productId } = useParams()
  const editing = Boolean(productId)
  const navigate = useNavigate()
  const [form, setForm] = useState(newProduct)
  const [initialProduct, setInitialProduct] = useState(null)
  const [autoSlug, setAutoSlug] = useState(!editing)
  const [brands, setBrands] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [revision, setRevision] = useState(0)
  const [errors, setErrors] = useState([])
  const [imageUrl, setImageUrl] = useState('')
  const [imageError, setImageError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError('')
    Promise.all([api('/brands', { signal: controller.signal }), api('/categories', { signal: controller.signal }), ...(editing ? [api(`/staff/products/${productId}`, { signal: controller.signal })] : [])])
      .then(([brandData, categoryData, productData]) => {
        if (controller.signal.aborted) return
        setBrands(listFrom(brandData))
        setCategories(listFrom(categoryData))
        const initial = editing ? normalizeProduct(payloadFrom(productData)) : newProduct()
        setForm(initial)
        setInitialProduct(editing ? initial : null)
        setAutoSlug(!editing)
        setLoading(false)
      }).catch((reason) => {
        if (!controller.signal.aborted) { setLoadError(reason.message || 'Please try again.'); setLoading(false) }
      })
    return () => controller.abort()
  }, [editing, productId, revision])

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value, ...(name === 'name' && autoSlug ? { slug: slugify(value) } : {}) }))
  const updateVariant = (index, name, value) => setForm((current) => ({ ...current, variants: current.variants.map((variant, i) => i === index ? { ...variant, [name]: value } : variant) }))
  const removeVariant = (index) => {
    const variant = form.variants[index]
    if (variant.id && !window.confirm(`Remove variant ${variant.sku}? It will be made unavailable for sale, while order history is kept.`)) return
    setForm((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }))
  }
  const addImage = () => {
    const value = imageUrl.trim()
    try {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol')
      if (form.images.some((image) => image.url === value)) { setImageError('This image URL has already been added.'); return }
      setForm((current) => ({ ...current, images: [...current.images, { _clientKey: newLocalKey('image'), url: value, color_name: '', alt_text: '', is_primary: current.images.length === 0 }] }))
      setImageUrl('')
      setImageError('')
    } catch { setImageError('Enter a complete image URL starting with https:// or http://.') }
  }
  const removeImage = (index) => setForm((current) => {
    const wasPrimary = current.images[index].is_primary
    const images = current.images.filter((_, i) => i !== index)
    if (wasPrimary && images.length) images[0] = { ...images[0], is_primary: true }
    return { ...current, images }
  })
  const setPrimary = (index) => setForm((current) => ({ ...current, images: current.images.map((image, i) => ({ ...image, is_primary: i === index })) }))

  const submit = async (event) => {
    event.preventDefault()
    const issues = validate(form, imageUrl)
    if (issues.length) { setErrors(issues); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setErrors([])
    setSaving(true)
    try {
      const values = { name: form.name.trim(), slug: form.slug.trim(), brand: form.brand, category: form.category, audience: form.audience, description: form.description || '', status: form.status, is_example_stock: form.is_example_stock }
      const body = editing ? Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== (initialProduct[key] ?? ''))) : values
      const images = form.images.map(imagePayload)
      const variants = form.variants.map(variantPayload)
      const initialImages = initialProduct?.images.map(imagePayload) || []
      const initialVariants = initialProduct?.variants.map(variantPayload) || []
      if (!editing) {
        body.images = images
        body.variants = variants
      } else {
        // Updates are merged on the server; omitted items are not removed.
        // Explicit IDs alone are used for removals so concurrent additions
        // cannot disappear while this form is open.
        const oldVariants = new Map(initialVariants.map((variant) => [variant.id, variant]))
        const changedVariants = variants.map((variant) => {
          const old = oldVariants.get(variant.id)
          const changed = changedFields(variant, old)
          if (old && Object.hasOwn(changed, 'quantity_on_hand')) changed.expected_quantity_on_hand = old.quantity_on_hand
          return changed
        }).filter((variant) => !variant.id || Object.keys(variant).length > 1)
        const keptVariantIds = new Set(variants.map((variant) => variant.id).filter(Boolean))
        const removedVariants = initialVariants.filter((variant) => variant.id && !keptVariantIds.has(variant.id)).map((variant) => variant.id)
        const oldImages = new Map(initialImages.map((image) => [image.id, image]))
        const changedImages = images.map((image) => changedFields(image, oldImages.get(image.id))).filter((image) => !image.id || Object.keys(image).length > 1)
        const keptImageIds = new Set(images.map((image) => image.id).filter(Boolean))
        const removedImages = initialImages.filter((image) => image.id && !keptImageIds.has(image.id)).map((image) => image.id)
        if (changedVariants.length) body.variants = changedVariants
        if (removedVariants.length) body.remove_variant_ids = removedVariants
        if (changedImages.length) body.images = changedImages
        if (removedImages.length) body.remove_image_ids = removedImages
      }
      await api(editing ? `/staff/products/${productId}` : '/staff/products', { method: editing ? 'PATCH' : 'POST', body })
      navigate('/admin/product-control', { state: { message: editing ? 'Product changes saved.' : form.status === 'active' ? 'Product added and published.' : 'Product added as a draft.' } })
    } catch (reason) {
      setErrors(readableErrors(reason))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally { setSaving(false) }
  }

  if (loading) return <LoadingState label={editing ? 'Loading product' : 'Loading product form'} />
  if (loadError) return <ErrorState title="Product form could not load" detail={loadError} onRetry={() => setRevision((value) => value + 1)} />

  return <section className="product-admin">
    <p className="product-admin__crumb"><Link to="/admin/product-control">Product Control</Link> / {editing ? 'Edit Product' : 'Add Product'}</p>
    <div className="product-admin__header"><div><h1 className="page-heading">{editing ? 'Edit Product' : 'Add Product'}</h1><p className="product-admin__intro">{editing ? 'Update your product details and variants.' : 'Add a new shoe to your catalogue.'}</p></div><Link className="product-admin__action product-admin__action--link" to="/admin/product-control">Cancel</Link></div>
    {errors.length > 0 && <div className="status status-error mt-5" role="alert"><strong>Please check the following:</strong><ul className="mt-2 list-disc pl-5">{errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul></div>}
    {(!brands.length || !categories.length) && <p className="status status-error mt-5" role="alert">At least one brand and category must exist before you can add a product.</p>}
    <form onSubmit={submit} noValidate>
      <div className="product-admin__columns">
        <div className="product-admin__stack">
          <section className="surface product-admin__card"><h2>Product details</h2><div className="product-admin__fields">
            <label className="product-admin__field product-admin__full">Product name *<input className="field" value={form.name} maxLength={255} onChange={(event) => update('name', event.target.value)} required /></label>
            <label className="product-admin__field">Brand *<select className="field" value={form.brand} onChange={(event) => update('brand', event.target.value)} required><option value="">Select brand</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
            <label className="product-admin__field">Category *<select className="field" value={form.category} onChange={(event) => update('category', event.target.value)} required><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="product-admin__field">Audience *<select className="field" value={form.audience} onChange={(event) => update('audience', event.target.value)}><option value="unisex">Unisex</option><option value="men">Men</option><option value="women">Women</option><option value="kids">Kids</option></select></label>
            <label className="product-admin__field">URL slug *<input className="field" value={form.slug} maxLength={280} onChange={(event) => { setAutoSlug(false); update('slug', event.target.value) }} required /></label>
            <label className="product-admin__field product-admin__full">Description<textarea className="field" rows="4" value={form.description || ''} onChange={(event) => update('description', event.target.value)} placeholder="Write a product description…" /></label>
          </div></section>
          <section className="surface product-admin__card"><div className="product-admin__card-head"><h2>Variants &amp; inventory</h2><button className="product-admin__action" type="button" onClick={() => update('variants', [...form.variants, newVariant()])}>+ Add variant</button></div>
            <p className="product-admin__hint">Each colour and size has its own SKU, price, and on-hand stock. Reserved stock is already held for orders.</p>
            <label className="mt-4 flex items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={form.is_example_stock} onChange={(event) => update('is_example_stock', event.target.checked)} /> Stock quantities are examples (not verified)</label>
            <p className="product-admin__hint">Customers will see an example-stock warning. Uncheck only after verifying the available sizes and stock for every variant.</p>
            <div className="mt-4">{form.variants.map((variant, index) => <div className="product-admin__variant" key={variant.id ? `existing:${variant.id}` : variant._clientKey}>
              <div className="product-admin__variant-head"><strong>Variant {index + 1}{variant.is_active === false ? ' · Inactive' : ''}</strong><button className="product-admin__action" type="button" onClick={() => removeVariant(index)} aria-label={`Remove variant ${index + 1}`}>Remove</button></div>
              <div className="product-admin__variant-grid">
                <label className="product-admin__field">Colour *<input className="field" maxLength={100} value={variant.color_name} onChange={(event) => updateVariant(index, 'color_name', event.target.value)} /></label>
                <label className="product-admin__field">EU size *<input className="field" type="number" min="1" max="99.9" step="0.5" value={variant.size_eu} onChange={(event) => updateVariant(index, 'size_eu', event.target.value)} /></label>
                <label className="product-admin__field">SKU *<input className="field" maxLength={100} value={variant.sku} onChange={(event) => updateVariant(index, 'sku', event.target.value)} /></label>
                <label className="product-admin__field">Price (₱) *<input className="field" type="number" min="0" step="0.01" value={variant.price} onChange={(event) => updateVariant(index, 'price', event.target.value)} /></label>
                <label className="product-admin__field">On-hand stock *<input className="field" type="number" min={variant.quantity_reserved || 0} step="1" value={variant.quantity_on_hand} onChange={(event) => updateVariant(index, 'quantity_on_hand', event.target.value)} /></label>
              </div>
              <p className="product-admin__hint">Reserved: {variant.quantity_reserved || 0} · Available: {Math.max(0, Number(variant.quantity_on_hand || 0) - Number(variant.quantity_reserved || 0))}</p>
              <details className="product-admin__variant-details"><summary>Additional variant settings</summary><div className="product-admin__fields">
                <label className="product-admin__field">US size (optional)<input className="field" type="number" min="1" max="99.9" step="0.5" value={variant.size_us ?? ''} onChange={(event) => updateVariant(index, 'size_us', event.target.value)} /></label>
                <label className="product-admin__field">Width<select className="field" value={variant.width} onChange={(event) => updateVariant(index, 'width', event.target.value)}><option value="narrow">Narrow</option><option value="regular">Regular</option><option value="wide">Wide</option></select></label>
                <label className="product-admin__field">Colour hex (optional)<input className="field" placeholder="#8B9A6E" value={variant.color_hex || ''} maxLength={7} onChange={(event) => updateVariant(index, 'color_hex', event.target.value)} /></label>
                <label className="product-admin__field">Sale price (₱, optional)<input className="field" type="number" min="0" step="0.01" value={variant.sale_price ?? ''} onChange={(event) => updateVariant(index, 'sale_price', event.target.value)} /></label>
                <label className="product-admin__field">Low stock threshold<input className="field" type="number" min="0" step="1" value={variant.low_stock_threshold ?? 5} onChange={(event) => updateVariant(index, 'low_stock_threshold', event.target.value)} /></label>
                <label className="product-admin__field">Variant availability<select className="field" value={variant.is_active === false ? 'inactive' : 'active'} onChange={(event) => updateVariant(index, 'is_active', event.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              </div></details>
            </div>)}</div>{!form.variants.length && <p className="product-admin__hint">No variants yet. Add one before publishing.</p>}
          </section>
        </div>
        <div className="product-admin__stack">
          <section className="surface product-admin__card"><h2>Product images</h2><p className="product-admin__hint">Add product images using direct image URLs.</p>
            <div className="product-admin__images">{form.images.map((image, index) => <div className="product-admin__image" key={image.id ? `existing:${image.id}` : image._clientKey}><img src={image.url} alt={image.alt_text || ''} /><div className="product-admin__image-info"><div>{image.url}</div><div className="product-admin__image-actions">{image.is_primary ? <strong>Primary image</strong> : <button type="button" onClick={() => setPrimary(index)}>Make primary</button>}<button type="button" onClick={() => removeImage(index)}>Remove<span className="sr-only"> image {index + 1}</span></button></div></div></div>)}</div>
            <label className="product-admin__field mt-4">Image URL<input className="field" type="url" placeholder="https://example.com/shoe.jpg" value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setImageError('') }} /></label>
            {imageError && <p className="status status-error mt-3" role="alert">{imageError}</p>}
            <button className="product-admin__action mt-3" type="button" onClick={addImage}>+ Add image URL</button>
          </section>
          <section className="surface product-admin__card"><h2>Publishing</h2><label className="product-admin__field mt-5">Status<select className="field" value={form.status} onChange={(event) => update('status', event.target.value)}><option value="draft">Draft</option><option value="active">Active</option>{editing && <option value="archived">Archived</option>}</select></label>
            <button className="product-admin__action product-admin__action--primary mt-5 w-full" type="submit" disabled={saving || !brands.length || !categories.length}>{saving ? 'Saving…' : editing ? 'Save changes' : form.status === 'active' ? 'Publish product' : 'Save draft'}</button>
            <p className="product-admin__hint">{form.status === 'active' ? 'Active products are visible in the store.' : 'Draft and archived products are hidden from the store.'}</p>
          </section>
        </div>
      </div>
    </form>
  </section>
}
