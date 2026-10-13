import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/authStore'
import { registerAccount, signIn } from '@/features/auth/api'
import { Button } from '@/components/ui/Button'

export function Component() {
  const navigate = useNavigate()
  const location = useLocation()
  const setUser = useAuthStore((state) => state.setUser)
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const from = location.state?.from?.pathname || '/account'
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true)
    const values = Object.fromEntries(new FormData(event.currentTarget))
    try {
      const response = mode === 'login' ? await signIn(values) : await registerAccount({ full_name: values.fullName, fullName: values.fullName, email: values.email, password: values.password })
      setUser(response.user ?? response)
      navigate(from, { replace: true })
    } catch (reason) { setError(reason.message || 'We could not sign you in. Please try again.') } finally { setBusy(false) }
  }
  return <section className="container section"><div className="mx-auto grid max-w-[1040px] overflow-hidden rounded-ui border border-[#262B1F1c] bg-[#eee9df] md:grid-cols-[.82fr_1.18fr]">
    <div className="relative hidden min-h-[560px] overflow-hidden bg-ink md:block"><img src="/images/shoe4.jpg" alt="" className="absolute inset-0 h-full w-full object-cover mix-blend-luminosity opacity-65" /><div className="absolute inset-x-9 bottom-10 text-cream"><p className="eyebrow !text-sage">STRIDE members</p><h1 className="text-[62px]">Made to move<br />with you.</h1><p className="mt-4 max-w-[270px] text-sm text-[#EAE2D6]">Save your favourites, follow every order and check out faster.</p></div></div>
    <div className="p-7 sm:p-10 md:p-14"><p className="eyebrow">Your STRIDE account</p><h1 className="text-[48px]">{mode === 'login' ? 'Welcome back' : 'Join STRIDE'}</h1><div className="mt-7 grid grid-cols-2 border-b border-[#262B1F22]"><button className={`border-0 bg-transparent px-2 py-3 text-left text-sm font-bold ${mode === 'login' ? 'border-b-2 !border-b-ink' : 'text-[var(--olive-gray)]'}`} onClick={() => { setMode('login'); setError('') }}>Sign in</button><button className={`border-0 bg-transparent px-2 py-3 text-left text-sm font-bold ${mode === 'register' ? 'border-b-2 !border-b-ink' : 'text-[var(--olive-gray)]'}`} onClick={() => { setMode('register'); setError('') }}>Create account</button></div>
    <form className="mt-6 grid gap-4" onSubmit={submit}>{mode === 'register' && <label className="field-label">Full name<input className="field" name="fullName" required autoComplete="name" /></label>}<label className="field-label">Email address<input className="field" type="email" name="email" required autoComplete="email" /></label><label className="field-label">Password<input className="field" type="password" name="password" required minLength="6" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>{error && <p className="status status-error mb-0" role="alert">{error}</p>}<Button className="mt-2 w-full" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</Button></form>
    {mode === 'login' ? <p className="mt-5 text-sm text-[var(--olive-gray)]">New here? <button className="border-0 bg-transparent p-0 font-bold underline" onClick={() => setMode('register')}>Create an account</button></p> : <p className="mt-5 text-xs leading-5 text-[var(--olive-gray)]">By creating an account, you agree to our <Link to="/support/terms">Terms</Link> and <Link to="/support/privacy">Privacy Policy</Link>.</p>}</div>
  </div></section>
}
