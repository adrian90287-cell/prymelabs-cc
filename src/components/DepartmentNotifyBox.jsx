import { useState } from 'react'
import { DEPARTMENT_META } from './ProductGrid'

export default function DepartmentNotifyBox({ department }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const meta = DEPARTMENT_META[department]

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setStatus(''); setBusy(true)
    try {
      const res = await fetch('/api/departments/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department, email }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Could not join list'); return }
      setStatus(`You're on the ${department} release list.`)
      setEmail('')
    } catch {
      setErr('Network error joining list')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md mx-auto mt-6 bg-zinc-900 border border-zinc-800 rounded-3xl p-5 text-left">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-xl">{meta?.icon || '✨'}</div>
        <div>
          <h3 className="text-white font-black">Get notified when {department} launches</h3>
          <p className="text-zinc-500 text-sm mt-1">We’ll send a quick release note as new products go live.</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@email.com"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-sm" />
        <button disabled={busy} className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm">
          {busy ? 'Joining…' : 'Notify Me'}
        </button>
      </div>
      {status && <div className="text-green-400 text-sm mt-3">{status}</div>}
      {err && <div className="text-red-400 text-sm mt-3">{err}</div>}
    </form>
  )
}
