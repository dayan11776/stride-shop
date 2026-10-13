import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ensureCsrf, getCurrentUser } from '@/features/auth/api'
import { useAuthStore } from '@/features/auth/authStore'
import { USE_MOCK } from '@/lib/apiClient'
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } } })

function SessionHydrator({ children }) {
  const setUser = useAuthStore((state) => state.setUser)
  const setGuest = useAuthStore((state) => state.setGuest)
  useEffect(() => {
    if (USE_MOCK) { setGuest(); return }
    let mounted = true
    ensureCsrf().catch(() => null).finally(() => {
      getCurrentUser().then((user) => mounted && (user ? setUser(user) : setGuest())).catch(() => mounted && setGuest())
    })
    return () => { mounted = false }
  }, [setGuest, setUser])
  return children
}

export function Providers({ children }) {
  return <QueryClientProvider client={queryClient}><SessionHydrator>{children}</SessionHydrator></QueryClientProvider>
}
