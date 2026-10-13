import { useMemo, useState } from 'react'
import { useProducts } from '../hooks'
import { sortByPrice } from '../api'
import { ProductCard } from './ProductCard'
import { ErrorState, LoadingState } from '@/components/ui/PageState'
import { Chip } from '@/components/ui/Chip'

export function CatalogPage({ title, filters }) {
  const [sort, setSort] = useState('new')
  const { data, isLoading, isError, error, refetch } = useProducts(filters)
  const list = useMemo(() => {
    const source = data ?? []
    return sort === 'low' ? sortByPrice(source, 1) : sort === 'high' ? sortByPrice(source, -1) : source
  }, [data, sort])
  return (
    <section className="container section">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-[#262B1F22] pb-6">
        <div><p className="eyebrow">STRIDE collection</p><h1 className="page-heading capitalize">{title}</h1></div>
        <p className="mb-1 text-sm text-[var(--olive-gray)]">{isLoading ? 'Finding your next pair…' : `${list.length} ${list.length === 1 ? 'style' : 'styles'}`}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sort products">
          {[['new', 'Latest'], ['low', 'Price: low to high'], ['high', 'Price: high to low']].map(([key, label]) => <Chip key={key} selected={sort === key} onClick={() => setSort(key)}>{label}</Chip>)}
        </div>
        <span className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--olive-gray)]">Free delivery over ₱3,500</span>
      </div>
      {isLoading && <CatalogSkeleton />}
      {isError && <ErrorState title="The collection is taking a moment." detail={error?.message} onRetry={refetch} />}
      {!isLoading && !isError && list.length === 0 && <div className="page-state"><div><h2 style={{ fontSize: 40 }}>No matches yet</h2><p className="muted">Try a different search or browse all styles.</p></div></div>}
      {!isLoading && !isError && list.length > 0 && <div className="grid">{list.map((product) => <ProductCard key={product.id} product={product} />)}</div>}
    </section>
  )
}

function CatalogSkeleton() { return <div className="grid">{Array.from({ length: 8 }, (_, index) => <div key={index}><div className="skeleton" style={{ height: 280 }} /><div className="skeleton mt-3" style={{ width: '70%' }} /><div className="skeleton mt-2" style={{ width: '42%' }} /></div>)}</div> }
