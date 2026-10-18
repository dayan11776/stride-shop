import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useCartStore, selectSubtotal, priceForItem } from '@/features/cart/cartStore'
import { useAuthStore } from '@/features/auth/authStore'
import { api, listFrom, payloadFrom, USE_MOCK } from '@/lib/apiClient'
import { formatPeso } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'

const mockShipping = [{ id: 'standard', name: 'Standard delivery', baseFee: 180, estDaysMin: 2, estDaysMax: 5 }]

// The demo preview mirrors the live policy: standard delivery is free only
// above ₱3,500, before any promotional discount; express keeps its base rate.
export function mockShippingFee(subtotal, shippingMethod) {
  const method = (shippingMethod?.name ?? 'Standard delivery').trim().toLowerCase()
  const isStandard = method === 'standard' || method === 'standard delivery'
  return isStandard && subtotal > 3500 ? 0 : Number(shippingMethod?.baseFee ?? shippingMethod?.base_fee ?? 180)
}

function pendingPaymentKey(paymentId) {
  return `stride.pending-payment.${paymentId}`
}

function rememberedPaymentEmail(paymentId) {
  if (!paymentId || typeof window === 'undefined') return ''
  try {
    return JSON.parse(window.sessionStorage.getItem(pendingPaymentKey(paymentId)) || '{}').email || ''
  } catch {
    return ''
  }
}

function forgetPendingPayment(paymentId) {
  if (paymentId && typeof window !== 'undefined') window.sessionStorage.removeItem(pendingPaymentKey(paymentId))
}

export async function synchronizeCart(items, promoCode) {
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

// Compare server-authoritative line and order amounts, including discounts
// and shipping, so a changed price is never silently accepted by this screen.
export function quoteSignature(quote) {
  return JSON.stringify({
    items: (quote?.items ?? []).map((line) => ({
      variantId: String(line.variant?.id), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice),
    })).sort((a, b) => a.variantId.localeCompare(b.variantId)),
    subtotal: Number(quote?.subtotal),
    discountTotal: Number(quote?.discountTotal),
    shippingFee: Number(quote?.shippingFee),
    taxTotal: Number(quote?.taxTotal),
    grandTotal: Number(quote?.grandTotal),
  })
}

function ensureQuoteMatchesItems(quote, items) {
  const totals = ['subtotal', 'discountTotal', 'shippingFee', 'taxTotal', 'grandTotal']
  if (!Array.isArray(quote?.items) || totals.some((field) => quote[field] == null || !Number.isFinite(Number(quote[field])))
    || quote.items.some((line) => line.unitPrice == null || line.lineTotal == null || !Number.isFinite(Number(line.unitPrice)) || !Number.isFinite(Number(line.lineTotal)))) {
    throw new Error('Your order total could not be confirmed. Please try again.')
  }
  const expected = items.map((item) => [String(item.variantId), Number(item.qty)]).sort(([a], [b]) => a.localeCompare(b))
  const actual = (quote?.items ?? []).map((item) => [String(item.variant?.id), Number(item.quantity)]).sort(([a], [b]) => a.localeCompare(b))
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Your bag could not be confirmed. Please review it and try again.')
  return quote
}

