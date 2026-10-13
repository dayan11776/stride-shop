export function shoeSizeKey(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  const numeric = Number(raw)
  return Number.isFinite(numeric) ? String(numeric) : raw.toLowerCase()
}

export function findVariantForSize(variants = [], size) {
  const target = shoeSizeKey(size)
  return variants.find((variant) => (
    shoeSizeKey(variant.sizeEu ?? variant.size_eu ?? variant.size ?? variant.size_label) === target
  ))
}
