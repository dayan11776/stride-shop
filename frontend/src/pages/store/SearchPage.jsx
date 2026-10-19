import { useSearchParams } from 'react-router-dom'
import { CatalogPage } from '@/features/catalog/components/CatalogPage'
export function Component() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const brand = params.get('brand')?.trim()
  if (brand) return <CatalogPage title={brand} filters={q ? { brand, q } : { brand }} showEditorialArtwork />
  return <CatalogPage title={`Results for “${q}”`} filters={{ q }} />
}
