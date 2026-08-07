import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const DISMISS_KEY = 'pl_phone_verify_dismissed'

async function readJson(res) {
  const text = await res.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { error: text } }
}

export default function PhoneVerificationPrompt({ required = false, onVerified }) {
  const { user, token, updateSession } = useAuth()
  const [dismissed, setDismissed] = useState(() => !required && sessionStorage.getItem(DISMISS_KEY) === '1')
  const [sent, setSent] = useState(false)
  const [phone, setPhone] = useState(user?.phone || '')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')

  if (!user || !token || user.phone_verified === true || dismissed) return null

  const savePhone = async (e) => {
    e?.preventDefault()
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/auth/update-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone }),
      })
      const d = await readJson(res)
      if (!res.ok) { setErr(d.error || 'Could not save phone number'); return }
      updateSession(d.token, d.user)
      setPhone(d.user?.phone || phone)
      setTimeout(() => sendCode(d.token), 50)
    } catch {
      setErr('Network error saving phone number')
    } finally {
      setLoading(false)
    }
  }

  const sendCode = async (tokenOverride) => {
    const authToken = typeof tokenOverride === 'string' ? tokenOverride : token
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/auth/phone-verification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const d = await readJson(res)
      if (!res.ok) { setErr(d.error || `Could not send verification code (${res.status})`); return }
      if (d.already_verified && d.token && d.user) {
        updateSession(d.token, d.user)
        onVerified?.()
        return
      }
      setSent(true)
      setHint(d.phone_hint || '')
    } catch {
      setErr('Network error sending verification code')
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async (e) => {
    e?.preventDefault()
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/auth/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      })
      const d = await readJson(res)
      if (!res.ok) { setErr(d.error || 'Could not verify code'); return }
      updateSession(d.token, d.user)
      onVerified?.()
    } catch {
      setErr('Network error verifying code')
    } finally {
      setLoading(false)
    }
  }

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  const card = (
    <div className={`${required ? 'w-full max-w-md' : 'w-full sm:max-w-sm'} bg-zinc-900 border border-blue-500/30 rounded-3xl p-5 shadow-2xl shadow-blue-950/30`}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-xl shrink-0">📱</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-black text-lg">{required ? 'Verify phone to enter Peptides' : 'Verify your phone'}</h3>
          <p className="text-zinc-500 text-sm mt-1">
            {required
              ? 'Peptide access requires a verified customer phone number.'
              : 'This helps protect your account and unlocks restricted sections.'}
          </p>
        </div>
        {!required && (
          <button onClick={dismiss} className="text-zinc-600 hover:text-white text-xl leading-none">×</button>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {!user.phone ? (
          <form onSubmit={savePhone} className="space-y-3">
            <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="Enter phone number"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
            <button disabled={loading || !phone.trim()}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold">
              {loading ? 'Saving…' : 'Save Phone & Send Code'}
            </button>
          </form>
        ) : !sent ? (
          <button onClick={sendCode} disabled={loading}
            className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold">
            {loading ? 'Sending…' : 'Send Verification Code'}
          </button>
        ) : (
          <form onSubmit={verifyCode} className="space-y-3">
            <p className="text-zinc-500 text-xs">Enter the 6-digit code sent to the phone ending in {hint || 'your account'}.</p>
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" inputMode="numeric" autoComplete="one-time-code"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-center tracking-[0.35em] font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
            <button disabled={loading || code.length !== 6}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold">
              {loading ? 'Checking…' : 'Verify Phone'}
            </button>
            <button type="button" onClick={sendCode} disabled={loading}
              className="w-full text-zinc-500 hover:text-blue-400 text-sm">Resend code</button>
          </form>
        )}
        {err && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-sm">{err}</div>}
      </div>
    </div>
  )

  if (required) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-sm px-4 flex items-center justify-center">
        {card}
      </div>
    )
  }

  return (
    <div className="fixed bottom-5 left-4 right-4 sm:left-auto z-40 pointer-events-none">
      <div className="pointer-events-auto">{card}</div>
    </div>
  )
}
