import { Outlet, ScrollRestoration } from 'react-router-dom'

// Keep navigation starting at the page top while preserving the previous
// position when a shopper goes back to a long product listing.
export function AppRoot() {
  return <><ScrollRestoration /><Outlet /></>
}
