import { create } from 'zustand'
// Holds the signed-in user. The session itself is an httpOnly cookie set by the backend.
export const useAuthStore = create((set) => ({
  user: null, // { id, fullName, email, role: 'customer' | 'staff' | 'admin' }
  status: 'loading',
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'guest' }),
  setGuest: () => set({ user: null, status: 'guest' }),
  signOut: () => set({ user: null, status: 'guest' }),
}))
