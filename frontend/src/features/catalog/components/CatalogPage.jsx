import { useMemo, useState } from 'react'
import { useProducts } from '../hooks'
import { sortByPrice } from '../api'
import { ProductCard } from './ProductCard'
import { catalogArtworkFor } from '../catalogArtwork'
import { ErrorState } from '@/components/ui/PageState'
import { Chip } from '@/components/ui/Chip'
import { CatalogFilters, SelectedFilters } from './CatalogFilters'
import { unitPrice } from '@/lib/format'
import styles from './CatalogPage.module.css'

const MEN_AUDIENCES = ['men', 'unisex']
const MEN_ARTWORK_FALLBACK = '/images/illustration-runner.webp'

function uniqueSorted(values, compare) {
  return [...new Set(values.filter((value) => value != null && value !== ''))].sort(compare)
}

function numberOrNull(value) {
  if (value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

export function CatalogPage({ title, filters, showEditorialArtwork = false, showExampleMetadata = true, enableMenFilters = false }) {
  const [sort, setSort] = useState('new')
  const [selectedAudiences, setSelectedAudiences] = useState(['men'])
  const [selectedBrands, setSelectedBrands] = useState([])
  const [selectedSizes, setSelectedSizes] = useState([])
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  // The Men screen fetches the catalogue once so a future Unisex item can be
  // selected alongside Men even though the public API accepts one audience.
  const queryFilters = enableMenFilters ? {} : filters
  const { data, isLoading, isError, error, refetch } = useProducts(queryFilters)
  const scopedProducts = useMemo(() => {
    const source = data ?? []
    return enableMenFilters ? source.filter((product) => MEN_AUDIENCES.includes(product.audience)) : source
  }, [data, enableMenFilters])
  const brands = useMemo(() => uniqueSorted(scopedProducts.map((product) => product.brand), (a, b) => a.localeCompare(b)), [scopedProducts])
  const sizes = useMemo(() => uniqueSorted(scopedProducts.flatMap((product) => product.sizes ?? []).map(Number).filter(Number.isFinite), (a, b) => a - b), [scopedProducts])
  const priceBounds = useMemo(() => {
    const prices = scopedProducts.map(unitPrice).filter(Number.isFinite)
    if (prices.length === 0) return { minimum: 0, maximum: 1000 }

    return {
      minimum: Math.floor(Math.min(...prices) / 500) * 500,
      maximum: Math.ceil(Math.max(...prices) / 500) * 500,
    }
  }, [scopedProducts])
  const matchingProducts = useMemo(() => {
    if (!enableMenFilters) return scopedProducts
    const minimum = numberOrNull(minPrice)
    const maximum = numberOrNull(maxPrice)
    return scopedProducts.filter((product) => {
      const productSizes = (product.sizes ?? []).map(Number)
      const price = unitPrice(product)
      return selectedAudiences.includes(product.audience) &&
        (selectedBrands.length === 0 || selectedBrands.includes(product.brand)) &&
        (selectedSizes.length === 0 || selectedSizes.some((size) => productSizes.includes(size))) &&
        (minimum == null || price >= minimum) &&
        (maximum == null || price <= maximum)
    })
  }, [enableMenFilters, maxPrice, minPrice, scopedProducts, selectedAudiences, selectedBrands, selectedSizes])
  const list = useMemo(() => {
    const source = matchingProducts
    return sort === 'low' ? sortByPrice(source, 1) : sort === 'high' ? sortByPrice(source, -1) : source
  }, [matchingProducts, sort])
  const toggle = (setter, value) => setter((selected) => selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])
  const toggleAudience = (audience) => setSelectedAudiences((selected) => {
    if (!selected.includes(audience)) return [...selected, audience]

    // The Men collection always needs one active gender. If a shopper has
    // narrowed the page to Unisex only, toggling it returns to the Men
    // collection instead of leaving the catalogue in an unexplained empty state.
    if (selected.length === 1) return audience === 'unisex' ? ['men'] : selected
    return selected.filter((entry) => entry !== audience)
  })
  const clearAll = () => {
    setSelectedAudiences(['men'])
    setSelectedBrands([])
    setSelectedSizes([])
    setMinPrice('')
    setMaxPrice('')
  }
  const hasAdditionalFilters = selectedAudiences.length !== 1 || selectedAudiences[0] !== 'men' || selectedBrands.length > 0 || selectedSizes.length > 0 || minPrice !== '' || maxPrice !== ''
  const resultCopy = isLoading ? 'Finding your next pair…' : `${list.length} ${list.length === 1 ? 'result' : 'results'}`

  const renderGrid = () => <>
    {isLoading && <CatalogSkeleton />}
    {isError && <ErrorState title="The collection is taking a moment." detail={error?.message} onRetry={refetch} />}
    {!isLoading && !isError && list.length === 0 && <div className="page-state"><div><h2 style={{ fontSize: 40 }}>No matching shoes</h2><p className="muted">Try a different filter or clear your selections.</p></div></div>}
    {!isLoading && !isError && list.length > 0 && <div className={`${styles.filteredGrid} product-grid`}>{list.map((product) => <ProductCard
      key={product.id}
      product={product}
      artwork={showEditorialArtwork ? catalogArtworkFor(product.slug) ?? (enableMenFilters ? MEN_ARTWORK_FALLBACK : undefined) : undefined}
      showExampleMetadata={showExampleMetadata}
      presentation={enableMenFilters ? 'men' : 'default'}
      imagePreference={enableMenFilters ? 'artwork' : 'photo'}
    />)}</div>}
  </>

  if (enableMenFilters) return (
    <section className="container section">
      <div className={styles.collectionHeading}>
        <div><p className="eyebrow">STRIDE collection</p><h1 className="page-heading capitalize">{title}</h1></div>
        <p className={styles.styleCount}>{isLoading ? 'Finding your next pair…' : `${scopedProducts.length} ${scopedProducts.length === 1 ? 'style' : 'styles'}`}</p>
      </div>
      <div className={styles.catalogLayout}>
        <CatalogFilters
          brands={brands}
          sizes={sizes}
          selectedAudiences={selectedAudiences}
          selectedBrands={selectedBrands}
          selectedSizes={selectedSizes}
          minPrice={minPrice}
          maxPrice={maxPrice}
          priceBounds={priceBounds}
          onToggleAudience={toggleAudience}
          onToggleBrand={(brand) => toggle(setSelectedBrands, brand)}
          onToggleSize={(size) => toggle(setSelectedSizes, size)}
          onMinimumPriceChange={setMinPrice}
          onMaximumPriceChange={setMaxPrice}
          onClearAll={clearAll}
          hasAdditionalFilters={hasAdditionalFilters}
        />
        <div className={styles.resultsColumn}>
          <div className={styles.resultsHeader}>
            <div><p className={styles.resultsCount} aria-live="polite">Showing <strong>{resultCopy}</strong></p>
              <SelectedFilters
                selectedAudiences={selectedAudiences}
                selectedBrands={selectedBrands}
                selectedSizes={selectedSizes}
                minPrice={minPrice}
                maxPrice={maxPrice}
                onRemoveAudience={toggleAudience}
                onRemoveBrand={(brand) => toggle(setSelectedBrands, brand)}
                onRemoveSize={(size) => toggle(setSelectedSizes, size)}
                onClearPrice={() => { setMinPrice(''); setMaxPrice('') }}
                onClearAll={clearAll}
                hasActiveFilters={hasAdditionalFilters}
              />
            </div>
            <label className={styles.sortLabel}><span className="sr-only">Sort products</span><select className="field" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort products"><option value="new">Latest</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></label>
          </div>
          {renderGrid()}
        </div>
      </div>
    </section>
  )

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
        <span className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--olive-gray)]">Free standard delivery over ₱3,500</span>
      </div>
      {isLoading && <CatalogSkeleton />}
      {isError && <ErrorState title="The collection is taking a moment." detail={error?.message} onRetry={refetch} />}
      {!isLoading && !isError && list.length === 0 && <div className="page-state"><div><h2 style={{ fontSize: 40 }}>No matches yet</h2><p className="muted">Try a different search or browse all styles.</p></div></div>}
      {!isLoading && !isError && list.length > 0 && <div className="product-grid">{list.map((product) => <ProductCard key={product.id} product={product} artwork={showEditorialArtwork ? catalogArtworkFor(product.slug) : undefined} showExampleMetadata={showExampleMetadata} />)}</div>}
    </section>
  )
}

function CatalogSkeleton() { return <div className="product-grid">{Array.from({ length: 8 }, (_, index) => <div key={index}><div className="skeleton" style={{ height: 280 }} /><div className="skeleton mt-3" style={{ width: '70%' }} /><div className="skeleton mt-2" style={{ width: '42%' }} /></div>)}</div> }
