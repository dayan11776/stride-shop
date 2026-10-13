import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/PageState'
import { Icon } from '@/components/ui/Icon'
import { api, listFrom, payloadFrom, USE_MOCK } from '@/lib/apiClient'
import { formatPeso } from '@/lib/format'

function readPath(value, path) {
  return path.split('.').reduce((current, part) => current?.[part], value)
}

function pretty(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return value.name ?? value.label ?? '—'
  return String(value).replaceAll('_', ' ')
}

function useAdminResource(path, fallback = []) {
  const [state, setState] = useState({ loading: !USE_MOCK, data: fallback, error: '' })
  const reload = async () => {
    if (USE_MOCK) {
      setState({ loading: false, data: fallback, error: '' })
      return
    }
    setState((current) => ({ ...current, loading: true, error: '' }))
    try {
      setState({ loading: false, data: payloadFrom(await api(path)), error: '' })
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || 'This data could not be loaded.' }))
    }
  }
  useEffect(() => { reload() }, [path])
  return { ...state, reload }
}

const fallbackDashboard = { orders: 0, pendingOrders: 0, customers: 0, revenue: 0, lowStockVariants: 0, openReturns: 0 }

export function AdminDashboard() {
  const { data, loading, error, reload } = useAdminResource('/staff/dashboard', fallbackDashboard)
  if (loading) return <LoadingState label="Loading store performance" />
  if (error) return <ErrorState title="Dashboard could not load" detail={error} onRetry={reload} />
  const metrics = [
    ['Revenue', formatPeso(Number(data.revenue || 0)), 'Paid orders'],
    ['Orders', data.orders ?? 0, `${data.pendingOrders ?? 0} awaiting payment`],
    ['Customers', data.customers ?? 0, 'Registered shoppers'],
    ['Low stock', data.lowStockVariants ?? 0, 'Variants to review'],
    ['Open returns', data.openReturns ?? 0, 'Requests needing attention'],
  ]
  return <section>
    <p className="eyebrow">Back office</p>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="page-heading">Dashboard</h1>
      <Button as={Link} to="/admin/products" variant="secondary">Manage inventory <Icon name="arrow" size={16} /></Button>
    </div>
    <div className="mt-9 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map(([label, value, note]) => <div className="rounded-ui border border-[#262B1F22] bg-white/25 p-5" key={label}>
        <p className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-[var(--olive-gray)]">{label}</p>
        <strong className="font-display text-[38px] uppercase leading-none">{value}</strong>
        <p className="mb-0 mt-3 text-xs text-[var(--olive-gray)]">{note}</p>
      </div>)}
    </div>
    <div className="mt-9 grid gap-4 lg:grid-cols-2">
      <section className="surface p-6">
        <p className="eyebrow">Today’s focus</p>
        <h2 className="text-[35px]">Keep every pair moving.</h2>
        <p className="mt-3 leading-6 text-[var(--olive-gray)]">Review low-stock variants, pack paid orders, and resolve customer requests from the sections below.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button as={Link} to="/admin/orders">Review orders</Button>
          <Button as={Link} to="/admin/returns" variant="secondary">View returns</Button>
        </div>
      </section>
      <section className="surface p-6">
        <p className="eyebrow">Quick links</p>
        <div className="mt-4 grid gap-3">
          {[['Products and inventory', '/admin/products'], ['Discounts', '/admin/discounts'], ['Homepage content', '/admin/homepage'], ['Sales reports', '/admin/reports']].map(([label, to]) => <Link className="flex items-center justify-between rounded-ui border border-[#262B1F22] p-4 font-semibold no-underline hover:bg-sand" key={to} to={to}>{label}<Icon name="arrow" size={17} /></Link>)}
        </div>
      </section>
    </div>
  </section>
}

export function AdminCollectionView({ eyebrow = 'Back office', title, description, path, columns }) {
  const { data, loading, error, reload } = useAdminResource(path)
  const entries = useMemo(() => listFrom(data), [data])
  if (loading) return <LoadingState label={`Loading ${title.toLowerCase()}`} />
  if (error) return <ErrorState title={`${title} could not load`} detail={error} onRetry={reload} />
  return <section>
    <p className="eyebrow">{eyebrow}</p>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="page-heading">{title}</h1>
        {description && <p className="mt-3 max-w-[650px] leading-6 text-[var(--olive-gray)]">{description}</p>}
      </div>
    </div>
    <div className="table-wrap mt-8">
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{entries.map((entry) => <tr key={entry.id ?? entry.email ?? entry.code}>{columns.map((column) => {
          const value = readPath(entry, column.key)
          return <td key={column.key}>{column.kind === 'money' ? formatPeso(Number(value || 0)) : column.kind === 'status' ? <span className="tag">{pretty(value)}</span> : column.render ? column.render(entry) : pretty(value)}</td>
        })}</tr>)}</tbody>
      </table>
    </div>
    {!entries.length && <div className="page-state"><div><h2 className="text-[33px]">Nothing to show yet.</h2><p className="mt-3 muted">New records will appear here as your store starts moving.</p></div></div>}
  </section>
}

export function AdminReportView() {
  const { data, loading, error, reload } = useAdminResource('/staff/reports/sales', { revenue: 0, orders: 0, topProducts: [] })
  if (loading) return <LoadingState label="Loading sales report" />
  if (error) return <ErrorState title="Sales report could not load" detail={error} onRetry={reload} />
  const topProducts = data.topProducts ?? []
  return <section>
    <p className="eyebrow">Performance</p>
    <h1 className="page-heading">Sales reports</h1>
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      <div className="surface p-6"><p className="eyebrow">Paid revenue</p><b className="font-display text-[48px]">{formatPeso(Number(data.revenue || 0))}</b></div>
      <div className="surface p-6"><p className="eyebrow">Paid orders</p><b className="font-display text-[48px]">{data.orders || 0}</b></div>
    </div>
    <h2 className="mt-10 text-[37px]">Top products</h2>
    <div className="table-wrap mt-4"><table className="data-table"><thead><tr><th>Product</th><th>SKU</th><th>Units</th><th>Revenue</th></tr></thead><tbody>{topProducts.map((item) => <tr key={item.sku}><td><b>{item.productName}</b></td><td>{item.sku}</td><td>{item.units}</td><td>{formatPeso(Number(item.revenue || 0))}</td></tr>)}</tbody></table></div>
    {!topProducts.length && <p className="mt-5 muted">Sales insights will populate after paid orders arrive.</p>}
  </section>
}