export function Component() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const items = useCartStore((state) => state.items)
  const promoCode = useCartStore((state) => state.promoCode)
  const clear = useCartStore((state) => state.clear)
  const subtotal = useCartStore(selectSubtotal)
  const user = useAuthStore((state) => state.user)
  const [method, setMethod] = useState('ewallet')
  const [shippingMethods, setShippingMethods] = useState(USE_MOCK ? mockShipping : [])
  const [shippingId, setShippingId] = useState(USE_MOCK ? mockShipping[0].id : '')
  const [shippingLoading, setShippingLoading] = useState(!USE_MOCK)
  const [shippingError, setShippingError] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoteBusy, setQuoteBusy] = useState(!USE_MOCK)
  const [quoteError, setQuoteError] = useState('')
  const [quoteRetry, setQuoteRetry] = useState(0)
  const quoteQueue = useRef(Promise.resolve())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cancelledPaymentId = searchParams.get('paymentCancelled') || ''
  const [cancelEmail, setCancelEmail] = useState(() => rememberedPaymentEmail(cancelledPaymentId) || user?.email || '')
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancellationComplete, setCancellationComplete] = useState(false)

  useEffect(() => {
    if (USE_MOCK) return
    let active = true
    api('/shipping-methods').then((data) => {
      const options = listFrom(data)
      if (!options.length) throw new Error('No delivery methods are available right now.')
      if (active) {
        setShippingMethods(options)
        setShippingId(String(options[0].id))
      }
    }).catch((reason) => { if (active) setShippingError(reason.message || 'Delivery options could not be loaded.') })
      .finally(() => { if (active) setShippingLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    setCancelEmail(rememberedPaymentEmail(cancelledPaymentId) || user?.email || '')
    setCancelError('')
    setCancellationComplete(false)
  }, [cancelledPaymentId, user?.email])

  const selectedShipping = useMemo(
    () => shippingMethods.find((item) => String(item.id) === String(shippingId)) ?? shippingMethods[0],
    [shippingId, shippingMethods],
  )
  const previewShippingFee = mockShippingFee(subtotal, selectedShipping)

  useEffect(() => {
    if (USE_MOCK || cancelledPaymentId || !items.length || shippingLoading || !shippingId) return
    let active = true
    setQuote(null)
    setQuoteError('')
    setQuoteBusy(true)
    const nextQuote = quoteQueue.current.catch(() => {}).then(async () => {
      if (!active) return null
      if (items.some((item) => !item.variantId)) throw new Error('One or more bag items need to be re-added before checkout so we can confirm their size and stock.')
      await api('/csrf')
      await synchronizeCart(items, promoCode)
      return ensureQuoteMatchesItems(payloadFrom(await api('/checkout/quote', { method: 'POST', body: { shippingMethod: shippingId } })), items)
    })
    quoteQueue.current = nextQuote
    nextQuote.then((data) => { if (active) setQuote(data) })
      .catch((reason) => { if (active) setQuoteError(reason.message || 'Your order total could not be confirmed.') })
      .finally(() => { if (active) setQuoteBusy(false) })
    return () => { active = false }
  }, [items, promoCode, shippingId, shippingLoading, cancelledPaymentId, quoteRetry])

  const resumePayment = async () => {
    if (!cancelEmail.trim()) {
      setCancelError('Enter the email address used for this order to continue payment.')
      return
    }
    setCancelBusy(true)
    setCancelError('')
    try {
      await api('/csrf')
      const payment = payloadFrom(await api('/payments/checkout', {
        method: 'POST',
        body: { paymentId: cancelledPaymentId, email: cancelEmail.trim() },
      }))
      const paymentUrl = payment?.checkoutUrl ?? payment?.checkout_url
      if (!paymentUrl) throw new Error('The payment provider did not return a checkout link. Please try again.')
      window.location.assign(paymentUrl)
    } catch (reason) {
      setCancelError(reason.message || 'We could not resume this payment. Please try again.')
      setCancelBusy(false)
    }
  }

  const cancelPayment = async () => {
    if (!cancelEmail.trim()) {
      setCancelError('Enter the email address used for this order to cancel it.')
      return
    }
    setCancelBusy(true)
    setCancelError('')
    try {
      await api('/csrf')
      await api('/payments/paymongo/cancel', {
        method: 'POST',
        body: { paymentId: cancelledPaymentId, email: cancelEmail.trim() },
      })
      forgetPendingPayment(cancelledPaymentId)
      clear()
      setCancellationComplete(true)
    } catch (reason) {
      setCancelError(reason.message || 'We could not cancel this payment. Please try again.')
    } finally {
      setCancelBusy(false)
    }
  }

  if (cancelledPaymentId) {
    if (cancellationComplete) {
      return <section className="container section"><div className="mx-auto max-w-xl surface p-6 text-center sm:p-8"><p className="eyebrow">Payment cancelled</p><h1 className="page-heading mt-3">Your reservation was released.</h1><p className="mt-4 muted">The payment checkout was expired and this order was cancelled. You can return to the shop whenever you are ready.</p><Button as={Link} to="/shop" className="mt-6">Continue shopping <Icon name="arrow" size={17} /></Button></div></section>
    }
    return <section className="container section"><div className="mx-auto max-w-xl surface p-6 sm:p-8"><p className="eyebrow">Payment not completed</p><h1 className="page-heading mt-3">Your order is still waiting for payment.</h1><p className="mt-4 muted">Returning from the payment provider does not cancel an order automatically. You may resume the secure payment page or explicitly cancel this order.</p><label className="field-label mt-6">Email used for the order<input className="field mt-2" type="email" value={cancelEmail} onChange={(event) => setCancelEmail(event.target.value)} autoComplete="email" required /></label>{cancelError && <p className="status status-error mt-4" role="alert">{cancelError}</p>}<div className="mt-6 grid gap-3 sm:grid-cols-2"><Button type="button" onClick={resumePayment} disabled={cancelBusy}>{cancelBusy ? 'Contacting PayMongo…' : 'Resume payment'}</Button><Button type="button" variant="secondary" onClick={cancelPayment} disabled={cancelBusy}>Cancel order</Button></div><Link className="mt-5 inline-block text-sm font-semibold underline" to="/shop">Leave order pending and continue shopping</Link></div></section>
  }

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
        navigate(`/order-confirmation/${orderNumber}`, { state: { order: { orderNumber, email: values.email, grandTotal: subtotal + previewShippingFee, isGuest: !user } } })
        return
      }
      if (!quote || quoteBusy || shippingLoading || shippingError) throw new Error('Please wait until the current order total is confirmed.')
      const missingVariant = items.find((item) => !item.variantId)
      if (missingVariant) throw new Error('One or more bag items need to be re-added before checkout so we can confirm their size and stock.')
      await api('/csrf')
      await synchronizeCart(items, promoCode)
      const latestQuote = ensureQuoteMatchesItems(payloadFrom(await api('/checkout/quote', {
        method: 'POST', body: { shippingMethod: shippingId },
      })), items)
      if (quoteSignature(latestQuote) !== quoteSignature(quote)) {
        setQuote(latestQuote)
        setError('Your price, discount or delivery cost changed. Please review the updated total before placing your order.')
        return
      }
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
          expectedTotal: Number(latestQuote.grandTotal).toFixed(2),
        },
      }))
      const order = created?.order ?? created
      if (!order?.id) throw new Error('Your order was created, but its reference could not be read.')
      if (method === 'ewallet') {
        const payment = payloadFrom(await api('/payments/checkout', {
          method: 'POST',
          body: { paymentId: created?.payment?.id, orderId: order.id, email: values.email },
        }))
        const paymentUrl = payment?.checkoutUrl ?? payment?.checkout_url ?? payment?.payment_url ?? payment?.invoice_url
        if (!paymentUrl) throw new Error('The payment provider did not return a checkout link. Please try again or choose cash on delivery.')
        if (payment?.provider === 'paymongo' && payment?.paymentId) {
          window.sessionStorage.setItem(pendingPaymentKey(payment.paymentId), JSON.stringify({ email: values.email }))
        }
        clear()
        window.location.assign(paymentUrl)
        return
      }
      const orderNumber = order.orderNumber ?? order.order_number ?? order.id
      clear()
      navigate(`/order-confirmation/${orderNumber}`, { state: { order: { ...order, email: values.email, isGuest: !user } } })
    } catch (reason) {
      if (reason?.status === 400 && reason?.body && typeof reason.body === 'object' && ('expectedTotal' in reason.body || 'expected_total' in reason.body)) {
        try {
          const refreshed = ensureQuoteMatchesItems(payloadFrom(await api('/checkout/quote', {
            method: 'POST', body: { shippingMethod: shippingId },
          })), items)
          setQuote(refreshed)
          setError('Your order total changed. Please review the updated amount before placing your order.')
        } catch (refreshError) {
          setQuote(null)
          setQuoteError(refreshError.message || 'Your updated order total could not be confirmed.')
          setError('')
        }
      } else {
        setError(reason.message || 'Checkout could not be completed. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  const displayedSubtotal = USE_MOCK ? subtotal : quote?.subtotal
  const displayedShipping = USE_MOCK ? previewShippingFee : quote?.shippingFee
  const displayedDiscount = USE_MOCK ? 0 : quote?.discountTotal
  const displayedTax = USE_MOCK ? 0 : quote?.taxTotal
  const displayedTotal = USE_MOCK ? subtotal + previewShippingFee : quote?.grandTotal
  const displayMoney = (value) => value == null ? '—' : formatPeso(Number(value))

  return <section className="container section"><div className="mb-8 flex items-end justify-between gap-4"><div><p className="eyebrow">Almost there</p><h1 className="page-heading">Checkout</h1></div><Link className="text-sm font-semibold" to="/cart">← Return to bag</Link></div><form onSubmit={submit} className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_370px]"><div className="grid gap-8"><section className="surface p-5 sm:p-7"><h2 className="text-[31px]">Contact</h2><div className="form-grid mt-5"><label className="field-label form-full">Email address<input className="field" type="email" name="email" required defaultValue={user?.email ?? ''} autoComplete="email" /></label><label className="field-label">Full name<input className="field" name="fullName" required defaultValue={user?.fullName ?? ''} autoComplete="name" /></label><label className="field-label">Phone number<input className="field" name="phone" required autoComplete="tel" inputMode="tel" placeholder="09XX XXX XXXX" /></label></div></section>
    <section className="surface p-5 sm:p-7"><h2 className="text-[31px]">Delivery</h2><div className="form-grid mt-5"><label className="field-label form-full">Address<input className="field" name="address" required autoComplete="street-address" /></label><label className="field-label">City / municipality<input className="field" name="city" required autoComplete="address-level2" /></label><label className="field-label">Province<input className="field" name="province" required autoComplete="address-level1" /></label><label className="field-label">Postal code<input className="field" name="postalCode" required autoComplete="postal-code" /></label><label className="field-label form-full">Delivery note (optional)<input className="field" name="note" placeholder="Unit, landmark or instruction" /></label></div><label className="field-label mt-5">Delivery method<select className="field" value={shippingId} onChange={(event) => setShippingId(event.target.value)}>{shippingMethods.map((option) => <option key={option.id} value={option.id}>{option.name} — {Number(option.baseFee ?? option.base_fee) ? `Base rate ${formatPeso(Number(option.baseFee ?? option.base_fee))}` : 'Free'}</option>)}</select></label></section>
    <section className="surface p-5 sm:p-7"><h2 className="text-[31px]">Payment</h2><div className="mt-5 grid gap-3"><label className={`flex cursor-pointer items-center gap-3 rounded-ui border p-4 ${method === 'ewallet' ? 'border-[var(--olive)] bg-[#eef1e9]' : 'border-[var(--line)]'}`}><input type="radio" name="payment" checked={method === 'ewallet'} onChange={() => setMethod('ewallet')} /><span><b>Pay securely online</b><br /><span className="text-sm text-[var(--olive-gray)]">Cards, e-wallets, QR Ph and enabled local payment options.</span></span></label><label className={`flex cursor-pointer items-center gap-3 rounded-ui border p-4 ${method === 'cod' ? 'border-[var(--olive)] bg-[#eef1e9]' : 'border-[var(--line)]'}`}><input type="radio" name="payment" checked={method === 'cod'} onChange={() => setMethod('cod')} /><span><b>Cash on delivery</b><br /><span className="text-sm text-[var(--olive-gray)]">Available for selected locations.</span></span></label></div></section></div>
    <aside className="surface p-5 lg:sticky lg:top-5"><h2 className="text-[31px]">Your order</h2>{items.some((item) => item.product.isExamplePrice || item.product.isExampleStock) && <p className="status mt-4 text-sm">Some prices, sizes or stock are examples and have not been verified. The displayed total may still be charged if you place an order. Please confirm details with the store.</p>}<div className="mt-5 grid gap-4">{items.map((item) => {
      const quotedLine = quote?.items?.find((line) => String(line.variant?.id) === String(item.variantId))
      const lineTotal = USE_MOCK ? priceForItem(item) * item.qty : quotedLine?.lineTotal
      const colorName = item.variant?.colorName ?? item.variant?.color_name
      return <div className="grid grid-cols-[54px_1fr_auto] items-center gap-3" key={item.key}><img src={item.product.image} alt="" className="h-[54px] w-[54px] rounded-ui bg-sand object-cover mix-blend-multiply" /><span className="text-sm"><b className="block">{item.product.name}</b><span className="text-[var(--olive-gray)]">{colorName ? `${colorName} · ` : ''}EU size {item.size}{item.variant?.width && item.variant.width !== 'regular' ? ` · ${item.variant.width} width` : ''} · ×{item.qty}</span></span><b className="text-sm">{displayMoney(lineTotal)}</b></div>
    })}</div><div className="mt-6 grid gap-3 border-y border-[#262B1F22] py-5 text-sm"><p className="mb-0 flex justify-between"><span>Subtotal</span><b>{displayMoney(displayedSubtotal)}</b></p>{Number(displayedDiscount) > 0 && <p className="mb-0 flex justify-between"><span>Discount</span><b>−{displayMoney(displayedDiscount)}</b></p>}<p className="mb-0 flex justify-between"><span>Delivery</span><b>{displayMoney(displayedShipping)}</b></p>{Number(displayedTax) > 0 && <p className="mb-0 flex justify-between"><span>Tax</span><b>{displayMoney(displayedTax)}</b></p>}</div><p className="my-5 flex justify-between text-lg"><b>Total</b><b>{displayMoney(displayedTotal)}</b></p>{(quoteBusy || shippingLoading) && <p className="mb-3 text-sm text-[var(--olive-gray)]" role="status">Confirming current prices and delivery…</p>}{shippingError && <p className="status status-error mb-3" role="alert">{shippingError} Please refresh to retry.</p>}{quoteError && <div className="mb-3"><p className="status status-error" role="alert">{quoteError}</p><button className="mt-2 text-sm font-semibold underline" type="button" onClick={() => setQuoteRetry((value) => value + 1)}>Retry order total</button></div>}{error && <p className="status status-error" role="alert">{error}</p>}<Button className="w-full" type="submit" disabled={busy || shippingLoading || quoteBusy || Boolean(shippingError) || (!USE_MOCK && !quote)}>{busy ? 'Creating your order…' : method === 'ewallet' ? 'Continue to payment' : 'Place order'} <Icon name="arrow" size={17} /></Button><p className="mt-3 flex gap-2 text-xs leading-5 text-[var(--olive-gray)]"><Icon name="check" size={17} />Your payment information is handled securely by the selected payment provider. STRIDE does not store card details.</p></aside></form></section>
}

