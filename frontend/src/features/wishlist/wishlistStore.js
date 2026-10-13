import { create } from 'zustand'
import { persist } from 'zustand/middleware'
export const useWishlistStore = create(persist((set) => ({
  ids: [],
  toggle: (id) => set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] })),
}), { name: 'stride-wishlist' }))
