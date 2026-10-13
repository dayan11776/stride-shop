import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { unitPrice } from '@/lib/format'

// Client state: the cart lives in the browser (and syncs to the carts/cart_items tables after login).
export const useCartStore = create(
  persist(
    (set) => ({
      items: [],
      promoCode: '',
      add: (product, size, qty = 1, variant = null) => set((s) => {
        const variantId = variant?.id ?? product?.variants?.find((item) => String(item.sizeEu ?? item.size ?? item.size_label) === String(size))?.id ?? null
        const key = variantId ? `${product.id}-${variantId}` : `${product.id}-${size}`
        const found = s.items.find((i) => i.key === key)
        return found
          ? { items: s.items.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i)) }
          : { items: [...s.items, { key, product, size, qty, variantId, variant }] }
      }),
      setQty: (key, qty) => set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, qty } : i)).filter((i) => i.qty > 0) })),
      remove: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
      setPromoCode: (promoCode) => set({ promoCode }),
      clear: () => set({ items: [], promoCode: '' }),
    }),
    { name: 'stride-cart' },
  ),
)
export const selectCount = (s) => s.items.reduce((n, i) => n + i.qty, 0)
export const selectSubtotal = (s) => s.items.reduce((sum, i) => sum + unitPrice(i.product) * i.qty, 0)
