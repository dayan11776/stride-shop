import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/PageState'
import { Icon } from '@/components/ui/Icon'
import { useAuthStore } from '@/features/auth/authStore'
import { useWishlistStore } from '@/features/wishlist/wishlistStore'
import { useProducts } from '@/features/catalog/hooks'
import { ProductCard } from '@/features/catalog/components/ProductCard'
import { api, listFrom, payloadFrom, USE_MOCK } from '@/lib/apiClient'
import { formatPeso } from '@/lib/format'

const accountLinks = [
  ['Profile', '/account/profile', 'Edit your personal details.'],
  ['Addresses', '/account/addresses', 'Manage delivery addresses.'],
  ['Order history', '/account/orders', 'Follow every order from checkout to delivery.'],
  ['Returns & exchanges', '/account/returns', 'Start or review a return request.'],
  ['Wishlist', '/account/wishlist', 'Keep your next pair within reach.'],
]

function useResource(path, fallback = []) {
  const [state, setState] = useState({ loading: !USE_MOCK, data: fallback, error: '' })
  const load = async () => {
    if (USE_MOCK) { setState({ loading: false, data: fallback, error: '' }); return }
    setState((current) => ({ ...current, loading: true, error: '' }))
    try { setState({ loading: false, data: payloadFrom(await api(path)), error: '' }) }
    catch (error) { setState((current) => ({ ...current, loading: false, error: error.message || 'We could not load this page.' })) }
  }
  useEffect(() => { load() }, [path])
  return { ...state, reload: load, setState }
}

export function AccountOverview() {
  const user = useAuthStore((state) => state.user)
  return <article><p className="eyebrow">Your STRIDE space</p><h1 className="page-heading">Hello, {user?.fullName?.split(' ')[0] || 'there'}.</h1><p className="mt-5 max-w-[590px] leading-6 text-[var(--olive-gray)]">Everything you need for a smoother stride: your saved pairs, delivery details, orders and returns.</p><div className="mt-10 grid gap-3 sm:grid-cols-2">{accountLinks.map(([title, to, copy]) => <Link key={to} to={to} className="group rounded-ui border border-[#262B1F22] bg-white/20 p-5 no-underline hover:bg-sand"><span className="flex items-center justify-between"><h2 className="text-[29px]">{title}</h2><Icon name="arrow" size={18} className="transition group-hover:translate-x-1" /></span><p className="mb-0 mt-3 text-sm leading-5 text-[var(--olive-gray)]">{copy}</p></Link>)}</div><div className="mt-8 rounded-ui bg-ink p-6 text-cream"><p className="eyebrow !text-sage">Need a hand?</p><h2 className="text-[34px]">We are here for the whole journey.</h2><Link className="mt-4 inline-flex items-center gap-2 text-sm font-bold" to="/support/contact">Talk to support <Icon name="arrow" size={17} /></Link></div></article>
}

export function ProfileView() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setNotice(''); setError('')
    const body = Object.fromEntries(new FormData(event.currentTarget))
    try {
      const updated = USE_MOCK ? { ...user, fullName: body.fullName, phone: body.phone } : payloadFrom(await api('/account/profile', { method: 'PATCH', body }))
      setUser(updated?.user ?? updated); setNotice('Your profile has been saved.')
    } catch (reason) { setError(reason.message || 'Your profile could not be saved.') } finally { setBusy(false) }
  }
  return <article className="max-w-[680px]"><p className="eyebrow">Account details</p><h1 className="page-heading">Your profile</h1><form className="surface mt-8 grid gap-5 p-5 sm:p-7" onSubmit={submit}><label className="field-label">Full name<input className="field" name="fullName" required defaultValue={user?.fullName || ''} autoComplete="name" /></label><label className="field-label">Email address<input className="field opacity-70" value={user?.email || ''} disabled /></label><label className="field-label">Phone number<input className="field" name="phone" defaultValue={user?.phone || ''} autoComplete="tel" /></label>{notice && <p className="status status-success mb-0" role="status">{notice}</p>}{error && <p className="status status-error mb-0" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button></form></article>
}

const blankAddress = { label: '', recipientName: '', phone: '', line1: '', line2: '', city: '', province: '', postalCode: '', country: 'PH', isDefault: false }

