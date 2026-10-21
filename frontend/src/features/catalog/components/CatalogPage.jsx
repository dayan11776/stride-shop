import { useEffect, useMemo, useState } from 'react'
import { useProducts } from '../hooks'
import { sortByPrice } from '../api'
import { ProductCard } from './ProductCard'
import { catalogArtworkFor } from '../catalogArtwork'
import { ErrorState } from '@/components/ui/PageState'
import { Chip } from '@/components/ui/Chip'
import { CatalogFilters, SelectedFilters } from './CatalogFilters'
import { unitPrice } from '@/lib/format'
import styles from './CatalogPage.module.css'

const FILTERED_COLLECTIONS = {
  men: { primaryAudience: 'men', audiences: ['men', 'unisex'], imagePreference: 'artwork', artworkFallback: '/images/illustration-runner.webp' },
  women: { primaryAudience: 'women', audiences: ['women', 'unisex'], imagePreference: 'photo', artworkFallback: '/images/illustration-casual.webp' },
}
const EMPTY_AUDIENCES = []
const CATALOG_PAGE_SIZES = [20, 40, 50]
const DEFAULT_CATALOG_PAGE_SIZE = CATALOG_PAGE_SIZES[0]

function uniqueSorted(values, compare) {
  return [...new Set(values.filter((value) => value != null && value !== ''))].sort(compare)
}

function numberOrNull(value) {
  if (value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function visiblePageNumbers(pageCount, currentPage) {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1)

  const pages = [1]
  const firstMiddlePage = Math.max(2, currentPage - 1)
  const lastMiddlePage = Math.min(pageCount - 1, currentPage + 1)

  if (firstMiddlePage > 2) pages.push('leading-gap')
  for (let page = firstMiddlePage; page <= lastMiddlePage; page += 1) pages.push(page)
  if (lastMiddlePage < pageCount - 1) pages.push('trailing-gap')
  pages.push(pageCount)

  return pages
}

function CatalogPagination({ currentPage, pageCount, pageSize, totalProducts, onPageChange, onPageSizeChange }) {
  const firstProduct = (currentPage - 1) * pageSize + 1
  const lastProduct = Math.min(currentPage * pageSize, totalProducts)
  const pageNumbers = visiblePageNumbers(pageCount, currentPage)

  return <nav className={styles.pagination} aria-label="Pagination">
    <p className={styles.paginationInfo} aria-live="polite">Showing {firstProduct}–{lastProduct} of {totalProducts}</p>
    <div className={styles.pageControls}>
      <button type="button" className={styles.pageButton} onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page">‹</button>
      {pageNumbers.map((page) => typeof page === 'number'
        ? <button key={page} type="button" className={styles.pageButton} onClick={() => onPageChange(page)} aria-current={page === currentPage ? 'page' : undefined} aria-label={`Page ${page}`}>{page}</button>
        : <span key={page} className={styles.pageGap} aria-hidden="true">…</span>)}
      <button type="button" className={styles.pageButton} onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === pageCount} aria-label="Next page">›</button>
    </div>
    <label className={styles.pageSizeLabel}>
      <span className="sr-only">Products per page</span>
      <select className={styles.pageSize} value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} aria-label="Products per page">
        {CATALOG_PAGE_SIZES.map((size) => <option key={size} value={size}>{size} per page</option>)}
      </select>
    </label>
  </nav>
}

