import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/features/catalog/hooks'
import { MAX_PER_LINE, useCartStore } from '@/features/cart/cartStore'
import { useWishlistStore } from '@/features/wishlist/wishlistStore'
import { formatPeso } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { ErrorState, LoadingState } from '@/components/ui/PageState'
import { USE_MOCK } from '@/lib/apiClient'
import { findVariantForSize, isVariantAvailable, shoeSizeKey } from '@/lib/shoeSize'

const colorOf = (variant) => variant.colorName ?? variant.color_name ?? ''
const sizeOf = (variant) => variant.sizeEu ?? variant.size_eu ?? variant.size ?? variant.size_label

export function Component() {
  const { slug } = useParams()
  const { data: product, isLoading, isError, error, refetch } = useProduct(slug)
  const add = useCartStore((state) => state.add)
  const saved = useWishlistStore((state) => product ? state.ids.includes(product.id) : false)
  const toggle = useWishlistStore((state) => state.toggle)
  const [size, setSize] = useState(null)
  const [color, setColor] = useState('')
  const [width, setWidth] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState('')
  const [failedImage, setFailedImage] = useState(null)
  if (isLoading) return <div className="container section"><LoadingState label="Loading shoe" /></div>
  if (isError || !product) return <div className="container section"><ErrorState title="This shoe is unavailable." detail={error?.message} onRetry={refetch} /></div>

  const variants = product.variants ?? []
  const mockWithoutVariants = USE_MOCK && variants.length === 0
  const availableVariants = variants.filter(isVariantAvailable)
  const colors = [...new Set(availableVariants.map(colorOf).filter(Boolean))]
  const selectedColor = colors.includes(color) ? color : colors[0]
  const colorVariants = availableVariants.filter((variant) => !selectedColor || colorOf(variant) === selectedColor)
  const sizes = mockWithoutVariants
    ? (product.sizes ?? [])
    : [...new Set(colorVariants.map((variant) => shoeSizeKey(sizeOf(variant))).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
  const sizeVariants = colorVariants.filter((variant) => shoeSizeKey(sizeOf(variant)) === shoeSizeKey(size))
  const widths = [...new Set(sizeVariants.map((variant) => variant.width ?? 'regular'))]
  const selectedWidth = widths.includes(width) ? width : widths[0]
  const variant = size == null ? undefined : findVariantForSize(colorVariants, size, { color: selectedColor, width: selectedWidth })
  const currentPrice = variant ? Number(variant.currentPrice ?? variant.current_price ?? variant.price) : Number(product.salePrice ?? product.price)
  const listPrice = variant ? Number(variant.price) : Number(product.price)
  const maxQuantity = variant ? Math.max(1, Math.min(MAX_PER_LINE, Number(variant.available ?? MAX_PER_LINE))) : MAX_PER_LINE
  const colorImage = product.images?.find((entry) => (entry.colorName ?? entry.color_name) === selectedColor)
  const sourceImage = colorImage?.url || product.image
  const imageUrl = typeof sourceImage === 'string' ? sourceImage.trim() : ''
  const placeholder = '/images/product-placeholder.svg'
  const hasPhoto = Boolean(imageUrl && imageUrl !== placeholder && imageUrl !== failedImage)
  const image = hasPhoto ? imageUrl : placeholder
  const handleImageError = hasPhoto ? () => setFailedImage(imageUrl) : undefined

  const onAdd = () => {
    if (size == null) { setMessage('Choose a size before adding to your bag.'); return }
    if (!mockWithoutVariants && !variant) { setMessage('That size is currently unavailable. Please choose another size.'); return }
    add({ ...product, image }, size, Math.min(quantity, maxQuantity), variant ?? null)
    setMessage(`${product.name} was added to your bag.`)
  }

  return <section className="container section"><div className="mb-5 text-xs font-semibold uppercase tracking-[.11em] text-[var(--olive-gray)]"><Link to="/shop">Shop</Link> <span className="mx-1">/</span> {product.brand} <span className="mx-1">/</span> {product.name}</div><div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
    <div className="grid gap-3 sm:grid-cols-2"><div className="overflow-hidden rounded-ui bg-sand sm:col-span-2"><img src={image} alt={hasPhoto ? product.name : 'Product image unavailable'} onError={handleImageError} className="aspect-[1.32] h-full w-full object-cover mix-blend-multiply" /></div><div className="hidden overflow-hidden rounded-ui bg-[#EEE] sm:block"><img src={image} alt="" onError={handleImageError} className="aspect-square h-full w-full object-cover mix-blend-multiply opacity-85" /></div><div className="hidden overflow-hidden rounded-ui bg-[#e1dacd] sm:block"><img src={image} alt="" onError={handleImageError} className="aspect-square h-full w-full object-cover mix-blend-multiply opacity-80" /></div></div>
    <div className="lg:sticky lg:top-5"><p className="eyebrow">{product.brand}</p><div className="flex items-start justify-between gap-4"><h1 className="text-[clamp(46px,5vw,72px)]">{product.name}</h1><button className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-transparent" onClick={() => toggle(product.id)} aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={saved}><Icon name="heart" size={21} strokeWidth={saved ? 2.5 : 1.7} /></button></div><p className="mt-5 text-xl">{!variant && !mockWithoutVariants && availableVariants.length > 0 && <span className="mr-2 text-sm">From</span>}<strong>{formatPeso(currentPrice)}</strong>{Number.isFinite(listPrice) && currentPrice < listPrice && <s className="ml-3 text-base text-[var(--olive-gray)]">{formatPeso(listPrice)}</s>}</p><p className="mt-5 max-w-[530px] leading-6 text-[var(--olive-gray)]">{product.description || 'A versatile, made-to-move silhouette with lightweight support and all-day comfort. Designed for the rhythm of real life.'}</p>
    {colors.length > 0 && <div className="mt-8"><p className="mb-3 text-sm font-semibold">Colour: {selectedColor}</p><div className="flex flex-wrap gap-2" role="group" aria-label="Select colour">{colors.map((value) => <Chip key={value} selected={value === selectedColor} onClick={() => { setColor(value); setSize(null); setWidth(''); setQuantity(1); setMessage('') }}>{value}</Chip>)}</div></div>}
    <div className="mt-8 border-y border-[#262B1F22] py-6"><div className="mb-3 flex justify-between text-sm font-semibold"><span>Select EU size</span><Link className="text-[var(--olive)]" to="/support/size-guide">Size guide</Link></div>{product.isExampleStock && <p className="mb-3 text-sm font-semibold text-[var(--olive-gray)]">Example sizes and stock are not verified. Please confirm availability with the store.</p>}{sizes.length ? <div className="flex flex-wrap gap-2" role="group" aria-label="Select shoe size">{sizes.map((value) => <Chip key={value} selected={shoeSizeKey(size) === shoeSizeKey(value)} onClick={() => { setSize(value); setWidth(''); setQuantity(1); setMessage('') }}>{value}</Chip>)}</div> : <p className="text-sm text-[var(--olive-gray)]">{product.isExampleStock ? 'No sizes are shown for the example stock.' : 'No sizes are currently available.'}</p>}
      {widths.length > 1 && <div className="mt-5"><p className="mb-3 text-sm font-semibold">Select width</p><div className="flex flex-wrap gap-2" role="group" aria-label="Select shoe width">{widths.map((value) => <Chip key={value} selected={selectedWidth === value} onClick={() => { setWidth(value); setQuantity(1); setMessage('') }}>{value}</Chip>)}</div></div>}
      {variant?.available != null && <p className="mt-3 text-xs text-[var(--olive-gray)]">{product.isExampleStock ? `Example stock: ${variant.available} ${Number(variant.available) === 1 ? 'pair' : 'pairs'} for this option (not verified).` : `${variant.available} pairs available in this option.`}</p>}
    </div>
    <div className="mt-6 flex gap-3"><div className="flex h-12 items-center rounded-pill border border-[var(--line)]"><button className="grid h-11 w-10 place-items-center border-0 bg-transparent" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))}><Icon name="minus" size={17} /></button><span className="w-5 text-center font-semibold">{quantity}</span><button className="grid h-11 w-10 place-items-center border-0 bg-transparent" aria-label="Increase quantity" disabled={quantity >= maxQuantity} onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}><Icon name="plus" size={17} /></button></div><Button className="flex-1" onClick={onAdd} disabled={!sizes.length}>Add to bag <Icon name="bag" size={18} /></Button></div>{message && <p className={`status ${message.includes('added') ? 'status-success' : 'status-error'} mt-4`} role="status">{message}</p>}
    <div className="mt-7 grid gap-4 text-sm"><div className="flex gap-3"><Icon name="truck" size={20} /><span><b>Delivery options at checkout</b><br /><span className="text-[var(--olive-gray)]">Ships in 2–5 working days.</span></span></div><div className="flex gap-3"><Icon name="check" size={20} /><span><b>30-day easy returns</b><br /><span className="text-[var(--olive-gray)]">Try on indoors, return if it is not quite right.</span></span></div></div></div>
  </div></section>
}
