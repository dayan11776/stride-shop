import { NavLink, Outlet } from 'react-router-dom'
const links = [['Help centre', '/support', true], ['About us', '/support/about'], ['Contact us', '/support/contact'], ['FAQ', '/support/faq'], ['Size guide', '/support/size-guide'], ['Shipping policy', '/support/shipping'], ['Returns & refunds', '/support/returns-policy'], ['Privacy policy', '/support/privacy'], ['Terms & conditions', '/support/terms']]
export function SupportLayout() {
  return <div className="container section subpage-shell"><aside className="side-nav" aria-label="Support"><h2 className="side-nav__title">Support</h2>{links.map(([label, to, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}</aside><div className="subpage-content"><Outlet /></div></div>
}