export function CatalogPage({ title, filters, showEditorialArtwork = false, showExampleMetadata = true, filteredCollection = null }) {
  const collectionConfig = FILTERED_COLLECTIONS[filteredCollection] ?? null
  const hasCollectionFilters = collectionConfig != null
  const primaryAudience = collectionConfig?.primaryAudience
  const collectionAudiences = collectionConfig?.audiences ?? EMPTY_AUDIENCES
  const [sort, setSort] = useState('new')
  const [selectedAudiences, setSelectedAudiences] = useState(() => primaryAudience ? [primaryAudience] : [])
  const [selectedBrands, setSelectedBrands] = useState([])
  const [selectedSizes, setSelectedSizes] = useState([])
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_CATALOG_PAGE_SIZE)
  // Filtered category screens fetch the catalogue once so shoppers can switch
  // between their primary audience and Unisex even though the public API only
  // accepts one audience per request.
  const queryFilters = hasCollectionFilters ? {} : filters
  const { data, isLoading, isError, error, refetch } = useProducts(queryFilters)
  const scopedProducts = useMemo(() => {
    const source = data ?? []
    return hasCollectionFilters ? source.filter((product) => collectionAudiences.includes(product.audience)) : source
  }, [collectionAudiences, data, hasCollectionFilters])
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
    if (!hasCollectionFilters) return scopedProducts
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
  }, [hasCollectionFilters, maxPrice, minPrice, scopedProducts, selectedAudiences, selectedBrands, selectedSizes])
  const list = useMemo(() => {
    const source = matchingProducts
    return sort === 'low' ? sortByPrice(source, 1) : sort === 'high' ? sortByPrice(source, -1) : source
  }, [matchingProducts, sort])
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize))
  const displayPage = Math.min(currentPage, pageCount)
  const productsForGrid = hasCollectionFilters ? list.slice((displayPage - 1) * pageSize, displayPage * pageSize) : list

  useEffect(() => {
    if (currentPage !== displayPage) setCurrentPage(displayPage)
  }, [currentPage, displayPage])

  const resetPagination = () => setCurrentPage(1)
  const toggle = (setter, value) => {
    resetPagination()
    setter((selected) => selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])
  }
  const toggleAudience = (audience) => {
    resetPagination()
    setSelectedAudiences((selected) => {
      if (!selected.includes(audience)) return [...selected, audience]

      // The catalog always needs one active gender. If a shopper has narrowed
      // the page to Unisex only, toggling it returns to the route's primary
      // collection instead of leaving the catalogue in an unexplained empty state.
      if (selected.length === 1) return audience === 'unisex' ? [primaryAudience] : selected
      return selected.filter((entry) => entry !== audience)
    })
  }
  const clearAll = () => {
    resetPagination()
    setSelectedAudiences(primaryAudience ? [primaryAudience] : [])
    setSelectedBrands([])
    setSelectedSizes([])
    setMinPrice('')
    setMaxPrice('')
  }
  const hasAdditionalFilters = selectedAudiences.length !== 1 || selectedAudiences[0] !== primaryAudience || selectedBrands.length > 0 || selectedSizes.length > 0 || minPrice !== '' || maxPrice !== ''
  const resultCopy = isLoading ? 'Finding your next pair…' : `${list.length} ${list.length === 1 ? 'result' : 'results'}`

  const renderGrid = () => <>
    {isLoading && <CatalogSkeleton />}
    {isError && <ErrorState title="The collection is taking a moment." detail={error?.message} onRetry={refetch} />}
    {!isLoading && !isError && list.length === 0 && <div className="page-state"><div><h2 style={{ fontSize: 40 }}>No matching shoes</h2><p className="muted">Try a different filter or clear your selections.</p></div></div>}
    {!isLoading && !isError && list.length > 0 && <div className={`${styles.filteredGrid} product-grid`}>{productsForGrid.map((product) => <ProductCard
      key={product.id}
      product={product}
      artwork={showEditorialArtwork ? catalogArtworkFor(product.slug) ?? collectionConfig?.artworkFallback : undefined}
      showExampleMetadata={showExampleMetadata}
      presentation={hasCollectionFilters ? 'catalog' : 'default'}
      imagePreference={collectionConfig?.imagePreference ?? 'photo'}
    />)}</div>}
  </>

  if (hasCollectionFilters) return (
    <section className="container section">
      <div className={styles.collectionHeading}>
        <div><p className="eyebrow">STRIDE collection</p><h1 className="page-heading capitalize">{title}</h1></div>
        <p className={styles.styleCount}>{isLoading ? 'Finding your next pair…' : `${scopedProducts.length} ${scopedProducts.length === 1 ? 'style' : 'styles'}`}</p>
      </div>
      <div className={styles.catalogLayout}>
        <CatalogFilters
          audienceOptions={collectionAudiences}
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
          onMinimumPriceChange={(value) => { resetPagination(); setMinPrice(value) }}
          onMaximumPriceChange={(value) => { resetPagination(); setMaxPrice(value) }}
          onClearAll={clearAll}
          hasAdditionalFilters={hasAdditionalFilters}
        />
        <div className={styles.resultsColumn}>
          <div className={styles.resultsHeader}>
            <div><p className={styles.resultsCount} aria-live="polite">Showing <strong>{resultCopy}</strong></p>
              <SelectedFilters
                primaryAudience={primaryAudience}
                selectedAudiences={selectedAudiences}
                selectedBrands={selectedBrands}
                selectedSizes={selectedSizes}
                minPrice={minPrice}
                maxPrice={maxPrice}
                onRemoveAudience={toggleAudience}
                onRemoveBrand={(brand) => toggle(setSelectedBrands, brand)}
                onRemoveSize={(size) => toggle(setSelectedSizes, size)}
                onClearPrice={() => { resetPagination(); setMinPrice(''); setMaxPrice('') }}
                onClearAll={clearAll}
                hasActiveFilters={hasAdditionalFilters}
              />
            </div>
            <label className={styles.sortLabel}><span className="sr-only">Sort products</span><select className="field" value={sort} onChange={(event) => { resetPagination(); setSort(event.target.value) }} aria-label="Sort products"><option value="new">Latest</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></label>
          </div>
          {renderGrid()}
          {!isLoading && !isError && list.length > 0 && <CatalogPagination
            currentPage={displayPage}
            pageCount={pageCount}
            pageSize={pageSize}
            totalProducts={list.length}
            onPageChange={(page) => setCurrentPage(Math.min(Math.max(page, 1), pageCount))}
            onPageSizeChange={(size) => { setPageSize(size); resetPagination() }}
          />}
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
