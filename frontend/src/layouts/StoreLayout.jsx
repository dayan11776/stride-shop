import { Outlet } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
export function StoreLayout() {
  return (<div className="store-layout"><Header /><main><Outlet /></main><Footer /></div>)
}
