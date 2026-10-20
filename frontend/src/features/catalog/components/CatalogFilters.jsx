import { Icon } from '@/components/ui/Icon'
import { formatPeso } from '@/lib/format'
import styles from './CatalogFilters.module.css'

const genderLabels = { men: 'Men', unisex: 'Unisex' }

function FilterGroup({ label, children }) {
  return <fieldset className={styles.group}><legend>{label}</legend>{children}</fieldset>
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

export function CatalogFilters({
  brands,
  sizes,
  selectedAudiences,
  selectedBrands,
  selectedSizes,
  minPrice,
  maxPrice,
  onToggleAudience,
  onToggleBrand,
  onToggleSize,
  onMinimumPriceChange,
  onMaximumPriceChange,
  onClearAll,
  hasAdditionalFilters,
}) {
  return <aside className={styles.sidebar} aria-labelledby="catalog-filters-heading">
    <div className={styles.titleRow}>
      <h2 id="catalog-filters-heading">Filters</h2>
      {hasAdditionalFilters && <button type="button" className={styles.reset} onClick={onClearAll}>Reset</button>}
    </div>

    <FilterGroup label="Gender">
      {Object.entries(genderLabels).map(([value, label]) => <FilterCheckbox key={value} label={label} checked={selectedAudiences.includes(value)} onChange={() => onToggleAudience(value)} />)}
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
        <label><span className="sr-only">Minimum price</span><input className="field" type="number" min="0" inputMode="numeric" placeholder="Min ₱" value={minPrice} onChange={(event) => onMinimumPriceChange(event.target.value)} /></label>
        <label><span className="sr-only">Maximum price</span><input className="field" type="number" min="0" inputMode="numeric" placeholder="Max ₱" value={maxPrice} onChange={(event) => onMaximumPriceChange(event.target.value)} /></label>
      </div>
    </FilterGroup>
  </aside>
}

export function SelectedFilters({ selectedAudiences, selectedBrands, selectedSizes, minPrice, maxPrice, onRemoveAudience, onRemoveBrand, onRemoveSize, onClearPrice, onClearAll, hasActiveFilters }) {
  // Men is the route's starting collection rather than an extra filter. Once
  // the shopper changes Gender, both selected audience values become removable.
  const audienceFilters = selectedAudiences.length === 1 && selectedAudiences[0] === 'men' ? [] : selectedAudiences
  const filters = [
    ...audienceFilters.map((audience) => ({ key: `audience-${audience}`, label: genderLabels[audience], remove: () => onRemoveAudience(audience) })),
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
