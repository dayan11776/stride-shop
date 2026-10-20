import { useMatches } from 'react-router-dom'
import { CatalogPage } from '@/features/catalog/components/CatalogPage'
// Men, Women and Kids share this page; the router passes the audience in `handle`.
export function Component() {
  const audience = useMatches().at(-1).handle?.audience
  return <CatalogPage title={audience} filters={{ audience }} showEditorialArtwork showExampleMetadata={audience !== 'men'} />
}
