import { useSearchParams } from 'react-router-dom'
import { CatalogPage } from '@/features/catalog/components/CatalogPage'
export function Component() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  return <CatalogPage title={`Results for “${q}”`} filters={{ q }} />
}
