import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from './authStore'
import { LoadingState } from '@/components/ui/PageState'

export function RequireAuth() {
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const location = useLocation()
  if (status === 'loading') return <LoadingState label="Checking your account" />
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />
}
export function RequireAdmin() {
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  if (status === 'loading') return <LoadingState label="Checking your access" />
  return user && ['staff', 'admin'].includes(user.role) ? <Outlet /> : <Navigate to="/login" replace />
}
