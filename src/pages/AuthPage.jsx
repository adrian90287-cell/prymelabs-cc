import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage, useT } from '../context/LanguageContext'
import Footer from '../components/Footer'

export default function AuthPage() {
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({ firstName: '', lastName: '', username: '', email: '', phone: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [forgotView, setForgotView] = useState(false)
  const [forgotMode, setForgotMode] = useState('password')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const t = useT()
  const { lang, setLanguage } = useLanguage()
  const peptideAccessNotice = location.state?.peptideAccess === true
  const returnTo = typeof location.state?.returnTo === 'string' && location.state.returnTo.startsWith('/') && !location.state.returnTo.startsWith('//')
    ? location.state.returnTo
    : '/'
  const showPeptideNav = peptideAccessNotice && !forgotView

  const update = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (tab === 'register') {
      if (!form.firstName.trim() || !form.lastName.trim()) { setError(t.auth.nameRequired); return }
      if (!form.username.trim()) { setError(t.auth.usernameRequired); return }
      if (!form.email.trim()) { setError(t.auth.emailRequired); return }
      if (!form.phone.trim()) { setError('Phone number is required'); return }
      if (form.password !== form.confirm) { setError(t.auth.passwordMatch); return }
    }
    if (form.password.length < 8) { setError(t.auth.passwordLength); return }
    setLoading(true)
    try {
      const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body = tab === 'login'
        ? { username: form.username, password: form.password }
        : { name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(), username: form.username, email: form.email, password: form.password, phone: form.phone, lang }
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || t.auth.networkError); return }
      login(data.token, data.user)
      navigate(returnTo)
    } catch { setError(t.auth.networkError) }
    finally { setLoading(false) }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setError('')
    if (!forgotEmail.trim()) { setError(forgotMode === 'username' ? 'Email or phone is required' : t.auth.emailRequired); return }
    setLoading(true)
    try {
      // Endpoint always returns ok (no account enumeration) — show the same message regardless
      await fetch(forgotMode === 'username' ? '/api/auth/forgot-username' : '/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forgotMode === 'username' ? { identifier: forgotEmail.trim() } : { email: forgotEmail.trim() }),
      })
      setForgotSent(true)
    } catch { setError(t.auth.networkError) }
    finally { setLoading(false) }
  }

  const openForgot = (mode = 'password') => { setForgotMode(mode); setForgotView(true); setForgotSent(false); setError(''); setForgotEmail(form.email || '') }
  const closeForgot = () => { setForgotView(false); setForgotSent(false); setError('') }

  const inp = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm'

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col" data-build="cache-bust-1">
      <div className="absolute top-4 right-4 z-10 flex rounded-lg overflow-hidden border border-zinc-800">
        {['en', 'es'].map(l => (
          <button key={l} onClick={() => setLanguage(l)}
            className={`px-2.5 py-1 text-xs font-bold transition-colors uppercase ${lang === l ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img src="/logo-mark.png" alt="Pryme Labs" className="w-12 h-12 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
            <h1 className="text-3xl font-black text-white tracking-widest">PRYME<span className="text-blue-500">LABS</span></h1>
          </div>
          <div className="w-16 h-1 bg-blue-600 mx-auto rounded-full" />
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl">
          {peptideAccessNotice && !forgotView && (
            <div className="mb-5 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
              <p className="text-sm font-bold text-blue-200">Peptides catalog access requires login and verified customer email.</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">Sign in or create an account, then complete email verification to view the Peptides catalog.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => navigate('/shop')}
                  className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm font-bold text-zinc-300 transition-colors hover:border-blue-500/50 hover:text-white">
                  ← Back to Store
                </button>
                <button type="button" onClick={() => navigate('/')}
                  className="rounded-xl border border-blue-500/40 bg-blue-600/15 px-3 py-2 text-sm font-bold text-blue-200 transition-colors hover:bg-blue-600/25 hover:text-white">
                  Home
                </button>
              </div>
            </div>
          )}
          {forgotView ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-white font-bold text-lg">{forgotMode === 'username' ? 'Recover username' : t.auth.forgotTitle}</h2>
                <p className="text-zinc-500 text-sm mt-1">{forgotMode === 'username' ? 'Enter the email or phone number on your account and we’ll send your username.' : 'Enter the email or phone number on your account and we’ll send a reset link.'}</p>
              </div>
              {forgotSent ? (
                <>
                  <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 text-sm">
                    {forgotMode === 'username' ? 'If an account exists for that email or phone, your username is on the way.' : t.auth.resetLinkSent}
                  </div>
                  <button onClick={closeForgot}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-colors">
                    {t.auth.goToSignIn}
                  </button>
                </>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Email or Phone</label>
                    <input type="text" placeholder="you@email.com or phone" value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)} required autoComplete={forgotMode === 'username' ? 'username' : 'email'} className={inp} />
                  </div>
                  {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
                  <button type="submit" disabled={loading}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-blue-900/30">
                    {loading ? t.auth.sending : forgotMode === 'username' ? 'Send Username' : t.auth.sendResetLink}
                  </button>
                  <button type="button" onClick={closeForgot}
                    className="w-full text-center text-zinc-500 hover:text-white text-sm transition-colors">
                    {t.auth.backToSignIn}
                  </button>
                </form>
              )}
            </div>
          ) : (
          <>
          <div className="flex rounded-xl overflow-hidden border border-zinc-800 mb-6 p-0.5 gap-0.5 bg-zinc-800/50">
            {[['login', t.auth.signIn], ['register', t.auth.createAccount]].map(([tv, label]) => (
              <button key={tv} onClick={() => { setTab(tv); setError('') }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${tab === tv ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.auth.firstName}</label>
                  <input type="text" placeholder="John" value={form.firstName} onChange={update('firstName')} required autoComplete="given-name" className={inp} />
                </div>
                <div>
                  <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.auth.lastName}</label>
                  <input type="text" placeholder="Doe" value={form.lastName} onChange={update('lastName')} required autoComplete="family-name" className={inp} />
                </div>
              </div>
            )}
            <div>
              <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.auth.username}</label>
              <input type="text" placeholder="username" value={form.username} onChange={update('username')} required autoComplete="username" className={inp} />
            </div>
            {tab === 'register' && (
              <div>
                <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.auth.email}</label>
                <input type="email" placeholder="you@email.com" value={form.email} onChange={update('email')} required autoComplete="email" className={inp} />
                <p className="text-zinc-600 text-xs mt-1">{t.auth.emailHint}</p>
              </div>
            )}
            {tab === 'register' && (
              <div>
                <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.auth.phone}</label>
                <input type="tel" placeholder="(346) 555-0100" value={form.phone} onChange={update('phone')} required autoComplete="tel" className={inp} />
              </div>
            )}
            <div>
              <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.auth.password}</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={update('password')} required
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'} className={inp + ' pr-12'} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showPass
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                    }
                  </svg>
                </button>
              </div>
            </div>
            {tab === 'register' && (
              <div>
                <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.auth.confirmPassword}</label>
                <input type={showPass ? 'text' : 'password'} placeholder="••••••••" value={form.confirm} onChange={update('confirm')} required autoComplete="new-password" className={inp} />
              </div>
            )}
            {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-colors shadow-lg shadow-blue-900/30">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {tab === 'login' ? t.auth.signingIn : t.auth.creatingAccount}
                </span>
              ) : (tab === 'login' ? t.auth.signIn : t.auth.createAccount)}
            </button>
            {tab === 'login' && (
              <div className="space-y-2">
                <button type="button" onClick={() => openForgot('password')}
                  className="w-full text-center text-zinc-500 hover:text-blue-400 text-sm transition-colors">
                  {t.auth.forgotPassword}
                </button>
                <button type="button" onClick={() => openForgot('username')}
                  className="w-full text-center text-zinc-500 hover:text-blue-400 text-sm transition-colors">
                  Forgot username?
                </button>
              </div>
            )}
          </form>
          </>
          )}
        </div>
        {showPeptideNav && (
          <div className="mt-4 flex items-center justify-center gap-4 text-sm">
            <button type="button" onClick={() => navigate('/shop')} className="text-zinc-500 transition-colors hover:text-white">Back to Store</button>
            <span className="text-zinc-700">•</span>
            <button type="button" onClick={() => navigate('/')} className="text-zinc-500 transition-colors hover:text-white">Home</button>
          </div>
        )}
        <p className="text-center text-zinc-600 text-xs mt-5">{t.auth.ageNotice}</p>
      </div>
      </div>
      <Footer />
    </div>
  )
}
