const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
export const formatPeso = (n) => peso.format(n)
export const unitPrice = (p) => p.salePrice ?? p.price
