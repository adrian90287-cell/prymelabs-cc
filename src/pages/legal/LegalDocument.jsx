import { useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import Footer from '../../components/Footer'
import CartSidebar from '../../components/CartSidebar'

export const LAST_UPDATED = 'August 13, 2026'

export function LegalShell({ eyebrow, title, subtitle, children }) {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#07080b] text-white">
      <Navbar />
      <CartSidebar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <button
          onClick={() => navigate('/')}
          className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition-colors hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Pryme Labs
        </button>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-6 shadow-2xl shadow-black/30 sm:p-8">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-300">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">{title}</h1>
          {subtitle && <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-400 sm:text-base">{subtitle}</p>}
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">Last updated: {LAST_UPDATED}</p>
        </section>

        <div className="mt-6 space-y-5">{children}</div>
      </main>

      <Footer />
    </div>
  )
}

export function LegalSection({ title, children, tone = 'default' }) {
  const toneClass = tone === 'warning'
    ? 'border-amber-500/40 bg-amber-500/10'
    : tone === 'important'
      ? 'border-blue-500/35 bg-blue-500/10'
      : 'border-zinc-800 bg-zinc-950/80'

  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${toneClass}`}>
      <h2 className="border-b border-white/10 pb-3 text-lg font-black text-white">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  )
}

export function P({ children }) {
  return <p>{children}</p>
}

export function LegalList({ items }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function NumberedList({ items }) {
  return (
    <ol className="list-decimal space-y-2 pl-5">
      {items.map((item, index) => <li key={index}>{item}</li>)}
    </ol>
  )
}

export function ContactBlock() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <a href="mailto:support@prymelabs.net" className="rounded-xl border border-zinc-800 bg-black/30 p-4 transition-colors hover:border-blue-500/50">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-600">Email</div>
        <div className="mt-1 font-bold text-blue-300">support@prymelabs.net</div>
      </a>
      <a href="tel:+13465509100" className="rounded-xl border border-zinc-800 bg-black/30 p-4 transition-colors hover:border-blue-500/50">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-600">Phone</div>
        <div className="mt-1 font-bold text-blue-300">(346) 550-9100</div>
      </a>
    </div>
  )
}
