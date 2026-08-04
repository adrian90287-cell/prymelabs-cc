import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useT } from '../context/LanguageContext'
import Navbar from '../components/Navbar'
import CartSidebar from '../components/CartSidebar'
import Footer from '../components/Footer'
import { authHeaders } from '../lib/authHeaders'

function statusColors(status) {
  return {
    pending:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    paid:      'bg-blue-500/15 text-blue-400 border-blue-500/30',
    fulfilled: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    shipped:   'bg-green-500/15 text-green-400 border-green-500/30',
    completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    cancelled: 'bg-red-500/15 text-red-400 border-red-500/30',
    refunded:  'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  }[status] || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
}

// ── Live tracking (data from /api/my-orders/track) ──
const TRACK_STEPS = ['label_created', 'in_transit', 'out_for_delivery', 'delivered']

function trackStatusColors(status) {
  return {
    label_created:    'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    in_transit:       'bg-blue-500/15 text-blue-400 border-blue-500/30',
    out_for_delivery: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    delivered:        'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    exception:        'bg-red-500/15 text-red-400 border-red-500/30',
  }[status] || 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30'
}

function formatDate(ts, lang) {
  if (!ts) return '—'
  const locale = lang === 'ES' ? 'es-MX' : 'en-US'
  return new Date(ts * 1000).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
}

function ItemReview({ productId, name, token, t }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [state, setState] = useState('idle') // idle | sending | done | error
  const submit = async () => {
    if (!rating) return
    setState('sending')
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product_id: productId, rating, comment }),
      })
      setState(res.ok ? 'done' : 'error')
    } catch { setState('error') }
  }
  if (state === 'done') return <div className="text-green-400 text-xs py-1.5">★ {name} — {t.orders.reviewThanks}</div>
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-zinc-300 text-sm flex-1 min-w-0 truncate">{name}</span>
        <div className="flex">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => setRating(n)}
              className={`text-lg leading-none ${n <= rating ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'}`}>★</button>
          ))}
        </div>
      </div>
      {rating > 0 && (
        <div className="flex gap-1.5">
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder={t.orders.reviewPlaceholder}
            className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white placeholder-zinc-600 text-xs focus:outline-none focus:border-blue-500" />
          <button onClick={submit} disabled={state === 'sending'}
            className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white shrink-0">
            {state === 'sending' ? '…' : t.orders.reviewSubmit}
          </button>
        </div>
      )}
      {state === 'error' && <div className="text-red-400 text-xs">{t.orders.reviewError}</div>}
    </div>
  )
}

