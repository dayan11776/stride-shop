import { useId, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { formatPeso } from '@/lib/format'
import styles from './CatalogFilters.module.css'

const genderLabels = { men: 'Men', women: 'Women', unisex: 'Unisex' }

function FilterGroup({ label, children }) {
  const [isOpen, setIsOpen] = useState(false)
  const contentId = useId()

  return <section className={`${styles.group}${isOpen ? ` ${styles.groupOpen}` : ''}`} data-state={isOpen ? 'open' : 'closed'}>
    <button
      type="button"
      className={styles.groupToggle}
      onClick={() => setIsOpen((open) => !open)}
      aria-expanded={isOpen}
      aria-controls={contentId}
    >
      <span>{label}</span>
      <Icon className={styles.groupIcon} name={isOpen ? 'close' : 'plus'} size={18} strokeWidth={1.65} />
    </button>
    <div id={contentId} className={styles.groupContent} hidden={!isOpen}>{children}</div>
  </section>
}

function FilterCheckbox({ label, checked, onChange }) {
  return <label className={styles.checkbox}>
    <input type="checkbox" checked={checked} onChange={onChange} />
    <span>{label}</span>
  </label>
}

function SelectedFilter({ label, onRemove }) {
  return <button type="button" className={styles.selectedFilter} onClick={onRemove} aria-label={`Remove ${label} filter`}>
    <span>{label}</span><Icon name="close" size={15} strokeWidth={1.8} />
  </button>
}

function formattedSize(size) {
  return Number.isInteger(size) ? String(size) : String(size).replace(/\.0$/, '')
}

function priceLabel(minPrice, maxPrice) {
  if (minPrice && maxPrice) return `${formatPeso(Number(minPrice))} – ${formatPeso(Number(maxPrice))}`
  if (minPrice) return `From ${formatPeso(Number(minPrice))}`
  if (maxPrice) return `Up to ${formatPeso(Number(maxPrice))}`
  return null
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function CatalogFilters({
  audienceOptions = ['men', 'unisex'],
  brands,
  sizes,
  selectedAudiences,
  selectedBrands,
  selectedSizes,
  minPrice,
  maxPrice,
  priceBounds,
  onToggleAudience,
  onToggleBrand,
  onToggleSize,
  onMinimumPriceChange,
  onMaximumPriceChange,
  onClearAll,
  hasAdditionalFilters,
}) {
  const minimum = Number.isFinite(priceBounds?.minimum) ? priceBounds.minimum : 0
  const maximum = Math.max(minimum, Number.isFinite(priceBounds?.maximum) ? priceBounds.maximum : minimum + 1000)
  const selectedMinimum = minPrice === '' || !Number.isFinite(Number(minPrice))
    ? minimum
    : clamp(Number(minPrice), minimum, maximum)
  const selectedMaximum = maxPrice === '' || !Number.isFinite(Number(maxPrice))
    ? maximum
    : clamp(Number(maxPrice), minimum, maximum)
  const rangeSpan = Math.max(maximum - minimum, 1)
  const rangeStart = ((selectedMinimum - minimum) / rangeSpan) * 100
  const rangeEnd = 100 - ((selectedMaximum - minimum) / rangeSpan) * 100
  const updateMinimumRange = (value) => {
    const next = Math.min(Number(value), selectedMaximum)
    onMinimumPriceChange(next <= minimum ? '' : String(next))
  }
  const updateMaximumRange = (value) => {
    const next = Math.max(Number(value), selectedMinimum)
    onMaximumPriceChange(next >= maximum ? '' : String(next))
  }
  const updateMinimumPrice = (value) => {
    if (value === '') {
      onMinimumPriceChange('')
      return
    }

    const rawValue = Number(value)
    if (!Number.isFinite(rawValue)) return
    const next = clamp(rawValue, minimum, maximum)
    onMinimumPriceChange(String(next))
    if (next > selectedMaximum) onMaximumPriceChange(String(next))
  }
  const updateMaximumPrice = (value) => {
    if (value === '') {
      onMaximumPriceChange('')
      return
    }

    const rawValue = Number(value)
    if (!Number.isFinite(rawValue)) return
    const next = clamp(rawValue, minimum, maximum)
    onMaximumPriceChange(String(next))
    if (next < selectedMinimum) onMinimumPriceChange(String(next))
  }

  return <aside className={styles.sidebar} aria-labelledby="catalog-filters-heading">
    <div className={styles.titleRow}>
      <h2 id="catalog-filters-heading">Filters</h2>
      {hasAdditionalFilters && <button type="button" className={styles.reset} onClick={onClearAll}>Reset</button>}
    </div>

    <FilterGroup label="Gender">
      {audienceOptions.map((value) => <FilterCheckbox key={value} label={genderLabels[value] ?? value} checked={selectedAudiences.includes(value)} onChange={() => onToggleAudience(value)} />)}
    </FilterGroup>

    <FilterGroup label="Brand">
      <div className={styles.optionList}>
        {brands.map((brand) => <FilterCheckbox key={brand} label={brand} checked={selectedBrands.includes(brand)} onChange={() => onToggleBrand(brand)} />)}
      </div>
    </FilterGroup>

    <FilterGroup label="Size (EU)">
      <div className={styles.sizeList}>
        {sizes.map((size) => <FilterCheckbox key={size} label={formattedSize(size)} checked={selectedSizes.includes(size)} onChange={() => onToggleSize(size)} />)}
      </div>
    </FilterGroup>

    <FilterGroup label="Price">
      <div className={styles.priceFields}>
        <label><span className="sr-only">Minimum price</span><input className="field" type="number" min={minimum} max={maximum} inputMode="numeric" placeholder="Min ₱" value={minPrice} onChange={(event) => updateMinimumPrice(event.target.value)} /></label>
        <label><span className="sr-only">Maximum price</span><input className="field" type="number" min={minimum} max={maximum} inputMode="numeric" placeholder="Max ₱" value={maxPrice} onChange={(event) => updateMaximumPrice(event.target.value)} /></label>
      </div>
      <div className={styles.rangeControl} aria-label="Price range">
        <span className={styles.rangeTrack} aria-hidden="true"><span style={{ left: `${rangeStart}%`, right: `${rangeEnd}%` }} /></span>
        <input className={styles.rangeInput} type="range" min={minimum} max={maximum} step="500" value={selectedMinimum} onChange={(event) => updateMinimumRange(event.target.value)} aria-label="Minimum price range" />
        <input className={styles.rangeInput} type="range" min={minimum} max={maximum} step="500" value={selectedMaximum} onChange={(event) => updateMaximumRange(event.target.value)} aria-label="Maximum price range" />
      </div>
    </FilterGroup>
  </aside>
}

export function SelectedFilters({ primaryAudience = 'men', selectedAudiences, selectedBrands, selectedSizes, minPrice, maxPrice, onRemoveAudience, onRemoveBrand, onRemoveSize, onClearPrice, onClearAll, hasActiveFilters }) {
  // The route's primary collection is the starting state rather than an extra
  // filter. Once the shopper changes Gender, both audience values become removable.
  const audienceFilters = selectedAudiences.length === 1 && selectedAudiences[0] === primaryAudience ? [] : selectedAudiences
  const filters = [
    ...audienceFilters.map((audience) => ({ key: `audience-${audience}`, label: genderLabels[audience] ?? audience, remove: () => onRemoveAudience(audience) })),
    ...selectedBrands.map((brand) => ({ key: `brand-${brand}`, label: brand, remove: () => onRemoveBrand(brand) })),
    ...selectedSizes.map((size) => ({ key: `size-${size}`, label: `EU ${formattedSize(size)}`, remove: () => onRemoveSize(size) })),
  ]
  const activePriceLabel = priceLabel(minPrice, maxPrice)
  if (activePriceLabel) filters.push({ key: 'price', label: activePriceLabel, remove: onClearPrice })

  return <div className={styles.selectedArea} aria-label="Selected filters">
    <div className={styles.selectedList}>
      {filters.map((filter) => <SelectedFilter key={filter.key} label={filter.label} onRemove={filter.remove} />)}
    </div>
    {hasActiveFilters && <button type="button" className={styles.clear} onClick={onClearAll}>Clear all filters</button>}
  </div>
}
