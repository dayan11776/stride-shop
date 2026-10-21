import { useMatches } from 'react-router-dom'
import { CatalogPage } from '@/features/catalog/components/CatalogPage'
// Men, Women and Kids share this page; the router passes the audience in `handle`.
export function Component() {
  const audience = useMatches().at(-1).handle?.audience
  const filteredCollection = ['men', 'women', 'kids'].includes(audience) ? audience : null
  return <CatalogPage key={audience} title={audience} filters={{ audience }} showEditorialArtwork showExampleMetadata={!filteredCollection} filteredCollection={filteredCollection} />
}
