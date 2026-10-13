import { Outlet } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
export function StoreLayout() {
  return (<><Header /><main><Outlet /></main><Footer /></>)
}
