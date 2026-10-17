import { Link, NavLink, Outlet } from 'react-router-dom'
const links = [['Dashboard', '/admin', true], ['Products', '/admin/products', true], ['Add Product', '/admin/products/new'], ['Product Control', '/admin/product-control'], ['Orders', '/admin/orders'], ['Returns', '/admin/returns'], ['Customers', '/admin/customers'], ['Discounts', '/admin/discounts'], ['Homepage', '/admin/homepage'], ['Reports', '/admin/reports']]
export function AdminLayout() {
  return <div className="admin-shell"><header className="admin-top"><Link className="admin-top__brand" to="/admin">STRIDE ADMIN</Link><Link className="text-xs font-semibold uppercase tracking-[.11em] text-[#EAE2D6]" to="/">View store ↗</Link></header><aside className="admin-sidebar" aria-label="Admin"><p>Manage store</p>{links.map(([label, to, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}</aside><main className="admin-main"><Outlet /></main></div>
}
