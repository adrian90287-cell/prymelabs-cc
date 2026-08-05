import { useState, useEffect } from 'react'
import { useLanguage, useT } from '../context/LanguageContext'

function LangToggle() {
  const { lang, setLanguage } = useLanguage()
  return (
    <div className="flex rounded-lg overflow-hidden border border-zinc-700">
      {['en', 'es'].map(l => (
        <button key={l} onClick={() => setLanguage(l)}
          className={`px-3 py-1 text-xs font-bold transition-colors uppercase ${lang === l ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

export default function AgeGate() {
  const [show, setShow] = useState(false)
  const t = useT()

  useEffect(() => {
    // Skip age gate on the admin page entirely, and if already verified as admin
    const isAdminPage = window.location.pathname === '/admin'
    const isAdmin = typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('pl_admin_token')
    const ageToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pl_age_token') : null

    if (isAdminPage || isAdmin) {
      setShow(false)
      return
    }

    // If they have an age token, verify it on the server
    if (ageToken) {
      fetch('/api/auth/age-verify', {
        headers: { Authorization: `Bearer ${ageToken}` }
      })
        .then(r => r.json())
        .then(d => {
          if (d.verified) {
            setShow(false)
          } else {
            setShow(true)
          }
        })
        .catch(() => setShow(true))
    } else {
      setShow(true)
    }
  }, [])

  if (!show) return null

  const handleVerify = async () => {
    try {
      const res = await fetch('/api/auth/age-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      if (data.token) {
        sessionStorage.setItem('pl_age_token', data.token)
        setShow(false)
      }
    } catch (e) {
      console.error('Age verification failed:', e)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950 px-4 py-8">
      <div className="w-full max-w-md mx-auto my-auto text-center min-h-full flex flex-col justify-center">
        <div className="mb-10">
          <h1 className="text-5xl font-black text-white tracking-widest">
            PRYME<span className="text-blue-500">LABS</span>
          </h1>
          <div className="w-20 h-1 bg-blue-600 mx-auto mt-3 rounded-full" />
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="flex justify-end mb-4">
            <LangToggle />
          </div>

          <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">{t.ageGate.title}</h2>
          <p className="text-zinc-400 mb-6 leading-relaxed">{t.ageGate.body}</p>

          {/* Research disclaimers */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6 text-left">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex gap-3">
                <span className="text-amber-400 text-xs font-black uppercase tracking-widest">{t.ageGate.researchOnly}</span>
                <span className="text-amber-500/60 text-xs font-bold">·</span>
                <span className="text-amber-400 text-xs font-black uppercase tracking-widest">{t.ageGate.notForHuman}</span>
              </div>
            </div>
            <p className="text-amber-200/60 text-xs leading-relaxed">{t.ageGate.disclaimer}</p>
          </div>

          <div className="space-y-3">
            <button onClick={handleVerify}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-2xl transition-all duration-150 text-lg tracking-wide shadow-lg shadow-blue-900/40">
              {t.ageGate.enter}
            </button>
            <button onClick={() => window.location.href = 'https://www.google.com'}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-medium rounded-2xl transition-colors">
              {t.ageGate.exit}
            </button>
          </div>
        </div>

        <p className="mt-6 text-zinc-600 text-xs leading-relaxed">{t.ageGate.footer}</p>
      </div>
    </div>
  )
}
