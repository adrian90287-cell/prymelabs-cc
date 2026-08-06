import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage, useT } from '../context/LanguageContext'
import Footer from '../components/Footer'

export default function ResetPasswordPage() {
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [isAdminReset, setIsAdminReset] = useState(false)
  const navigate = useNavigate()
  const t = useT()
  const { lang, setLanguage } = useLanguage()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tok = params.get('token') || ''
    setIsAdminReset(params.get('admin') === '1')
    setToken(tok)
    if (!tok) setError(t.auth.missingToken)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!token) { setError(t.auth.missingToken); return }
    if (password.length < (isAdminReset ? 10 : 8)) { setError(isAdminReset ? 'Admin password must be at least 10 characters' : t.auth.passwordLength); return }
    if (password !== confirm) { setError(t.auth.passwordMatch); return }
    setLoading(true)
    try {
      const res = await fetch(isAdminReset ? '/api/admin/reset-password' : '/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || t.auth.resetInvalid); return }
      setDone(true)
    } catch { setError(t.auth.networkError) }
    finally { setLoading(false) }
  }

  const inp = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm'

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
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
            {done ? (
              <div className="space-y-4 text-center">
                <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-zinc-300 text-sm">{t.auth.resetSuccess}</p>
                <button onClick={() => navigate(isAdminReset ? '/admin' : '/auth')}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-colors">
                  {t.auth.goToSignIn}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-white font-bold text-lg">{t.auth.resetTitle}</h2>
                  <p className="text-zinc-500 text-sm mt-1">{t.auth.resetSubtitle}</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.auth.newPassword}</label>
                    <div className="relative">
                      <input type={showPass ? 'text' : 'password'} placeholder="••••••••" value={password}
                        onChange={e => setPassword(e.target.value)} required autoComplete="new-password" className={inp + ' pr-12'} />
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
                  <div>
                    <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{t.auth.confirmPassword}</label>
                    <input type={showPass ? 'text' : 'password'} placeholder="••••••••" value={confirm}
                      onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" className={inp} />
                  </div>
                  {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
                  <button type="submit" disabled={loading || !token}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-colors shadow-lg shadow-blue-900/30">
                    {loading ? t.auth.updatingPassword : t.auth.updatePassword}
                  </button>
                  <button type="button" onClick={() => navigate(isAdminReset ? '/admin' : '/auth')}
                    className="w-full text-center text-zinc-500 hover:text-white text-sm transition-colors">
                    {t.auth.backToSignIn}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}
