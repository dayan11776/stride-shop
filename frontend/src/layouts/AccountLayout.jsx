import { NavLink, Outlet } from 'react-router-dom'
const links = [['Account overview', '/account', true], ['Profile', '/account/profile'], ['Addresses', '/account/addresses'], ['Order history', '/account/orders'], ['Returns / exchanges', '/account/returns'], ['Wishlist', '/account/wishlist']]
export function AccountLayout() {
  return <div className="container section subpage-shell"><aside className="side-nav" aria-label="Account"><h2 className="side-nav__title">My account</h2>{links.map(([label, to, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}</aside><div className="subpage-content"><Outlet /></div></div>
}
