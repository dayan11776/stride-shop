export function shoeSizeKey(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  const numeric = Number(raw)
  return Number.isFinite(numeric) ? String(numeric) : raw.toLowerCase()
}

export function isVariantAvailable(variant) {
  const active = variant?.isActive ?? variant?.is_active ?? true
  if (!active) return false
  // Some older/mock variants have no stock field. When supplied by the API,
  // zero means that size cannot be purchased.
  const available = variant?.available
  return available == null || (Number.isFinite(Number(available)) && Number(available) > 0)
}

export function findVariantForSize(variants = [], size, { color, width } = {}) {
  const target = shoeSizeKey(size)
  return variants.find((variant) => (
    isVariantAvailable(variant)
    && shoeSizeKey(variant.sizeEu ?? variant.size_eu ?? variant.size ?? variant.size_label) === target
    && (color == null || (variant.colorName ?? variant.color_name) === color)
    && (width == null || (variant.width ?? 'regular') === width)
  ))
}
