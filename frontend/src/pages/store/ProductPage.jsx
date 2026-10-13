import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/features/catalog/hooks'
import { useCartStore } from '@/features/cart/cartStore'
import { useWishlistStore } from '@/features/wishlist/wishlistStore'
import { formatPeso } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { ErrorState, LoadingState } from '@/components/ui/PageState'
import { USE_MOCK } from '@/lib/apiClient'

export function Component() {
  const { slug } = useParams()
  const { data: product, isLoading, isError, error, refetch } = useProduct(slug)
  const add = useCartStore((state) => state.add)
  const saved = useWishlistStore((state) => product ? state.ids.includes(product.id) : false)
  const toggle = useWishlistStore((state) => state.toggle)
  const [size, setSize] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState('')
  if (isLoading) return <div className="container section"><LoadingState label="Loading shoe" /></div>
  if (isError || !product) return <div className="container section"><ErrorState title="This shoe is unavailable." detail={error?.message} onRetry={refetch} /></div>
  const sizes = product.sizes?.length ? product.sizes : [6, 7, 8, 9, 10, 11]
  const onAdd = () => {
    if (!size) { setMessage('Choose a size before adding to your bag.'); return }
    const variant = product.variants?.find((item) => String(item.sizeEu ?? item.size_eu ?? item.size ?? item.size_label) === String(size))
    if (!USE_MOCK && !variant) { setMessage('That size is currently unavailable. Please choose another size.'); return }
    add(product, size, quantity, variant); setMessage(`${product.name} was added to your bag.`)
  }
  return <section className="container section"><div className="mb-5 text-xs font-semibold uppercase tracking-[.11em] text-[var(--olive-gray)]"><Link to="/shop">Shop</Link> <span className="mx-1">/</span> {product.brand} <span className="mx-1">/</span> {product.name}</div><div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
    <div className="grid gap-3 sm:grid-cols-2"><div className="overflow-hidden rounded-ui bg-sand sm:col-span-2"><img src={product.image} alt={product.name} className="aspect-[1.32] h-full w-full object-cover mix-blend-multiply" /></div><div className="hidden overflow-hidden rounded-ui bg-[#EEE] sm:block"><img src={product.image} alt="" className="aspect-square h-full w-full object-cover mix-blend-multiply opacity-85" /></div><div className="hidden overflow-hidden rounded-ui bg-[#e1dacd] sm:block"><img src={product.image} alt="" className="aspect-square h-full w-full object-cover mix-blend-multiply opacity-80" /></div></div>
    <div className="lg:sticky lg:top-5"><p className="eyebrow">{product.brand}</p><div className="flex items-start justify-between gap-4"><h1 className="text-[clamp(46px,5vw,72px)]">{product.name}</h1><button className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-transparent" onClick={() => toggle(product.id)} aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={saved}><Icon name="heart" size={21} strokeWidth={saved ? 2.5 : 1.7} /></button></div><p className="mt-5 text-xl"><strong>{formatPeso(product.salePrice ?? product.price)}</strong>{product.salePrice != null && <s className="ml-3 text-base text-[var(--olive-gray)]">{formatPeso(product.price)}</s>}</p><p className="mt-5 max-w-[530px] leading-6 text-[var(--olive-gray)]">A versatile, made-to-move silhouette with lightweight support and all-day comfort. Designed for the rhythm of real life.</p>
    <div className="mt-8 border-y border-[#262B1F22] py-6"><div className="mb-3 flex justify-between text-sm font-semibold"><span>Select size</span><Link className="text-[var(--olive)]" to="/support/size-guide">Size guide</Link></div><div className="flex flex-wrap gap-2" role="group" aria-label="Select shoe size">{sizes.map((value) => <Chip key={value} selected={String(size) === String(value)} onClick={() => { setSize(value); setMessage('') }}>{value}</Chip>)}</div></div>
    <div className="mt-6 flex gap-3"><div className="flex h-12 items-center rounded-pill border border-[var(--line)]"><button className="grid h-11 w-10 place-items-center border-0 bg-transparent" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))}><Icon name="minus" size={17} /></button><span className="w-5 text-center font-semibold">{quantity}</span><button className="grid h-11 w-10 place-items-center border-0 bg-transparent" aria-label="Increase quantity" onClick={() => setQuantity((value) => value + 1)}><Icon name="plus" size={17} /></button></div><Button className="flex-1" onClick={onAdd}>Add to bag <Icon name="bag" size={18} /></Button></div>{message && <p className={message.includes('Choose') ? 'status status-error mt-4' : 'status status-success mt-4'} role="status">{message}</p>}
    <div className="mt-7 grid gap-4 text-sm"><div className="flex gap-3"><Icon name="truck" size={20} /><span><b>Free delivery over ₱3,500</b><br /><span className="text-[var(--olive-gray)]">Ships in 2–5 working days.</span></span></div><div className="flex gap-3"><Icon name="check" size={20} /><span><b>30-day easy returns</b><br /><span className="text-[var(--olive-gray)]">Try on indoors, return if it is not quite right.</span></span></div></div></div>
  </div></section>
}
