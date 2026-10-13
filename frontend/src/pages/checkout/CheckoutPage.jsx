import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCartStore, selectSubtotal } from '@/features/cart/cartStore'
import { useAuthStore } from '@/features/auth/authStore'
import { api, listFrom, payloadFrom, USE_MOCK } from '@/lib/apiClient'
import { formatPeso, unitPrice } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

const mockShipping = [{ id: 'standard', name: 'Standard delivery', baseFee: 180, estDaysMin: 2, estDaysMax: 5 }]

async function synchronizeCart(items, promoCode) {
  const currentCart = payloadFrom(await api('/cart'))
  const currentItems = listFrom(currentCart)
  const desiredVariantIds = new Set(items.map((item) => String(item.variantId)))
  const existingByVariant = new Map(currentItems.map((item) => [String(item.variant?.id), item]))

  // The local bag is the source of truth for this browser.  Set exact
  // quantities rather than POSTing duplicate lines on each checkout retry.
  const removals = currentItems
    .filter((item) => !desiredVariantIds.has(String(item.variant?.id)))
    .map((item) => api(`/cart/items/${item.id}`, { method: 'DELETE' }))
  const upserts = items.map((item) => {
    const existing = existingByVariant.get(String(item.variantId))
    return existing
      ? api(`/cart/items/${existing.id}`, { method: 'PATCH', body: { quantity: item.qty } })
      : api('/cart/items', { method: 'POST', body: { variantId: item.variantId, quantity: item.qty } })
  })
  await Promise.all([...removals, ...upserts])
  if (promoCode) await api('/cart/promo', { method: 'POST', body: { promoCode } })
  else await api('/cart/promo', { method: 'DELETE' })
}

