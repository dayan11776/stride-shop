import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { unitPrice } from '@/lib/format'
import { findVariantForSize } from '@/lib/shoeSize'

// Most pairs of one size a shopper can hold (the API also caps this by stock).
export const MAX_PER_LINE = 10
export const maxQtyFor = (item) => Math.max(1, Math.min(MAX_PER_LINE, Number(item?.variant?.available ?? MAX_PER_LINE)))

// Client state: the cart lives in the browser (and syncs to the carts/cart_items tables after login).
export const useCartStore = create(
  persist(
    (set) => ({
      items: [],
      promoCode: '',
      add: (product, size, qty = 1, variant = null) => set((s) => {
        const variantId = variant?.id ?? findVariantForSize(product?.variants, size)?.id ?? null
        const key = variantId ? `${product.id}-${variantId}` : `${product.id}-${size}`
        const found = s.items.find((i) => i.key === key)
        if (found) return { items: s.items.map((i) => (i.key === key ? { ...i, qty: Math.min(i.qty + qty, maxQtyFor(i)) } : i)) }
        const item = { key, product, size, qty, variantId, variant }
        return { items: [...s.items, { ...item, qty: Math.min(qty, maxQtyFor(item)) }] }
      }),
      setQty: (key, qty) => set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, qty: Math.min(qty, maxQtyFor(i)) } : i)).filter((i) => i.qty > 0) })),
      remove: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
      setPromoCode: (promoCode) => set({ promoCode }),
      clear: () => set({ items: [], promoCode: '' }),
    }),
    { name: 'stride-cart' },
  ),
)
// Persisted carts created before variants were stored keep the product-price
// fallback, but a selected size/colour always uses its own current price.
export const priceForItem = (item) => {
  const variant = item?.variant
  const price = variant?.currentPrice ?? variant?.current_price ?? variant?.salePrice ?? variant?.sale_price ?? variant?.price ?? unitPrice(item.product)
  return Number(price) || 0
}
export const selectCount = (s) => s.items.reduce((n, i) => n + i.qty, 0)
export const selectSubtotal = (s) => s.items.reduce((sum, i) => sum + priceForItem(i) * i.qty, 0)