export function AddressesView() {
  const { data, loading, error, reload, setState } = useResource('/account/addresses')
  const addresses = Array.isArray(data) ? data : listFrom(data)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const save = async (event) => {
    event.preventDefault(); setBusy(true)
    const values = Object.fromEntries(new FormData(event.currentTarget)); values.isDefault = Boolean(event.currentTarget.isDefault.checked)
    try {
      if (USE_MOCK) {
        const item = editing?.id ? { ...editing, ...values, isDefault: values.isDefault } : { ...values, id: crypto.randomUUID?.() || String(Date.now()) }
        const next = editing?.id ? addresses.map((address) => address.id === item.id ? item : address) : [...addresses, item]
        setState({ loading: false, data: next, error: '' })
      } else if (editing?.id) await api(`/account/addresses/${editing.id}`, { method: 'PATCH', body: values })
      else await api('/account/addresses', { method: 'POST', body: values })
      setEditing(null); if (!USE_MOCK) await reload()
    } catch (reason) { setState((current) => ({ ...current, error: reason.message || 'Address could not be saved.' })) } finally { setBusy(false) }
  }
  const remove = async (id) => {
    if (!window.confirm('Remove this address?')) return
    try { if (USE_MOCK) setState({ loading: false, data: addresses.filter((address) => address.id !== id), error: '' }); else { await api(`/account/addresses/${id}`, { method: 'DELETE' }); await reload() } } catch (reason) { setState((current) => ({ ...current, error: reason.message || 'Address could not be removed.' })) }
  }
  if (loading) return <LoadingState label="Loading your addresses" />
  return <article><p className="eyebrow">Delivery details</p><div className="flex flex-wrap items-end justify-between gap-4"><h1 className="page-heading">Addresses</h1><Button variant="secondary" onClick={() => setEditing(blankAddress)}>Add address</Button></div>{error && <p className="status status-error mt-6" role="alert">{error}</p>}<div className="mt-8 grid gap-3 sm:grid-cols-2">{addresses.map((address) => <section className="surface p-5" key={address.id}><div className="flex justify-between gap-3"><h2 className="text-[27px]">{address.label || 'Delivery address'}</h2>{address.isDefault && <span className="tag green">Default</span>}</div><p className="mt-4 mb-0 text-sm leading-6 text-[var(--olive-gray)]"><b className="text-[var(--ink)]">{address.recipientName}</b><br />{address.line1}{address.line2 && <><br />{address.line2}</>}<br />{address.city}{address.province && `, ${address.province}`} {address.postalCode}<br />{address.phone}</p><div className="mt-5 flex gap-4 text-sm font-semibold"><button className="border-0 bg-transparent p-0 underline" onClick={() => setEditing(address)}>Edit</button><button className="border-0 bg-transparent p-0 underline" onClick={() => remove(address.id)}>Remove</button></div></section>)}</div>{!addresses.length && !editing && <div className="page-state"><div><h2 className="text-[34px]">No saved addresses yet.</h2><p className="mt-3 muted">Add one now for a faster checkout next time.</p></div></div>}{editing && <form className="surface mt-8 grid gap-4 p-5 sm:p-7" onSubmit={save}><div className="flex items-center justify-between"><h2 className="text-[32px]">{editing.id ? 'Edit address' : 'Add an address'}</h2><button type="button" className="border-0 bg-transparent underline" onClick={() => setEditing(null)}>Close</button></div><div className="form-grid"><label className="field-label">Label<input className="field" name="label" defaultValue={editing.label} placeholder="Home, office…" /></label><label className="field-label">Recipient name<input className="field" name="recipientName" required defaultValue={editing.recipientName} /></label><label className="field-label">Phone<input className="field" name="phone" required defaultValue={editing.phone} /></label><label className="field-label form-full">Address line 1<input className="field" name="line1" required defaultValue={editing.line1} /></label><label className="field-label form-full">Address line 2<input className="field" name="line2" defaultValue={editing.line2} /></label><label className="field-label">City<input className="field" name="city" required defaultValue={editing.city} /></label><label className="field-label">Province<input className="field" name="province" defaultValue={editing.province} /></label><label className="field-label">Postal code<input className="field" name="postalCode" required defaultValue={editing.postalCode} /></label><label className="field-label">Country<input className="field" name="country" maxLength="2" defaultValue={editing.country || 'PH'} /></label></div><label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" name="isDefault" defaultChecked={editing.isDefault} /> Make this my default address</label><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</Button></form>}</article>
}

function orderDate(value) { return value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }

export function OrderHistoryView() {
  const { data, loading, error, reload } = useResource('/account/orders')
  const orders = Array.isArray(data) ? data : listFrom(data)
  if (loading) return <LoadingState label="Loading your orders" />
  return <article><p className="eyebrow">Every step, visible</p><h1 className="page-heading">Order history</h1>{error && <ErrorState title="Orders could not load" detail={error} onRetry={reload} />}{!error && <div className="table-wrap mt-8"><table className="data-table"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><b>{order.orderNumber ?? order.order_number}</b></td><td>{orderDate(order.placedAt ?? order.placed_at)}</td><td><span className="tag">{order.status}</span></td><td>{formatPeso(Number(order.grandTotal ?? order.grand_total ?? 0))}</td><td><Link className="font-semibold" to={`/account/orders/${order.id}`}>Track</Link></td></tr>)}</tbody></table></div>}{!error && !orders.length && <div className="page-state"><div><h2 className="text-[34px]">No orders just yet.</h2><p className="mt-3 muted">When you find your next pair, it will appear here.</p><Button as={Link} to="/shop" className="mt-5">Shop shoes</Button></div></div>}</article>
}