function OrderCard({ order }) {
  const [open, setOpen] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [reorderNote, setReorderNote] = useState('')
  const { addItem } = useCart()
  const { token } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const displayTotal = order.order_total > 0 ? order.order_total : order.subtotal

  const [paidClaimed, setPaidClaimed] = useState(!!order.payment_claimed_at)
  const [claiming, setClaiming] = useState(false)
  const markPaid = async () => {
    setClaiming(true)
    try {
      const res = await fetch('/api/my-orders/notify-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: order.id }),
      })
      if (res.ok) setPaidClaimed(true)
    } catch {}
    finally { setClaiming(false) }
  }

  const reorder = async () => {
    setReordering(true); setReorderNote('')
    try {
      const res = await fetch('/api/products', { headers: authHeaders() })
      const data = await res.json()
      const products = data.products || []
      let added = 0
      const unavailable = []
      for (const item of order.items || []) {
        const p = products.find(pr => pr.id === item.product_id)
        const inStock = p && p.in_stock !== 0 && p.in_stock !== false
        if (!inStock) { unavailable.push(item.name); continue }
        const times = Math.max(1, Number(item.qty) || 1)
        for (let k = 0; k < times; k++) addItem(p)
        added++
      }
      if (added === 0) { setReorderNote(t.orders.reorderNone); return }
      if (unavailable.length) setReorderNote(t.orders.reorderPartial(unavailable.join(', ')))
      else navigate('/checkout')
    } catch { setReorderNote(t.orders.reorderError) }
    finally { setReordering(false) }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left p-5 hover:bg-zinc-800/30 transition-colors">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-white font-bold">{order.order_number}</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${statusColors(order.status)}`}>
                {t.orders.status[order.status] || order.status}
              </span>
            </div>
            <div className="text-zinc-500 text-sm">{formatDate(order.created_at, t.lang)} · {order.payment_method}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-amber-400 font-black text-xl">${Number(displayTotal).toFixed(2)}</span>
            <svg className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-5 space-y-4">
          <div>
            <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">{t.orders.itemsOrdered}</div>
            <div className="space-y-2">
              {(order.items || []).map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium">{item.name}</span>
                    {item.size && <span className="text-zinc-500 text-xs">{item.size}</span>}
                    <span className="bg-zinc-800 text-zinc-400 text-xs rounded px-1.5 py-0.5">×{item.qty}</span>
                  </div>
                  <span className="text-zinc-300 text-sm font-semibold">${(item.price * item.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
            {(order.discount_amount > 0 || order.shipping_cost > 0 || order.tax_amount > 0) && (
              <div className="mt-3 pt-3 border-t border-zinc-800/60 space-y-1.5 text-xs text-zinc-500">
                {order.discount_amount > 0 && (
                  <div className="flex justify-between text-green-400/80"><span>{t.orders.promoDiscount(order.promo_code)}</span><span>−${Number(order.discount_amount).toFixed(2)}</span></div>
                )}
                {order.shipping_cost > 0 && (
                  <div className="flex justify-between"><span>{order.shipping_rate_name || t.orders.shippingLabel}</span><span>${Number(order.shipping_cost).toFixed(2)}</span></div>
                )}
                {order.tax_amount > 0 && (
                  <div className="flex justify-between"><span>{t.orders.taxLabel}</span><span>${Number(order.tax_amount).toFixed(2)}</span></div>
                )}
              </div>
            )}
          </div>

          {order.status === 'pending' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <div className="text-amber-400 font-semibold text-sm mb-1">{t.orders.actionRequired}</div>
              <div className="text-zinc-400 text-sm">
                {t.orders.paymentReminder(Number(displayTotal).toFixed(2), order.payment_method, order.order_number)}
              </div>
              <div className="mt-3">
                {paidClaimed ? (
                  <div className="text-green-400 text-sm font-semibold">{t.orders.paidClaimed}</div>
                ) : (
                  <button onClick={markPaid} disabled={claiming}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">
                    {claiming ? t.orders.paidClaiming : t.orders.markPaid}
                  </button>
                )}
              </div>
            </div>
          )}

          {order.status === 'shipped' && order.tracking?.number && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <div className="text-green-400 font-semibold text-sm mb-1">{t.orders.shipped}</div>
              <div className="text-zinc-300 text-sm">
                <span className="font-medium">{order.tracking.carrier}</span>: <span className="font-bold text-white">{order.tracking.number}</span>
              </div>
            </div>
          )}

          {order.shipping && (order.shipping.address || order.shipping.city) && (
            <div>
              <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">{t.orders.shippingTo}</div>
              <div className="text-zinc-300 text-sm">
                {order.shipping.name && <div className="text-white">{order.shipping.name}</div>}
                <div>{order.shipping.address}{order.shipping.address2 ? `, ${order.shipping.address2}` : ''}</div>
                <div>{order.shipping.city}, {order.shipping.state} {order.shipping.zip}</div>
              </div>
            </div>
          )}

          {/* Rate items (delivered orders) */}
          {['shipped', 'completed'].includes(order.status) && (order.items || []).some(i => i.product_id) && (
            <div>
              <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">{t.orders.rateItems}</div>
              <div className="space-y-2.5">
                {(order.items || []).filter(i => i.product_id).map((i, idx) => (
                  <ItemReview key={idx} productId={i.product_id} name={i.name} token={token} t={t} />
                ))}
              </div>
            </div>
          )}

          {/* Reorder */}
          <div className="pt-1">
            <button onClick={reorder} disabled={reordering}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {reordering ? t.orders.reordering : t.orders.reorder}
            </button>
            {reorderNote && <div className="text-amber-400 text-xs mt-2">{reorderNote}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function formatDateTime(ts, lang) {
  if (!ts) return '—'
  const locale = lang === 'ES' ? 'es-MX' : 'en-US'
  return new Date(ts * 1000).toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatEstDate(dateStr, lang) {
  if (!dateStr) return null
  const locale = lang === 'ES' ? 'es-MX' : 'en-US'
  const d = new Date(`${dateStr}T00:00:00`)
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
}

function ProgressSteps({ status, t }) {
  const isExc = status === 'exception'
  const idx = isExc ? 1 : TRACK_STEPS.indexOf(status)
  return (
    <div>
      <div className="flex items-center">
        {TRACK_STEPS.map((step, i) => (
          <Fragment key={step}>
            {i > 0 && <div className={`h-1 flex-1 rounded ${i <= idx ? 'bg-green-500' : 'bg-zinc-800'}`} />}
            <div className={`w-4 h-4 rounded-full shrink-0 border-2 transition-colors ${
              i < idx ? 'bg-green-500 border-green-500'
              : i === idx ? (isExc ? 'bg-red-500 border-red-500 ring-4 ring-red-500/20' : 'bg-green-500 border-green-500 ring-4 ring-green-500/20')
              : 'bg-zinc-900 border-zinc-700'}`} />
          </Fragment>
        ))}
      </div>
      <div className="grid grid-cols-4 mt-2">
        {TRACK_STEPS.map((step, i) => (
          <span key={step} className={`text-[10px] font-semibold leading-tight ${i === 0 ? 'text-left' : i === 3 ? 'text-right' : 'text-center'} ${i <= idx ? (isExc && i === idx ? 'text-red-400' : 'text-green-400') : 'text-zinc-600'}`}>
            {t.orders.trackStatus[step]}
          </span>
        ))}
      </div>
    </div>
  )
}

function ShipmentCard({ shipment, t }) {
  const [showAll, setShowAll] = useState(false)
  const events = shipment.events || []
  const visible = showAll ? events : events.slice(0, 4)
  const est = shipment.status !== 'delivered' ? formatEstDate(shipment.est_delivery, t.lang) : null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="text-white font-bold">{shipment.order_number}</div>
          <div className="text-zinc-500 text-sm">
            {shipment.carrier} · <span className="font-mono text-zinc-300 tracking-wide">{shipment.number}</span>
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${trackStatusColors(shipment.status)}`}>
          {t.orders.trackStatus[shipment.status] || shipment.status}
        </span>
      </div>

      {shipment.live && <ProgressSteps status={shipment.status} t={t} />}

      {shipment.status === 'exception' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{t.orders.exceptionNote}</div>
      )}
      {shipment.live && shipment.status === 'unknown' && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-zinc-400 text-sm">{t.orders.awaitingScanNote}</div>
      )}

      <div className="flex items-center gap-4 flex-wrap text-sm">
        {est && (
          <span className="text-zinc-400">{t.orders.estDelivery}: <span className="text-white font-semibold">{est}</span></span>
        )}
        {shipment.link && (
          <a href={shipment.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 font-semibold">
            {t.orders.viewOnCarrier(shipment.carrier)} ↗
          </a>
        )}
      </div>

      {events.length > 0 && (
        <div>
          <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">{t.orders.trackingHistory}</div>
          <div className="space-y-2.5">
            {visible.map((e, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${i === 0 ? 'bg-green-500' : 'bg-zinc-700'}`} />
                  {i < visible.length - 1 && <div className="w-px flex-1 bg-zinc-800 mt-1" />}
                </div>
                <div className="pb-1 min-w-0">
                  <div className={`text-sm ${i === 0 ? 'text-white font-medium' : 'text-zinc-400'}`}>{e.description}</div>
                  <div className="text-zinc-600 text-xs">{formatDateTime(e.ts, t.lang)}{e.location ? ` · ${e.location}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
          {events.length > 4 && (
            <button onClick={() => setShowAll(s => !s)} className="mt-2 text-zinc-500 hover:text-zinc-300 text-xs font-semibold transition-colors">
              {showAll ? t.orders.showLess : t.orders.showAllUpdates(events.length)}
            </button>
          )}
        </div>
      )}

      {shipment.live && shipment.checked_at && (
        <div className="text-zinc-600 text-xs">{t.orders.lastUpdated}: {formatDateTime(shipment.checked_at, t.lang)}</div>
      )}
    </div>
  )
}

function TrackTab({ token, t }) {
  const [shipments, setShipments] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/my-orders/track', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setShipments(d.shipments || []))
      .catch(() => setError(t.orders.trackLoadError))
  }, [token])

  if (error) return <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-4">{error}</div>

  if (shipments === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (shipments.length === 0) {
    return <div className="text-center py-20 text-zinc-600">{t.orders.noShipments}</div>
  }

  return (
    <div className="space-y-3 mt-4">
      {shipments.map(s => <ShipmentCard key={s.order_id} shipment={s} t={t} />)}
    </div>
  )
}

function EmailPreferences({ token, t }) {
  const [unsubscribed, setUnsubscribed] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/my/preferences', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setUnsubscribed(d.email_unsubscribed ?? false))
      .catch(() => {})
  }, [token])

  const toggle = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/my/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email_unsubscribed: !unsubscribed }),
      })
      const d = await res.json()
      if (d.success) setUnsubscribed(d.email_unsubscribed)
    } catch {}
    finally { setBusy(false) }
  }

  if (unsubscribed === null) return null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
      <div>
        <div className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-0.5">{t.orders.emailPreferences}</div>
        <div className={`text-sm font-medium ${unsubscribed ? 'text-zinc-500' : 'text-green-400'}`}>
          {unsubscribed ? t.orders.unsubscribed : t.orders.subscribed}
        </div>
      </div>
      <button onClick={toggle} disabled={busy}
        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 ${unsubscribed ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'}`}>
        {unsubscribed ? t.orders.resubscribe : t.orders.unsubscribe}
      </button>
    </div>
  )
}

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('orders')
  const { token } = useAuth()
  const navigate = useNavigate()
  const t = useT()

  useEffect(() => {
    fetch('/api/my-orders', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setOrders(d.orders || []); setLoading(false) })
      .catch(() => { setError(t.orders.loadError); setLoading(false) })
  }, [token])

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />
      <CartSidebar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <button onClick={() => navigate('/shop')} className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm mb-6">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {t.orders.backToShop}
        </button>

        <h1 className="text-3xl font-black text-white mb-6">{t.orders.title}</h1>

        <div className="flex gap-2 mb-5">
          {[['orders', t.orders.ordersTab], ['track', t.orders.trackTab]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${tab === key ? 'bg-blue-600 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'}`}>
              {key === 'track' ? '📦 ' : ''}{label}
            </button>
          ))}
        </div>

        {tab === 'track' ? (
          <TrackTab token={token} t={t} />
        ) : (
          <>
            <EmailPreferences token={token} t={t} />

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <span className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-4">{error}</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-zinc-600 text-lg mb-4">{t.orders.noOrders}</div>
                <button onClick={() => navigate('/shop')} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-colors">
                  {t.orders.startShopping}
                </button>
              </div>
            ) : (
              <div className="space-y-3 mt-4">
                {orders.map(order => <OrderCard key={order.id} order={order} />)}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  )
}
