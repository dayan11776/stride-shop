import { Link, Outlet, useLocation } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'
export function CheckoutLayout() {
  const location = useLocation()
  const confirmation = location.pathname.includes('order-confirmation')
  return <><header className="checkout-head"><div className="container checkout-head__inner"><Link to="/" className="checkout-logo">STRIDE</Link><div className="checkout-secure"><Icon name={confirmation ? 'check' : 'truck'} size={17} />{confirmation ? 'Order placed' : 'Secure checkout'}</div></div></header><main><Outlet /></main></>
}