export function OrderTrackingView() {
  const { orderId } = useParams()
  const { data: order, loading, error, reload } = useResource(`/account/orders/${orderId}`, null)
  if (loading) return <LoadingState label="Loading order details" />
  if (error || !order) return <ErrorState title="This order is unavailable." detail={error} onRetry={reload} />
  const shipment = order.shipments?.[0]
  const steps = ['pending', 'paid', 'packed', 'shipped', 'delivered']; const active = Math.max(0, steps.indexOf(order.status))
  return <article className="max-w-[800px]"><p className="eyebrow">Order {order.orderNumber}</p><h1 className="page-heading">Track your order</h1><div className="surface mt-8 p-5 sm:p-7"><div className="flex flex-wrap justify-between gap-5"><div><p className="mb-1 text-sm text-[var(--olive-gray)]">Current status</p><h2 className="text-[35px]">{order.status}</h2></div><div className="text-sm"><p className="mb-1 text-[var(--olive-gray)]">Estimated delivery</p><b>{shipment?.deliveredAt ? 'Delivered' : '2–5 working days'}</b></div></div><ol className="mt-9 grid gap-4 sm:grid-cols-5">{steps.map((step, index) => <li key={step} className={`border-t-4 pt-3 text-sm ${index <= active ? 'border-[var(--olive)] text-[var(--ink)]' : 'border-[#262B1F22] text-[var(--olive-gray)]'}`}><b className="capitalize">{step}</b><br /><span>{index <= active ? 'Updated' : 'Next'}</span></li>)}</ol>{shipment?.trackingNumber && <p className="mt-7 status status-success">Tracking number: <b>{shipment.trackingNumber}</b></p>}</div><h2 className="mt-10 text-[34px]">Items</h2><div className="mt-4 grid gap-3">{order.items?.map((item) => <div className="surface flex items-center justify-between gap-5 p-4" key={item.id}><span><b>{item.productName}</b><br /><small className="text-[var(--olive-gray)]">{item.colorName} · EU {item.sizeEu} · ×{item.quantity}</small></span><b>{formatPeso(Number(item.lineTotal))}</b></div>)}</div></article>
}

export function ReturnsView() {
  const { data, loading, error, reload } = useResource('/account/returns')
  const returns = Array.isArray(data) ? data : listFrom(data)
  if (loading) return <LoadingState label="Loading your returns" />
  return <article><p className="eyebrow">Easy by design</p><h1 className="page-heading">Returns & exchanges</h1><p className="mt-5 max-w-[610px] leading-6 text-[var(--olive-gray)]">Unworn pairs in original packaging can be requested within 30 days of delivery. Start from the order you want to return, or contact our team for help.</p><div className="mt-8 flex flex-wrap gap-3"><Button as={Link} to="/account/orders">Choose an order</Button><Button as={Link} to="/support/contact" variant="secondary">Contact support</Button></div>{error && <ErrorState title="Returns could not load" detail={error} onRetry={reload} />}{!error && returns.length > 0 && <div className="mt-10 grid gap-3">{returns.map((request) => <div className="surface flex flex-wrap items-center justify-between gap-4 p-5" key={request.id}><span><b>{request.orderNumber}</b><br /><small className="text-[var(--olive-gray)]">{request.resolution} · requested {orderDate(request.requestedAt)}</small></span><span className="tag">{request.status}</span></div>)}</div>}{!error && !returns.length && <div className="mt-10 rounded-ui bg-sand p-6"><h2 className="text-[33px]">No active return requests.</h2><p className="mt-2 mb-0 text-sm leading-6 text-[var(--olive-gray)]">You can begin a request once your order has shipped or been delivered.</p></div>}</article>
}

export function WishlistView() {
  const ids = useWishlistStore((state) => state.ids)
  const toggle = useWishlistStore((state) => state.toggle)
  const { data: products = [], isLoading, isError, error, refetch } = useProducts({})
  const saved = useMemo(() => products.filter((product) => ids.some((id) => String(id) === String(product.id))), [ids, products])
  return <article><p className="eyebrow">Your saved pairs</p><h1 className="page-heading">Wishlist</h1>{isLoading && <LoadingState label="Loading your saved shoes" />}{isError && <ErrorState title="Wishlist could not load" detail={error?.message} onRetry={refetch} />}{!isLoading && !isError && saved.length > 0 && <div className="grid mt-8">{saved.map((product) => <ProductCard key={product.id} product={product} saved onToggle={() => toggle(product.id)} />)}</div>}{!isLoading && !isError && !saved.length && <div className="page-state"><div><h2 className="text-[34px]">Nothing saved yet.</h2><p className="mt-3 muted">Tap the heart on a pair you want to come back to.</p><Button as={Link} to="/shop" className="mt-5">Explore the shop</Button></div></div>}</article>
}
