import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useCartStore, selectCount } from '@/features/cart/cartStore'
import { useWishlistStore } from '@/features/wishlist/wishlistStore'
import { useAuthStore } from '@/features/auth/authStore'
import { signOutRequest } from '@/features/auth/api'
import { Icon } from '@/components/ui/Icon'
import styles from './Header.module.css'

const links = [['Men', '/men'], ['Women', '/women'], ['Kids', '/kids'], ['New arrivals', '/new-arrivals'], ['Brands', '/brands'], ['Sale', '/sale']]
const mobileLinks = [
  ['Home', '/', 'home'], ['Shop', '/shop', 'search'], ['Saved', '/account/wishlist', 'heart'], ['Account', '/account', 'user'], ['Bag', '/cart', 'bag'],
]

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const count = useCartStore(selectCount)
  const wishes = useWishlistStore((s) => s.ids.length)
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  useEffect(() => setOpen(false), [location.pathname])
  const onSearch = (event) => {
    event.preventDefault()
    const q = new FormData(event.currentTarget).get('q')?.trim()
    navigate(`/search${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  }
  const onSignOut = async () => {
    try { await signOutRequest() } catch { /* Local sign out still helps if the request fails. */ }
    signOut(); navigate('/')
  }
  return (
    <>
      <div className={styles.announce}>Free standard delivery on orders over ₱3,500 <span>•</span> Easy 30-day returns</div>
      <header className={styles.shell}>
        <div className={`${styles.header} container`}>
          <button className={styles.menuButton} onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            <Icon name={open ? 'close' : 'menu'} size={22} />
          </button>
          <Link to="/" className={styles.logo}>STRIDE<span>®</span></Link>
          <nav className={styles.nav} aria-label="Main navigation">
            {links.map(([label, to]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? styles.active : undefined}>{label}</NavLink>)}
          </nav>
          <form className={styles.searchForm} onSubmit={onSearch} role="search">
            <Icon name="search" size={17} /><input name="q" placeholder="Search" aria-label="Search shoes and brands" />
          </form>
          <div className={styles.actions}>
            {user ? <button onClick={onSignOut} className={styles.action} aria-label="Sign out"><Icon name="logout" size={20} /></button> : <Link to="/login" className={styles.action} aria-label="Account"><Icon name="user" size={20} /></Link>}
            <Link to="/account/wishlist" className={styles.action} aria-label={`Wishlist, ${wishes} saved`}><Icon name="heart" size={20} />{wishes > 0 && <b>{wishes}</b>}</Link>
            <Link to="/cart" className={styles.action} aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}><Icon name="bag" size={20} />{count > 0 && <b>{count}</b>}</Link>
          </div>
        </div>
        <div className={`${styles.mobileSearch} container`}><form onSubmit={onSearch} role="search"><Icon name="search" size={17} /><input name="q" placeholder="Search shoes, styles and brands" aria-label="Search shoes and brands" /></form></div>
        {open && <nav className={`${styles.mobileMenu} container`} aria-label="Mobile navigation">
          {links.map(([label, to]) => <NavLink key={to} to={to}>{label}</NavLink>)}
          <div className={styles.menuMeta}><Link to="/lookbook">Lookbook</Link><Link to="/support">Help centre</Link>{user && <button onClick={onSignOut}>Sign out</button>}</div>
        </nav>}
      </header>
      <nav className={styles.bottomNav} aria-label="Quick navigation">
        {mobileLinks.map(([label, to, icon]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? styles.bottomActive : undefined}>
          <span className={styles.bottomIcon}><Icon name={icon} size={19} />{(icon === 'bag' ? count : icon === 'heart' ? wishes : 0) > 0 && <i>{icon === 'bag' ? count : wishes}</i>}</span><span>{label}</span>
        </NavLink>)}
      </nav>
    </>
  )
}
