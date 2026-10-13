import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'
import { api, USE_MOCK } from '@/lib/apiClient'

const shop = [['New arrivals', '/new-arrivals'], ['Women', '/women'], ['Men', '/men'], ['Kids', '/kids'], ['Sale', '/sale']]
const help = [['Help centre', '/support'], ['Delivery & returns', '/support/shipping'], ['Size guide', '/support/size-guide'], ['Contact us', '/support/contact']]
const about = [['Our story', '/support/about'], ['Lookbook', '/lookbook'], ['Privacy', '/support/privacy'], ['Terms', '/support/terms']]

export function Footer() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const subscribe = async (event) => {
    event.preventDefault(); setStatus('')
    try {
      if (!USE_MOCK) await api('/newsletter', { method: 'POST', body: { email } })
      navigate('/newsletter/subscribed', { state: { email } })
    } catch (error) { setStatus(error.message || 'We could not add you right now.') }
  }
  const column = (title, links) => <div><h3 className="mb-4 text-[18px]">{title}</h3><nav className="grid gap-2.5 text-sm text-[#EAE2D6]">{links.map(([label, to]) => <Link className="w-fit no-underline hover:text-white" to={to} key={to}>{label}</Link>)}</nav></div>
  return (
    <footer className="mt-12 bg-ink text-cream">
      <div className="container grid gap-10 py-12 md:grid-cols-[1.45fr_repeat(3,1fr)] md:py-16">
        <div>
          <Link to="/" className="font-display text-5xl font-extrabold tracking-[.075em] no-underline">STRIDE</Link>
          <p className="mt-4 max-w-[310px] text-sm leading-6 text-[#EAE2D6]">Thoughtfully selected footwear for every step, every day.</p>
          <form className="mt-6 flex max-w-[360px] border-b border-[#EAE2D6]" onSubmit={subscribe}>
            <label className="sr-only" htmlFor="footer-email">Your email address</label><input id="footer-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for STRIDE updates" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-cream outline-none placeholder:text-[#b9b4ac]" />
            <button className="grid h-11 w-11 place-items-center border-0 bg-transparent text-cream" aria-label="Subscribe"><Icon name="arrow" size={20} /></button>
          </form>
          {status && <p className="mt-3 text-xs text-[#f5bbb4]" role="alert">{status}</p>}
        </div>
        {column('Shop', shop)}{column('Help', help)}{column('About', about)}
      </div>
      <div className="border-t border-[#ffffff22]"><div className="container flex flex-wrap justify-between gap-3 py-5 text-[11px] font-semibold uppercase tracking-[.1em] text-[#b9b4ac]"><span>© {new Date().getFullYear()} STRIDE</span><span>Philippines · PHP ₱</span></div></div>
    </footer>
  )
}
