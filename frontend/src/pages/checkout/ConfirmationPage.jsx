import { Link, useLocation, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { formatPeso } from '@/lib/format'
export function Component() {
  const { orderNumber } = useParams()
  const order = useLocation().state?.order
  const displayNumber = order?.orderNumber ?? order?.order_number ?? order?.number ?? orderNumber
  const total = order?.grandTotal ?? order?.grand_total ?? order?.total
  const trackingPath = order?.id ? `/account/orders/${order.id}` : '/account/orders'
  return <section className="container section"><div className="mx-auto max-w-[770px] py-8 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sage"><Icon name="check" size={30} /></div><p className="eyebrow mt-7">Order confirmed</p><h1 className="page-heading">You are all set.</h1><p className="mx-auto mt-5 max-w-[480px] leading-6 text-[var(--olive-gray)]">Thanks for choosing STRIDE. We are preparing your order now and will send {order?.email ? `updates to ${order.email}` : 'updates as soon as it leaves our warehouse'}.</p><div className="surface mx-auto mt-8 max-w-[510px] p-5 text-left"><div className="flex justify-between gap-5 border-b border-[#262B1F22] pb-4"><span className="text-sm text-[var(--olive-gray)]">Order number</span><b>{displayNumber}</b></div><div className="flex justify-between gap-5 pt-4"><span className="text-sm text-[var(--olive-gray)]">Estimated delivery</span><b>2–5 working days</b></div>{total != null && <div className="flex justify-between gap-5 pt-4"><span className="text-sm text-[var(--olive-gray)]">Order total</span><b>{formatPeso(Number(total))}</b></div>}</div><div className="mt-8 flex flex-wrap justify-center gap-3"><Button as={Link} to={trackingPath}>Track your order</Button><Button as={Link} to="/shop" variant="secondary">Continue shopping</Button></div><p className="mt-8 text-sm text-[var(--olive-gray)]">Need a hand? <Link className="font-semibold" to="/support">Visit the Help Centre</Link>.</p></div></section>
}