export function Component() {
  const navigate = useNavigate()
  const items = useCartStore((state) => state.items)
  const promoCode = useCartStore((state) => state.promoCode)
  const clear = useCartStore((state) => state.clear)
  const subtotal = useCartStore(selectSubtotal)
  const user = useAuthStore((state) => state.user)
  const [method, setMethod] = useState('ewallet')
  const [shippingMethods, setShippingMethods] = useState(mockShipping)
  const [shippingId, setShippingId] = useState(mockShipping[0].id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (USE_MOCK) return
    api('/shipping-methods').then((data) => {
      const options = listFrom(data)
      if (options.length) {
        setShippingMethods(options)
        setShippingId(String(options[0].id))
      }
    }).catch(() => {})
  }, [])

  const selectedShipping = useMemo(
    () => shippingMethods.find((item) => String(item.id) === String(shippingId)) ?? shippingMethods[0],
    [shippingId, shippingMethods],
  )
  const shipping = subtotal >= 3500 ? 0 : Number(selectedShipping?.baseFee ?? selectedShipping?.base_fee ?? 180)

  if (!items.length) return <section className="container section"><div className="page-state"><div><h1 className="page-heading">Your bag is empty</h1><p className="mt-4 muted">Add something you love before checking out.</p><Button as={Link} to="/shop" className="mt-5">Shop shoes</Button></div></div></section>

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    const values = Object.fromEntries(new FormData(event.currentTarget))
    try {
      if (USE_MOCK) {
        const orderNumber = `STR-${Math.floor(100000 + Math.random() * 899999)}`
        clear()
        navigate(`/order-confirmation/${orderNumber}`, { state: { order: { orderNumber, email: values.email, grandTotal: subtotal + shipping } } })
        return
      }
      const missingVariant = items.find((item) => !item.variantId)
      if (missingVariant) throw new Error('One or more bag items need to be re-added before checkout so we can confirm their size and stock.')
      await api('/csrf')
      await synchronizeCart(items, promoCode)
      const created = payloadFrom(await api('/checkout/create', {
        method: 'POST',
        body: {
          fullName: values.fullName,
          email: values.email,
          phone: values.phone,
          line1: values.address,
          city: values.city,
          province: values.province,
          postalCode: values.postalCode,
          country: 'PH',
          shippingMethod: shippingId || selectedShipping?.name,
          paymentMethod: method,
          notes: values.note,
        },
      }))
      const order = created?.order ?? created
      if (!order?.id) throw new Error('Your order was created, but its reference could not be read.')
      if (method === 'ewallet') {
        const payment = payloadFrom(await api('/payments/xendit/checkout', {
          method: 'POST',
          body: { paymentId: created?.payment?.id, orderId: order.id, email: values.email },
        }))
        const paymentUrl = payment?.checkoutUrl ?? payment?.checkout_url ?? payment?.payment_url ?? payment?.invoice_url
        if (!paymentUrl) throw new Error('Xendit did not return a checkout link. Please try again or choose cash on delivery.')
        clear()
        window.location.assign(paymentUrl)
        return
      }
      const orderNumber = order.orderNumber ?? order.order_number ?? order.id
      clear()
      navigate(`/order-confirmation/${orderNumber}`, { state: { order: { ...order, email: values.email } } })
    } catch (reason) {
      setError(reason.message || 'Checkout could not be completed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="container section"><div className="mb-8 flex items-end justify-between gap-4"><div><p className="eyebrow">Almost there</p><h1 className="page-heading">Checkout</h1></div><Link className="text-sm font-semibold" to="/cart">← Return to bag</Link></div><form onSubmit={submit} className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_370px]"><div className="grid gap-8"><section className="surface p-5 sm:p-7"><h2 className="text-[31px]">Contact</h2><div className="form-grid mt-5"><label className="field-label form-full">Email address<input className="field" type="email" name="email" required defaultValue={user?.email ?? ''} autoComplete="email" /></label><label className="field-label">Full name<input className="field" name="fullName" required defaultValue={user?.fullName ?? ''} autoComplete="name" /></label><label className="field-label">Phone number<input className="field" name="phone" required autoComplete="tel" inputMode="tel" placeholder="09XX XXX XXXX" /></label></div></section>
    <section className="surface p-5 sm:p-7"><h2 className="text-[31px]">Delivery</h2><div className="form-grid mt-5"><label className="field-label form-full">Address<input className="field" name="address" required autoComplete="street-address" /></label><label className="field-label">City / municipality<input className="field" name="city" required autoComplete="address-level2" /></label><label className="field-label">Province<input className="field" name="province" required autoComplete="address-level1" /></label><label className="field-label">Postal code<input className="field" name="postalCode" required autoComplete="postal-code" /></label><label className="field-label form-full">Delivery note (optional)<input className="field" name="note" placeholder="Unit, landmark or instruction" /></label></div><label className="field-label mt-5">Delivery method<select className="field" value={shippingId} onChange={(event) => setShippingId(event.target.value)}>{shippingMethods.map((option) => <option key={option.id} value={option.id}>{option.name} — {Number(option.baseFee ?? option.base_fee) ? formatPeso(Number(option.baseFee ?? option.base_fee)) : 'Free'}</option>)}</select></label></section>
    <section className="surface p-5 sm:p-7"><h2 className="text-[31px]">Payment</h2><div className="mt-5 grid gap-3"><label className={`flex cursor-pointer items-center gap-3 rounded-ui border p-4 ${method === 'ewallet' ? 'border-[var(--olive)] bg-[#eef1e9]' : 'border-[var(--line)]'}`}><input type="radio" name="payment" checked={method === 'ewallet'} onChange={() => setMethod('ewallet')} /><span><b>Pay securely with Xendit</b><br /><span className="text-sm text-[var(--olive-gray)]">Cards, e-wallets and local payment options.</span></span></label><label className={`flex cursor-pointer items-center gap-3 rounded-ui border p-4 ${method === 'cod' ? 'border-[var(--olive)] bg-[#eef1e9]' : 'border-[var(--line)]'}`}><input type="radio" name="payment" checked={method === 'cod'} onChange={() => setMethod('cod')} /><span><b>Cash on delivery</b><br /><span className="text-sm text-[var(--olive-gray)]">Available for selected locations.</span></span></label></div></section></div>
    <aside className="surface p-5 lg:sticky lg:top-5"><h2 className="text-[31px]">Your order</h2><div className="mt-5 grid gap-4">{items.map((item) => <div className="grid grid-cols-[54px_1fr_auto] items-center gap-3" key={item.key}><img src={item.product.image} alt="" className="h-[54px] w-[54px] rounded-ui bg-sand object-cover mix-blend-multiply" /><span className="text-sm"><b className="block">{item.product.name}</b><span className="text-[var(--olive-gray)]">Size {item.size} · ×{item.qty}</span></span><b className="text-sm">{formatPeso(unitPrice(item.product) * item.qty)}</b></div>)}</div><div className="mt-6 grid gap-3 border-y border-[#262B1F22] py-5 text-sm"><p className="mb-0 flex justify-between"><span>Subtotal</span><b>{formatPeso(subtotal)}</b></p><p className="mb-0 flex justify-between"><span>Delivery</span><b>{shipping ? formatPeso(shipping) : 'Free'}</b></p></div><p className="my-5 flex justify-between text-lg"><b>Total</b><b>{formatPeso(subtotal + shipping)}</b></p>{error && <p className="status status-error" role="alert">{error}</p>}<Button className="w-full" type="submit" disabled={busy}>{busy ? 'Creating your order…' : method === 'ewallet' ? 'Continue to payment' : 'Place order'} <Icon name="arrow" size={17} /></Button><p className="mt-3 flex gap-2 text-xs leading-5 text-[var(--olive-gray)]"><Icon name="check" size={17} />Your payment information is handled securely by Xendit. STRIDE does not store card details.</p></aside></form></section>
}
