import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { taggableCollections, productCollections } from '../lib/collections'
import { computeDisplayPricing } from '../../functions/_utils/pricing.js'
import { resolveSaleConfig, saleAmountForDept } from '../../functions/_utils/sale.js'

const ADMIN_PERMISSION_LABELS = {
  orders: 'Orders',
  willcall: 'Will Call',
  inventory: 'Products / Inventory',
  subscribers: 'Subscribers',
  analytics: 'Analytics',
  promos: 'Promos',
  reviews: 'Reviews',
  coa: 'Certificates / COAs',
  settings: 'Settings',
  storefront: 'Storefront Links',
  tax: 'Tax Records',
  announce: 'Announcements',
  suggestions: 'Suggestions',
  trash: 'Trash',
  admin_users: 'Admin Users & Permissions',
}

const ADMIN_PERMISSION_ORDER = Object.keys(ADMIN_PERMISSION_LABELS)

function adminCan(admin, permission) {
  if (!permission) return true
  if (!admin) return false
  if (admin.owner || admin.role === 'owner') return true
  return Array.isArray(admin.permissions) && admin.permissions.includes(permission)
}

// ─── Toast System ─────────────────────────────────────────────────────────────

const ToastCtx = createContext(null)
function useToast() { return useContext(ToastCtx) }

const TOAST_STYLES = {
  success: 'bg-green-950/95 border-green-700/50 text-green-300',
  error:   'bg-red-950/95 border-red-700/50 text-red-300',
  warning: 'bg-orange-950/95 border-orange-700/50 text-orange-300',
  info:    'bg-zinc-800/95 border-zinc-700/60 text-zinc-200',
}

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-5 z-[200] flex flex-col gap-2 items-stretch sm:items-end pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {toasts.map(t => (
        <div key={t.id}
          className={`pointer-events-auto flex items-center gap-2.5 pl-4 pr-3 py-3 rounded-2xl border shadow-2xl text-sm font-semibold sm:max-w-xs toast-slide-up ${TOAST_STYLES[t.type] || TOAST_STYLES.info}`}>
          <span className="flex-1 leading-snug">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const dismiss = useCallback(id => setToasts(p => p.filter(t => t.id !== id)), [])
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(p => [...p, { id, message, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }, [])
  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  )
}

const STATUS_COLORS = {
  pending:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  paid:      'bg-blue-500/15 text-blue-400 border-blue-500/30',
  fulfilled: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  shipped:   'bg-green-500/15 text-green-400 border-green-500/30',
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-red-500/15 text-red-400 border-red-500/30',
  refunded:  'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}
const STATUS_LABELS = { pending: 'Pending', paid: 'Paid', fulfilled: 'Fulfilled', shipped: 'Shipped', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded' }
const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL', 'Other']

// A Will Call (in-store pickup) order — identified by the "-WC-" order-number
// prefix or the pickup marker stored in shipping_json.
function isWillCallOrder(order) {
  return !!order && (
    (typeof order.order_number === 'string' && order.order_number.includes('-WC-')) ||
    order.shipping?.method === 'will_call' ||
    order.shipping?.pickup === true ||
    order.shipping_rate_name === 'Will Call — Pickup'
  )
}

// ── Live carrier tracking (normalized statuses from /api/admin/refresh-tracking) ──
const TRACK_LABELS = {
  label_created: 'Label Created',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: '⚠ Exception',
  unknown: 'Awaiting Scan',
}
const TRACK_COLORS = {
  label_created: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  in_transit: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  out_for_delivery: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  delivered: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  exception: 'bg-red-500/15 text-red-400 border-red-500/30',
  unknown: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30',
}
const CARRIER_LINKS = {
  USPS:  n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  UPS:   n => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  FedEx: n => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  DHL:   n => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}`,
}
function carrierLink(carrier, number) {
  const fn = CARRIER_LINKS[carrier]
  return fn && number ? fn(number) : null
}
// Top-level storefront departments — drive the home-page tabs (see migrate_v22.sql)
const DEPARTMENTS = ['Health & Wellness', 'Beauty & Grooming', 'Apparel & Gear', 'Peptides']
// Categories offered per department in the product form (the storefront sub-filter).
const CATEGORIES_BY_DEPT = {
  'Peptides': ['GLP Research', 'Recovery & Repair', 'Longevity Research', 'Neural & Cognitive', 'Peptide Hormones', 'Research Supplies'],
  'Health & Wellness': ['Vitamins & Minerals', 'NAD+ & Longevity', 'Hydration & Electrolytes', 'Energy & Performance', 'Sleep & Recovery', 'Digestive Health', 'Immune Support', 'Protein & Fitness', 'General Wellness'],
  'Beauty & Grooming': ['Skincare', 'Hair Care', 'Hair Styling', 'Beard Care', 'Body Care', 'Cleansers', 'Toners', 'Serums', 'Moisturizers', 'Face Creams', 'Soaps', 'Grooming Tools', 'Kits & Bundles'],
  'Apparel & Gear': ['Apparel', 'Drinkware', 'Gym Accessories', 'Bags & Carry', 'Stickers & Extras'],
}
const categoriesFor = (dept) => CATEGORIES_BY_DEPT[dept] || CATEGORIES_BY_DEPT['Peptides']
// Flat union — used by the inventory Category filter dropdown.
const CATEGORIES = [...new Set(Object.values(CATEGORIES_BY_DEPT).flat())]

const inp = 'bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm'
const inpSm = 'bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors text-xs'

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDateShort(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Print a shipping label reliably. Two earlier attempts failed: (1) opening the
// label's cross-origin image URL and calling w.print() on it — blocked by the
// same-origin policy; (2) a hidden 0x0 iframe — some browsers (Edge) won't paint
// a zero-size iframe to the printer, giving a blank page. So we use a real popup
// window (same mechanism as the packing slip, which prints fine) that loads the
// label and prints ITSELF once the image is ready.
function printLabelUrl(url) {
  if (!url) return
  const w = window.open('', '_blank')
  if (!w) { alert('Please allow pop-ups for this site so labels can print.'); return }
  w.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Shipping Label</title>` +
    // Fill the 4x6 sticker: scale the label to the full 4in width and clip any
    // vertical overflow to a single 4x6 page. USPS labels are exactly 4x6 so
    // nothing is clipped; UPS delivers a 4x7 image (an extra ~1in tear-off
    // doc-tab at the bottom) — clipping drops only that tab, keeping the address
    // and both barcodes. Also prevents the old blank second page.
    `<style>@page{size:4in 6in;margin:0}html,body{margin:0;padding:0}` +
    `.wrap{width:4in;height:6in;overflow:hidden}` +
    `.wrap img{width:4in;height:auto;display:block}</style></head>` +
    `<body><div class="wrap"><img src="${url}" alt="Shipping Label" ` +
    `onload="setTimeout(function(){window.focus();window.print()},150)" ` +
    `onerror="document.body.innerHTML='Could not load the label.'"></div></body></html>`
  )
  w.document.close()
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${color}`}>{label}</div>
      <div className="text-3xl font-black text-white">{value}</div>
    </div>
  )
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────

function TrackingPanel({ order, onUpdate }) {
  const [busy, setBusy] = useState(false)
  const [showEvents, setShowEvents] = useState(false)
  const showToast = useToast()
  const adminToken = sessionStorage.getItem('pl_admin_token')

  let events = []
  try { events = JSON.parse(order.tracking_events_json || '[]') } catch {}
  const status = order.tracking_status || 'unknown'
  const est = order.tracking?.est_delivery
  const link = carrierLink(order.tracking?.carrier, order.tracking?.number)

  const refresh = async (e) => {
    e.stopPropagation()
    setBusy(true)
    try {
      const res = await fetch('/api/admin/refresh-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ order_id: order.id, force: true }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Refresh failed', 'error'); return }
      const r = data.results?.[0]
      if (r?.error) showToast(`Carrier error: ${r.error_detail || 'API unavailable — try again later'}`, 'warning')
      else if (r && !r.live) showToast('No API credentials set for this carrier — link-only', 'info')
      else showToast(`✓ Tracking updated — ${TRACK_LABELS[r?.status] || r?.status}`)
      onUpdate()
    } catch { showToast('Network error', 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Live Tracking</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${TRACK_COLORS[status] || TRACK_COLORS.unknown}`}>
          {TRACK_LABELS[status] || status}
        </span>
        {est && <span className="text-zinc-400 text-xs">Est. delivery: <span className="text-white font-semibold">{est}</span></span>}
        <span className="text-zinc-600 text-xs ml-auto">
          {order.tracking_checked_at ? `Checked ${formatDate(order.tracking_checked_at)}` : 'Not checked yet'}
        </span>
        <button onClick={refresh} disabled={busy}
          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs font-bold rounded-lg transition-colors">
          {busy ? 'Checking…' : '↻ Refresh'}
        </button>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-xs">
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="text-blue-400 hover:text-blue-300 font-semibold">
            View on {order.tracking.carrier} ↗
          </a>
        )}
        {events.length > 0 && (
          <button onClick={() => setShowEvents(s => !s)} className="text-zinc-500 hover:text-zinc-300 font-semibold transition-colors">
            {showEvents ? 'Hide history' : `History (${events.length})`}
          </button>
        )}
      </div>
      {showEvents && events.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-zinc-800/60">
          {events.map((e, i) => (
            <div key={i} className="flex gap-3 text-xs">
              <span className="text-zinc-600 shrink-0 w-32">{e.ts ? formatDate(e.ts) : '—'}</span>
              <span className="text-zinc-300 flex-1">{e.description}</span>
              <span className="text-zinc-500 shrink-0">{e.location}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const PARCEL_PRESETS = [
  { label: '7×10 Mailer',   length: '10', width: '7',  height: '0.5', note: 'Poly mailer (your default)' },
  { label: '9×12 Mailer',   length: '12', width: '9',  height: '0.5', note: 'Poly mailer' },
  { label: '10×13 Mailer',  length: '13', width: '10', height: '0.5', note: 'Poly mailer' },
  { label: '6×9 Bubble',    length: '9',  width: '6',  height: '1',   note: 'Bubble mailer' },
  { label: '8×10 Bubble',   length: '10', width: '8',  height: '1.5', note: 'Bubble mailer' },
  { label: 'Small Box',     length: '8',  width: '6',  height: '4',   note: '8×6×4 in' },
  { label: 'Medium Box',    length: '12', width: '9',  height: '6',   note: '12×9×6 in' },
  { label: 'Large Box',     length: '18', width: '12', height: '8',   note: '18×12×8 in' },
]

function EasyPostPanel({ order, onRefresh, onClose, reship = false }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('pl_easypost_parcel') || '{}') } catch { return {} } })()
  // Sum per-item shipping weight captured on the order (oz). New orders carry
  // weight_oz per item; older orders won't, so this falls back to the saved default.
  const autoOz = (order.items || []).reduce((s, i) => s + (Number(i.weight_oz) || 0) * (Number(i.qty) || 1), 0)
  const initWeight = autoOz > 0
    ? { weight: String(Number(autoOz.toFixed(2))), weightUnit: 'oz' }
    : { weight: saved.weight || '', weightUnit: saved.weightUnit || 'oz' }
  const [parcel, setParcel]     = useState({ length: '10', width: '7', height: '0.5', ...saved, ...initWeight })
  const [rates, setRates]       = useState([])
  const [shipmentId, setShipmentId] = useState(null)
  const [selRate, setSelRate]   = useState(null)
  const [step, setStep]         = useState('parcel') // parcel | rates | done
  const [label, setLabel]       = useState(null)
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState('')
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast  = useToast()

  // Editable ship-to address — expanded by default when reshipping so the admin
  // can correct a bad/misdelivered address before buying the new label.
  const initAddr = () => {
    const s = order.shipping || {}
    return { name: s.name || order.customer_name || '', address: s.address || '', address2: s.address2 || '', city: s.city || '', state: s.state || '', zip: s.zip || '', phone: s.phone || '' }
  }
  const [editAddr, setEditAddr] = useState(reship)
  const [addr, setAddr]         = useState(initAddr)
  const [addrSaved, setAddrSaved] = useState(false)

  // Persist the edited address to the order (shipping_json) so easypost-rates,
  // which reads server-side, uses the corrected destination.
  const saveAddress = async () => {
    const res = await fetch('/api/admin/edit-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ order_id: order.id, shipping: { ...(order.shipping || {}), ...addr } }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to save address') }
  }

  const applyPreset = (preset) => {
    setParcel(p => ({ ...p, length: preset.length, width: preset.width, height: preset.height }))
  }

  // Convert weight to ounces for EasyPost API
  const weightInOz = () => {
    const w = Number(parcel.weight)
    return parcel.weightUnit === 'lb' ? (w * 16).toFixed(2) : String(w)
  }

  const getRates = async () => {
    const { length, width, height, weight } = parcel
    if (!length || !width || !height || !weight) { setErr('Fill in all four dimensions'); return }
    if (editAddr && (!addr.address || !addr.city || !addr.state || !addr.zip)) { setErr('Fill in the full ship-to address'); return }
    setBusy(true); setErr('')
    try {
      // If the address panel is open, persist any corrections first so the rate
      // request (which reads the order server-side) uses the new destination.
      if (editAddr) { await saveAddress(); setAddrSaved(true); onRefresh() }
      const res  = await fetch('/api/admin/easypost-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ order_id: order.id, parcel: { length, width, height, weight: weightInOz() } }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Failed to get rates'); return }
      localStorage.setItem('pl_easypost_parcel', JSON.stringify(parcel))
      if ((data.rates || []).length === 0) {
        const hints = []
        if (data.total_rates === 0)           hints.push('EasyPost returned 0 rates total. Make sure your account is fully verified and you are using your production API key.')
        if (data.debug?.length)               hints.push(...data.debug)
        if (data.raw_rates?.length)           hints.push('Carrier responses: ' + data.raw_rates.join(' | '))
        setErr(hints.length ? hints.join('\n') : 'No rates returned. Verify addresses and your EasyPost account setup in Settings → Shipping Labels.')
        return
      }
      setRates(data.rates)
      setShipmentId(data.shipment_id)
      setSelRate(data.rates[0]?.id || null)
      setStep('rates')
    } catch (e) { setErr(e?.message || 'Network error') }
    finally { setBusy(false) }
  }

  const buyLabel = async () => {
    if (!selRate) { setErr('Select a shipping option'); return }
    setBusy(true); setErr('')
    try {
      const res  = await fetch('/api/admin/easypost-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ shipment_id: shipmentId, rate_id: selRate }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Purchase failed'); return }

      // Open + print the label immediately (same-origin wrapper so print works)
      if (data.label_url) printLabelUrl(data.label_url)

      setLabel(data)
      setStep('done')

      // Save tracking number + keep status as 'fulfilled' — NO customer notification yet.
      // Notification fires when admin clicks "Mark Shipped" or carrier first scans the package.
      const rate = rates.find(r => r.id === selRate)
      await fetch('/api/admin/update-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          order_id: order.id,
          status:   'fulfilled',   // stay fulfilled — not shipped yet
          reship,                   // archive old tracking + reset live tracking when reshipping
          // Persist label_url + tracking_url so the label can be reprinted later,
          // and shipment_id so a USPS pickup can be attached to this shipment.
          tracking: { carrier: data.carrier || rate?.carrier || 'USPS', number: data.tracking_number, label_url: data.label_url || null, tracking_url: data.tracking_url || null, shipment_id: shipmentId || null },
        }),
      })
      showToast(reship
        ? '✓ Reship label purchased — old tracking archived. Notify customer when handed to carrier.'
        : '✓ Label purchased — tracking saved. Mark Shipped when handed to carrier.')
      onRefresh() // refresh order data in background, panel stays open
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-zinc-950 border border-blue-500/25 rounded-2xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={`font-bold text-sm flex items-center gap-2 ${reship ? 'text-amber-400' : 'text-blue-400'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5l2 2h3a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h2z"/></svg>
          {reship ? '🔁 Reship — New Label & Tracking' : 'Generate Shipping Label'}
        </span>
        <button onClick={onClose} className="text-zinc-600 hover:text-white transition-colors p-1 rounded-lg hover:bg-zinc-800">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      {reship && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5 text-xs text-amber-300/90 leading-relaxed">
          Buying a new label here archives the old tracking and resets live tracking. The customer isn’t notified until you choose to.
        </div>
      )}

      {/* Ship-to — editable so a bad/misdelivered address can be corrected */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-zinc-600">📍 Ship to</span>
          <button onClick={() => setEditAddr(v => !v)} className="text-blue-400 hover:text-blue-300 font-semibold">
            {editAddr ? 'Done editing' : '✏️ Edit address'}
          </button>
        </div>
        {!editAddr ? (
          <div className="text-zinc-300 leading-relaxed">
            <span className="text-white font-semibold">{addr.name || order.customer_name}</span>
            {addr.address && <> · {addr.address}{addr.address2 ? `, ${addr.address2}` : ''}</>}
            {addr.city && <>, {addr.city}, {addr.state} {addr.zip}</>}
            {addrSaved && <span className="ml-2 text-emerald-400">✓ saved</span>}
          </div>
        ) : (
          <div className="space-y-2">
            <input value={addr.name} onChange={e => { setAddr(a => ({ ...a, name: e.target.value })); setAddrSaved(false) }} placeholder="Name" className={inpSm + ' w-full'} />
            <input value={addr.address} onChange={e => { setAddr(a => ({ ...a, address: e.target.value })); setAddrSaved(false) }} placeholder="Street address" className={inpSm + ' w-full'} />
            <input value={addr.address2} onChange={e => { setAddr(a => ({ ...a, address2: e.target.value })); setAddrSaved(false) }} placeholder="Apt, suite, etc. (optional)" className={inpSm + ' w-full'} />
            <div className="grid grid-cols-3 gap-2">
              <input value={addr.city} onChange={e => { setAddr(a => ({ ...a, city: e.target.value })); setAddrSaved(false) }} placeholder="City" className={inpSm + ' w-full col-span-1'} />
              <input value={addr.state} onChange={e => { setAddr(a => ({ ...a, state: e.target.value })); setAddrSaved(false) }} placeholder="State" className={inpSm + ' w-full'} />
              <input value={addr.zip} onChange={e => { setAddr(a => ({ ...a, zip: e.target.value })); setAddrSaved(false) }} placeholder="ZIP" className={inpSm + ' w-full'} />
            </div>
            <input value={addr.phone} onChange={e => { setAddr(a => ({ ...a, phone: e.target.value })); setAddrSaved(false) }} placeholder="Phone (optional)" className={inpSm + ' w-full'} />
            <button
              onClick={async () => {
                if (!addr.address || !addr.city || !addr.state || !addr.zip) { setErr('Fill in the full ship-to address'); return }
                setBusy(true); setErr('')
                try { await saveAddress(); setAddrSaved(true); showToast('✓ Address updated'); onRefresh() }
                catch (e) { setErr(e?.message || 'Failed to save address') }
                finally { setBusy(false) }
              }}
              disabled={busy}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-xs font-bold rounded-lg transition-colors">
              💾 Save Address
            </button>
          </div>
        )}
      </div>

      {/* Step: parcel dimensions */}
      {step === 'parcel' && (
        <div className="space-y-4">
          {/* Presets */}
          <div>
            <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Quick Presets</div>
            <div className="flex flex-wrap gap-1.5">
              {PARCEL_PRESETS.map(p => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  title={p.note}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    parcel.length === p.length && parcel.width === p.width && parcel.height === p.height
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div>
            <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Dimensions <span className="text-zinc-700 normal-case font-normal">(inches)</span></div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'length', label: 'Length' },
                { key: 'width',  label: 'Width'  },
                { key: 'height', label: 'Height' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-zinc-600 text-xs mb-1">{f.label}</label>
                  <input
                    type="number" min="0.1" step="0.1"
                    value={parcel[f.key]}
                    onChange={e => setParcel(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder="0"
                    className={inp + ' w-full text-center'}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Weight with oz/lb toggle */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Weight</div>
              {autoOz > 0 && (
                <button onClick={() => setParcel(p => ({ ...p, weight: String(Number(autoOz.toFixed(2))), weightUnit: 'oz' }))}
                  className="text-emerald-400 hover:text-emerald-300 text-xs font-semibold">
                  ↺ Auto from items: {Number(autoOz.toFixed(2))} oz
                </button>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="number" min="0.1" step="0.1"
                value={parcel.weight}
                onChange={e => setParcel(p => ({ ...p, weight: e.target.value }))}
                placeholder="0"
                className={inp + ' w-28 text-center'}
              />
              {/* oz / lb toggle */}
              <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                {['oz', 'lb'].map(unit => (
                  <button key={unit}
                    onClick={() => setParcel(p => {
                      // Convert value when switching units
                      const w = Number(p.weight)
                      const converted = !w ? '' : unit === 'lb' && p.weightUnit === 'oz'
                        ? (w / 16).toFixed(2)
                        : unit === 'oz' && p.weightUnit === 'lb'
                        ? (w * 16).toFixed(1)
                        : p.weight
                      return { ...p, weightUnit: unit, weight: String(converted) }
                    })}
                    className={`px-3 py-2 text-xs font-bold transition-colors ${parcel.weightUnit === unit ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
                    {unit}
                  </button>
                ))}
              </div>
              {parcel.weight && (
                <span className="text-zinc-600 text-xs">
                  = {parcel.weightUnit === 'oz'
                    ? `${(Number(parcel.weight) / 16).toFixed(3)} lb`
                    : `${(Number(parcel.weight) * 16).toFixed(1)} oz`}
                </span>
              )}
            </div>
          </div>

          <p className="text-zinc-700 text-xs">Preset + weight saved as your default for next time.</p>
          {err && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 space-y-1">
              {err.split('\n').map((line, i) => (
                <div key={i} className="text-red-300 text-xs leading-relaxed">{line}</div>
              ))}
            </div>
          )}
          <button onClick={getRates} disabled={busy}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">
            {busy ? 'Getting rates…' : '🔍 Get Shipping Rates'}
          </button>
        </div>
      )}

      {/* Step: rate selection */}
      {step === 'rates' && (
        <div className="space-y-3">
          <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Choose a Rate</div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {rates.length === 0 && <div className="text-zinc-500 text-sm text-center py-4">No rates available for this shipment.</div>}
            {rates.map(r => (
              <button key={r.id} onClick={() => setSelRate(r.id)}
                className={`w-full text-left flex items-center justify-between p-3 rounded-xl border transition-all ${
                  selRate === r.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'
                }`}>
                <div className="min-w-0 flex-1">
                  <div className={`font-bold text-sm ${selRate === r.id ? 'text-white' : 'text-zinc-300'}`}>
                    {r.carrier} — {r.service}
                  </div>
                  {(r.days || r.arrives) && (
                    <div className="text-zinc-500 text-xs mt-0.5">
                      {r.days ? `Est. ${r.days} day${r.days === 1 ? '' : 's'}` : ''}{r.arrives ? ` · ${r.arrives}` : ''}
                    </div>
                  )}
                  {r.warnings?.filter(w => w.includes('Residential') || w.includes('invoice may vary')).map((w, i) => (
                    <div key={i} className="text-amber-500/80 text-xs mt-0.5">⚠ {w}</div>
                  ))}
                </div>
                <div className={`font-black text-base shrink-0 ml-3 ${selRate === r.id ? 'text-blue-400' : 'text-zinc-300'}`}>
                  ${r.price.toFixed(2)}
                </div>
              </button>
            ))}
          </div>
          {err && <div className="text-red-400 text-sm">{err}</div>}
          <div className="flex gap-2">
            <button onClick={() => { setStep('parcel'); setErr('') }}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold rounded-xl transition-colors shrink-0">
              ← Back
            </button>
            <button onClick={buyLabel} disabled={busy || !selRate}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">
              {busy ? 'Purchasing…' : '💳 Purchase Label & Ship'}
            </button>
          </div>
          <p className="text-zinc-700 text-xs text-center">Postage cost will be charged to your EasyPost account.</p>
        </div>
      )}

      {/* Step: done */}
      {step === 'done' && label && (
        <div className="space-y-3">
          <div className="bg-green-500/10 border border-green-500/25 rounded-xl p-4 space-y-1.5">
            <div className="text-green-400 font-bold text-sm">✓ Label Purchased!</div>
            <div className="text-xs text-zinc-400">
              <span className="text-zinc-300 font-semibold">{label.carrier}</span>{label.service ? ` — ${label.service}` : ''}
            </div>
            <div className="font-mono text-white text-sm font-bold tracking-wide">{label.tracking_number}</div>
          </div>

          {/* Label download */}
          <div className="flex gap-2 flex-wrap">
            {label.label_url && (
              <>
                <a href={label.label_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  Download Label
                </a>
                <button
                  onClick={() => printLabelUrl(label.label_url)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                  Print Label
                </button>
              </>
            )}
            {label.tracking_url && (
              <a href={label.tracking_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold rounded-xl transition-colors">
                Track Package ↗
              </a>
            )}
          </div>

          {/* Shipped notification control */}
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 space-y-2">
            <div className="text-amber-400 text-xs font-semibold">📦 When are you handing this to the carrier?</div>
            <p className="text-zinc-500 text-xs">The customer has NOT been notified yet. Choose when to send their shipping notification:</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={async () => {
                  setBusy(true)
                  const rate = rates.find(r => r.id === selRate)
                  await fetch('/api/admin/update-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
                    body: JSON.stringify({
                      order_id: order.id,
                      status:   'shipped',
                      tracking: { carrier: label.carrier || rate?.carrier || 'USPS', number: label.tracking_number, label_url: label.label_url || null, tracking_url: label.tracking_url || null, shipment_id: shipmentId || null },
                    }),
                  })
                  showToast('📦 Order marked shipped — customer notified!')
                  setBusy(false)
                  onRefresh()
                  onClose()
                }}
                disabled={busy}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors">
                📬 Notify Customer Now
              </button>
              <div className="flex items-center gap-1.5 text-zinc-600 text-xs">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Or close this — customer auto-notified when carrier scans the package
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OrderRow({ order, onUpdate, onDelete, selectable, selected, onToggle }) {
  const [open, setOpen] = useState(false)
  const [showLabelPanel, setShowLabelPanel] = useState(false)
  const [reshipMode, setReshipMode] = useState(false)
  const [tracking, setTracking] = useState({ carrier: order.tracking?.carrier || 'USPS', number: order.tracking?.number || '' })
  const [notes, setNotes] = useState(order.notes || '')
  const [internalNotes, setInternalNotes] = useState(order.internal_notes || '')
  const [readyAfterDate, setReadyAfterDate] = useState(order.ready_after ? new Date(order.ready_after * 1000).toISOString().slice(0, 16) : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [uberDispatching, setUberDispatching] = useState(false)
  const [uberResult, setUberResult] = useState(null)

  // Auto-sync tracking fields when parent refreshes order data (e.g. after EasyPost label purchase)
  useEffect(() => {
    if (order.tracking?.number) {
      setTracking({ carrier: order.tracking.carrier || 'USPS', number: order.tracking.number })
    }
  }, [order.tracking?.carrier, order.tracking?.number])
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const trashOrder = async (e) => {
    e.stopPropagation()
    if (!confirm('Move this order to trash? Inventory will be restored if the order was active.')) return
    setBusy(true)
    try {
      await fetch('/api/admin/delete-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ order_id: order.id, action: 'trash' }),
      })
      showToast('Order moved to trash', 'info')
      onDelete?.()
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  const update = async (status, extra = {}, toastMsg) => {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/update-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ order_id: order.id, status, notes: notes || undefined, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Update failed'); return }
      const AUTO = { paid: '✓ Payment verified', fulfilled: '✓ Order fulfilled', shipped: '📦 Shipped — customer notified', completed: '✅ Order completed', cancelled: 'Order cancelled', refunded: '↩ Refund issued' }
      const msg = toastMsg !== undefined ? toastMsg : (AUTO[status] || '✓ Saved')
      showToast(msg, ['cancelled','refunded'].includes(status) ? 'warning' : 'success')
      onUpdate()
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  const sendReminder = async () => {
    if (!confirm(`Send a friendly payment reminder to ${order.customer_email}?`)) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/payment-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ order_id: order.id }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Failed to send reminder'); return }
      showToast(data.sms ? '✉ Reminder emailed + texted to customer' : '✉ Payment reminder emailed to customer', 'success')
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  const printLabel = () => printLabelUrl(order.tracking?.label_url)

  const printPackingSlip = () => {
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    const ship = order.shipping || {}
    const willCall = isWillCallOrder(order)
    // Will Call orders have no shipping address — show the customer's contact
    // info and a pickup label so the packing slip is still usable at the counter.
    const custName = ship.name || order.customer_name || ''
    const shipToLabel = willCall ? 'Pickup · Will Call' : 'Ship To'
    const shipToBody = willCall
      ? `${custName ? `<strong>${esc(custName)}</strong><br>` : ''}🏷️ Will Call — In-Store Pickup${ship.phone ? `<br>${esc(ship.phone)}` : ''}${order.customer_email ? `<br>${esc(order.customer_email)}` : ''}`
      : `${custName ? `<strong>${esc(custName)}</strong><br>` : ''}${esc(ship.address)}${ship.address2 ? ', ' + esc(ship.address2) : ''}<br>${esc(ship.city)}, ${esc(ship.state)} ${esc(ship.zip)}${ship.phone ? `<br>${esc(ship.phone)}` : ''}`
    // Only research peptides carry the "research use only" footer. Items created
    // before departments existed have no department field — default to Peptides
    // (all legacy products were peptides) so their slips keep the disclaimer.
    const hasPeptide = (order.items || []).some(i => (i.department || 'Peptides') === 'Peptides')
    const rows = (order.items || []).map(i =>
      `<tr><td>${esc(i.name)}${i.size ? ` <span style="color:#888">(${esc(i.size)})</span>` : ''}</td><td class="q">${i.qty}</td></tr>`
    ).join('')
    // Header date = when this packing slip is generated/printed (now), not the
    // order date. The order date is kept below, labeled "Order Placed".
    const printedAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    // Sized for 4x6 thermal sticker stock. Content flows onto additional 4x6
    // pages only when it doesn't fit on one — same layout on every sticker.
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Packing Slip ${esc(order.order_number)}</title>
<style>
  @page { size: 4in 6in; margin: 0.16in }
  * { box-sizing: border-box }
  html, body { margin: 0; padding: 0 }
  body { font-family: -apple-system, Arial, sans-serif; color: #111; width: 3.68in; font-size: 10px; line-height: 1.35 }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px }
  .brand { font-size: 16px; font-weight: 800; letter-spacing: .4px }
  .brand span { color: #2563eb }
  .sub { color: #666; font-size: 8px }
  .num { font-size: 12px; font-weight: 800; font-family: monospace }
  .r { text-align: right }
  .lbl { text-transform: uppercase; font-size: 8px; letter-spacing: .5px; color: #888; margin-bottom: 2px }
  .shipto { font-size: 11px; line-height: 1.4; margin-bottom: 8px }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px }
  th { text-align: left; padding: 4px 6px; background: #f3f4f6; font-size: 8px; text-transform: uppercase; letter-spacing: .5px }
  th.q, td.q { text-align: center; width: 34px }
  td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; font-size: 10px; vertical-align: top }
  td.q { font-weight: 700; font-size: 12px }
  tr { page-break-inside: avoid }
  .notes { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 5px; padding: 5px 7px; font-size: 9px; margin-bottom: 8px }
  .foot { border-top: 1px solid #e5e7eb; padding-top: 8px }
  .foot p { margin: 0 0 5px }
  .foot .roud { font-size: 9px; font-weight: 700 }
  .foot .thx { font-size: 10px; font-weight: 600; color: #222 }
  .foot .bd { color: #555; font-size: 9px }
  .foot .ct { color: #333; font-size: 9px }
  .foot .sig { text-align: center; font-weight: 700; font-size: 9px; margin-top: 2px }
  a { color: #2563eb; text-decoration: none }
</style></head>
<body>
  <div class="hdr">
    <div><div class="brand">PRYME<span>LABS</span></div><div class="sub">Packing Slip</div></div>
    <div class="r"><div class="num">${esc(order.order_number)}</div><div class="sub">Printed ${esc(printedAt)}</div><div class="sub">Order Placed ${esc(formatDate(order.created_at))}</div></div>
  </div>
  <div class="lbl">${shipToLabel}</div>
  <div class="shipto">${shipToBody}</div>
  <table><thead><tr><th>Item</th><th class="q">Qty</th></tr></thead><tbody>${rows}</tbody></table>
  ${order.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(order.notes)}</div>` : ''}
  <div class="foot">
    ${hasPeptide ? '<p class="roud">For Research Use Only — Not for Human Consumption</p>' : ''}
    <p class="thx">Thank you for your order and for choosing Pryme Labs.</p>
    <p class="bd">We truly appreciate your support and trust in us. Your order was packed with care, and we hope you have a great experience with our store.</p>
    <p class="bd">For any questions or support, please contact us anytime.</p>
    <p class="ct">Support Email: <a href="mailto:support@prymelabs.net">support@prymelabs.net</a></p>
    <p class="ct">Text Support Line: (346) 550-9100</p>
    <p class="sig">— Pryme Labs —</p>
  </div>
  <script>window.onload=function(){window.print()}</script>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html); w.document.close(); w.focus()
  }

  // Keep any previously-generated label/tracking URLs when re-saving tracking manually
  const labelExtras = { label_url: order.tracking?.label_url || null, tracking_url: order.tracking?.tracking_url || null, shipment_id: order.tracking?.shipment_id || null }

  const ship = () => {
    if (!tracking.number.trim()) { setErr('Enter a tracking number first'); return }
    update('shipped', { tracking: { carrier: tracking.carrier, number: tracking.number.trim(), ...labelExtras } })
  }

  const saveTracking = () => {
    if (!tracking.number.trim()) { setErr('Enter a tracking number first'); return }
    update(order.status, { tracking: { carrier: tracking.carrier, number: tracking.number.trim(), ...labelExtras } }, '✓ Tracking updated')
  }

  // Internal notes are admin-only and never printed on the packing slip, so they
  // save through edit-order (no status change, no customer notification).
  const saveInternalNotes = async () => {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/edit-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ order_id: order.id, internal_notes: internalNotes }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Failed to save'); return }
      showToast('✓ Internal notes saved', 'success')
      onUpdate()
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  const openReship = () => { setReshipMode(true); setShowLabelPanel(true); setOpen(true) }

  const dispatchUber = async () => {
    if (!confirm('Dispatch an Uber Direct driver to pick up this order?')) return
    setUberDispatching(true); setErr('')
    try {
      const res = await fetch('/api/admin/uber-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ order_id: order.id }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Uber dispatch failed'); return }
      setUberResult(data)
      showToast('🚗 Driver dispatched! Customer notified.', 'success')
      onUpdate()
    } catch { setErr('Network error') }
    finally { setUberDispatching(false) }
  }

  const displayTotal = order.order_total > 0 ? order.order_total : order.subtotal
  const willCall = isWillCallOrder(order) // pickup order — no shipping / tracking

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left p-4 hover:bg-zinc-800/40 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
            {selectable && (
              <input type="checkbox" checked={!!selected}
                onClick={e => e.stopPropagation()}
                onChange={() => onToggle?.(order.id)}
                className="w-4 h-4 shrink-0 accent-blue-600 cursor-pointer" />
            )}
            <span className="text-white font-bold text-sm shrink-0">{order.order_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold shrink-0 ${STATUS_COLORS[order.status] || STATUS_COLORS.pending}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
            {isWillCallOrder(order) && (
              <span className="text-xs px-2 py-0.5 rounded-full border font-bold shrink-0 bg-amber-500/15 text-amber-400 border-amber-500/30" title="In-store pickup — Will Call">🏷️ Will Call</span>
            )}
            {order.local_delivery && (
              <span className="text-xs px-2 py-0.5 rounded-full border font-bold shrink-0 bg-green-500/15 text-green-400 border-green-500/30">🚗 Local</span>
            )}
            {order.status === 'pending' && order.payment_claimed_at && (
              <span className="text-xs px-2 py-0.5 rounded-full border font-bold shrink-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30" title="Customer says they've sent payment">💸 Paid?</span>
            )}
            {['shipped', 'completed'].includes(order.status) && order.tracking_status && (
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold shrink-0 hidden sm:inline ${TRACK_COLORS[order.tracking_status] || TRACK_COLORS.unknown}`}>
                {TRACK_LABELS[order.tracking_status] || order.tracking_status}
              </span>
            )}
            <span className="text-zinc-400 text-sm truncate max-w-[120px] sm:max-w-none">{order.customer_name}</span>
            <span className="text-zinc-600 text-xs hidden sm:inline truncate">{order.customer_email}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-amber-400 font-black text-sm">${Number(displayTotal).toFixed(2)}</span>
            <span className="text-zinc-500 text-xs hidden md:block">{formatDate(order.created_at)}</span>
            {order.tracking?.label_url && (
              <button
                onClick={(e) => { e.stopPropagation(); printLabelUrl(order.tracking.label_url) }}
                title="Print shipping label"
                className="p-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </button>
            )}
            <button onClick={trashOrder} disabled={busy} title="Move to trash"
              className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <svg className={`w-4 h-4 text-zinc-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-4 space-y-4">
          <div>
            <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Items</div>
            <div className="space-y-1">
              {(order.items || []).map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-white">{item.name}{item.size ? <span className="text-zinc-500"> ({item.size})</span> : ''} ×{item.qty}</span>
                  <span className="text-zinc-400">${(item.price * item.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">
              {isWillCallOrder(order) ? 'Pickup · Will Call' : 'Ship To'}
            </div>
            <div className="text-white text-sm">
              <div className="font-semibold">{order.shipping?.name || order.customer_name}</div>
              {order.customer_email && <div className="text-zinc-400">{order.customer_email}</div>}
              {isWillCallOrder(order) ? (
                <div className="text-amber-400">🏷️ Will Call — In-Store Pickup</div>
              ) : (
                <>
                  <div>{order.shipping?.address}{order.shipping?.address2 ? `, ${order.shipping.address2}` : ''}</div>
                  <div>{order.shipping?.city}, {order.shipping?.state} {order.shipping?.zip}</div>
                </>
              )}
              {order.shipping?.phone && <div className="text-zinc-400">{order.shipping.phone}</div>}
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Payment</div>
              <div className="text-white text-sm capitalize">{order.payment_method}</div>
            </div>
            {order.promo_code && (
              <div>
                <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Promo</div>
                <div className="text-green-400 text-sm font-semibold">{order.promo_code} (−${Number(order.discount_amount || 0).toFixed(2)})</div>
              </div>
            )}
            {order.shipping_rate_name && (
              <div>
                <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Shipping</div>
                <div className="text-white text-sm">{order.shipping_rate_name} (+${Number(order.shipping_cost || 0).toFixed(2)})</div>
              </div>
            )}
            {order.tax_amount > 0 && (
              <div>
                <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Tax</div>
                <div className="text-white text-sm">{((order.tax_rate || 0) * 100).toFixed(1)}% (+${Number(order.tax_amount).toFixed(2)})</div>
              </div>
            )}
            {order.tracking?.number && (
              <div>
                <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Tracking</div>
                <div className="text-white text-sm">{order.tracking.carrier}: {order.tracking.number}</div>
              </div>
            )}
          </div>
          {order.tracking?.number && <TrackingPanel order={order} onUpdate={onUpdate} />}
          {/* Reprint the shipping label generated earlier — always available once a label exists */}
          {order.tracking?.label_url && (
            <div className="bg-zinc-950 border border-emerald-500/25 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                Shipping Label
                <span className="text-zinc-500 font-normal text-xs">— already generated{order.tracking.carrier ? ` · ${order.tracking.carrier}` : ''}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => printLabelUrl(order.tracking.label_url)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                  Print Label
                </button>
                <a href={order.tracking.label_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  Download
                </a>
              </div>
            </div>
          )}
          {showLabelPanel && (reshipMode || !['cancelled','refunded'].includes(order.status)) && (
            <EasyPostPanel order={order} onRefresh={onUpdate} reship={reshipMode}
              onClose={() => { setShowLabelPanel(false); setReshipMode(false) }} />
          )}
          {/* Uber Direct dispatch result */}
          {order.local_delivery && (() => {
            const t = order.tracking || {}
            const isDispatched = t.carrier === 'Uber Direct' || t.uber_delivery_id
            const uberStatus = t.uber_status || ''
            const trackingUrl = t.uber_tracking_url || uberResult?.tracking_url
            const UBER_STATUS_LABELS = {
              pending: 'Finding Driver…', assigned: 'Driver Assigned', en_route_to_pickup: 'En Route to Pickup',
              arrived_at_pickup: 'Arrived at Pickup', en_route_to_dropoff: 'Out for Delivery',
              arrived_at_dropoff: 'Arrived at Dropoff', delivered: 'Delivered ✅', cancelled: 'Cancelled ⚠️', returned: 'Returned ⚠️',
            }
            if (!isDispatched && !uberResult) return null
            return (
              <div className="rounded-xl border border-green-700/40 bg-green-950/30 p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🚗</span>
                  <div>
                    <div className="text-green-300 font-bold text-sm">Uber Direct — Driver Dispatched</div>
                    {uberStatus && <div className="text-green-400/80 text-xs">{UBER_STATUS_LABELS[uberStatus] || uberStatus}</div>}
                  </div>
                </div>
                {(uberResult?.courier || t.uber_courier) && (() => {
                  const c = uberResult?.courier || t.uber_courier
                  return (
                    <div className="text-sm text-zinc-300">
                      <span className="text-zinc-500">Driver: </span>{c.name || 'Assigned'}
                      {c.phone && <> · <a href={`tel:${c.phone}`} className="text-blue-400 underline">{c.phone}</a></>}
                    </div>
                  )
                })()}
                {uberResult?.pickup_eta && <div className="text-xs text-zinc-400">Pickup ETA: {new Date(uberResult.pickup_eta * 1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>}
                {uberResult?.dropoff_eta && <div className="text-xs text-zinc-400">Dropoff ETA: {new Date(uberResult.dropoff_eta * 1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>}
                {trackingUrl && (
                  <a href={trackingUrl} target="_blank" rel="noreferrer"
                    className="inline-block text-xs font-bold px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition-colors">
                    Track Driver →
                  </a>
                )}
              </div>
            )
          })()}
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">
              Packing Slip Notes <span className="text-zinc-600 normal-case font-normal">· printed on the slip</span>
            </label>
            <input type="text" placeholder="Note that prints on the packing slip…" value={notes} onChange={e => setNotes(e.target.value)} className={inp + ' w-full'} />
          </div>
          <div>
            <label className="block text-amber-500/80 text-xs font-semibold uppercase tracking-wider mb-1.5">
              🔒 Internal Notes <span className="text-zinc-600 normal-case font-normal">· admin only, never printed</span>
            </label>
            <div className="flex gap-2">
              <input type="text" placeholder="Private notes for staff…" value={internalNotes} onChange={e => setInternalNotes(e.target.value)} className={inp + ' flex-1'} />
              {internalNotes !== (order.internal_notes || '') && (
                <button onClick={saveInternalNotes} disabled={busy}
                  className="px-4 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 disabled:opacity-40 text-amber-300 text-sm font-bold rounded-xl transition-colors shrink-0">
                  Save
                </button>
              )}
            </div>
          </div>
          {!['cancelled','refunded','completed'].includes(order.status) && !willCall && (
            <div>
              <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">
                Tracking Number
              </div>
              <div className="flex gap-2 flex-wrap">
                <select value={tracking.carrier} onChange={e => setTracking(t => ({ ...t, carrier: e.target.value }))} className={inp}>
                  {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="text" placeholder="Tracking number" value={tracking.number} onChange={e => setTracking(t => ({ ...t, number: e.target.value }))} className={inp + ' flex-1 min-w-40'} />
              </div>
            </div>
          )}
          {willCall && !['cancelled','refunded','completed'].includes(order.status) && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-2.5">
                <span className="text-base">🏷️</span>
                <span className="text-amber-400/90 text-xs font-semibold">Will Call — in-store pickup. No shipping label or tracking needed.</span>
              </div>
              {['paid','fulfilled'].includes(order.status) && (
                <div>
                  <label className="block text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
                    Set Pickup Date (Optional)
                  </label>
                  <input type="datetime-local" value={readyAfterDate} onChange={e => setReadyAfterDate(e.target.value)} className={inp + ' w-full'} />
                  <p className="text-zinc-500 text-xs mt-1">When will this order be ready for pickup?</p>
                </div>
              )}
            </div>
          )}
          {err && <div className="text-red-400 text-sm">{err}</div>}
          {/* Order History: Notifications & Events */}
          <details className="group">
            <summary className="cursor-pointer text-zinc-400 hover:text-zinc-300 text-xs font-semibold uppercase tracking-wider py-2 px-3 rounded-lg hover:bg-zinc-800/30 transition-colors">
              📋 Order History (Notifications & Events)
            </summary>
            <div className="mt-3 space-y-3 text-xs">
              <div className="bg-zinc-950/50 rounded-lg p-3 space-y-2">
                <div className="text-zinc-400 font-semibold">Notifications Sent</div>
                {order.order_notifications && order.order_notifications.length > 0 ? (
                  <div className="space-y-1">
                    {order.order_notifications.slice().reverse().map((n, i) => (
                      <div key={i} className="flex justify-between text-zinc-500">
                        <span>{n.notification_type.replace(/_/g, ' ')}</span>
                        <span className={n.status === 'sent' ? 'text-green-400' : 'text-red-400'}>{n.status}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-zinc-600">No notifications logged yet.</div>
                )}
              </div>
              <div className="bg-zinc-950/50 rounded-lg p-3 space-y-2">
                <div className="text-zinc-400 font-semibold">Order Events</div>
                {order.order_events && order.order_events.length > 0 ? (
                  <div className="space-y-1">
                    {order.order_events.slice().reverse().map((e, i) => (
                      <div key={i} className="flex justify-between text-zinc-500">
                        <span>{e.event_type.replace(/_/g, ' ')}</span>
                        <span className="text-zinc-600 text-xs">{new Date(e.created_at * 1000).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-zinc-600">No events logged yet.</div>
                )}
              </div>
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            {order.status === 'pending' && (
              <button onClick={() => update('paid')} disabled={busy} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">✓ Verify Payment</button>
            )}
            {order.status === 'pending' && order.customer_email && (
              <button onClick={sendReminder} disabled={busy} title="Email (and text) the customer a friendly reminder to complete payment"
                className="px-4 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 active:bg-amber-500/30 border border-amber-500/40 disabled:opacity-40 text-amber-300 text-sm font-bold rounded-xl transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                Send Payment Reminder
              </button>
            )}
            {order.status === 'paid' && (
              <button onClick={() => {
                const data = {}
                if (willCall && readyAfterDate) {
                  data.ready_after = Math.floor(new Date(readyAfterDate).getTime() / 1000)
                }
                update('fulfilled', data, willCall ? '🏷️ Ready for pickup — customer notified' : undefined)
              }} disabled={busy} className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">{willCall ? '🏷️ Mark Ready for Pickup' : '✓ Mark Fulfilled'}</button>
            )}
            {/* Will Call: mark picked up (completes the order) */}
            {willCall && ['paid','fulfilled'].includes(order.status) && (
              <button onClick={() => update('completed', {}, '✅ Picked up — order completed')} disabled={busy} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">🏷️ Mark Picked Up</button>
            )}
            {['paid','fulfilled'].includes(order.status) && !order.local_delivery && !willCall && (
              <button onClick={ship} disabled={busy} className="px-4 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">📦 Mark Shipped</button>
            )}
            {['paid','fulfilled'].includes(order.status) && order.local_delivery && (
              <button onClick={dispatchUber} disabled={busy || uberDispatching}
                className="px-4 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2">
                {uberDispatching ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg> Dispatching…</> : '🚗 Dispatch Driver'}
              </button>
            )}
            {order.status === 'shipped' && (
              <button onClick={() => update('completed')} disabled={busy} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">✅ Mark Completed</button>
            )}
            {!['cancelled','refunded','completed'].includes(order.status) && tracking.number.trim() && !willCall && (
              <button onClick={saveTracking} disabled={busy} className="px-4 py-2.5 bg-sky-700 hover:bg-sky-600 active:bg-sky-500 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">💾 Save Tracking</button>
            )}
            {order.status === 'completed' && (
              <button onClick={() => update('refunded')} disabled={busy} className="px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-500 disabled:opacity-40 text-zinc-300 text-sm font-bold rounded-xl transition-colors">↩ Issue Refund</button>
            )}
            {order.tracking?.label_url && (
              <button onClick={printLabel} disabled={busy} title="Print the shipping label that was already generated for this order"
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                Print Label
              </button>
            )}
            <button onClick={printPackingSlip} disabled={busy}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold rounded-xl transition-colors">
              🧾 Packing Slip
            </button>
            {!['cancelled','refunded','completed'].includes(order.status) && !order.local_delivery && !willCall && (
              <button onClick={() => { if (showLabelPanel && !reshipMode) { setShowLabelPanel(false) } else { setReshipMode(false); setShowLabelPanel(true) } }} disabled={busy}
                className={`px-4 py-2.5 text-sm font-bold rounded-xl transition-colors ${showLabelPanel && !reshipMode ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`}>
                🏷 {showLabelPanel && !reshipMode ? 'Hide Label' : 'Get Label'}
              </button>
            )}
            {['shipped','completed','cancelled','refunded'].includes(order.status) && !order.local_delivery && !willCall && (
              <button onClick={() => { if (showLabelPanel && reshipMode) { setShowLabelPanel(false); setReshipMode(false) } else { openReship() } }} disabled={busy}
                title="Generate a new label & tracking number on this order — e.g. a carrier misdelivery"
                className={`px-4 py-2.5 text-sm font-bold rounded-xl transition-colors ${showLabelPanel && reshipMode ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300'}`}>
                🔁 {showLabelPanel && reshipMode ? 'Hide Reship' : 'Reship'}
              </button>
            )}
            {!['cancelled','refunded','completed'].includes(order.status) && (
              <button onClick={() => update('cancelled')} disabled={busy} className="px-4 py-2.5 bg-red-900/50 hover:bg-red-900 active:bg-red-900 disabled:opacity-40 text-red-400 text-sm font-bold rounded-xl transition-colors">Cancel Order</button>
            )}
            {notes !== (order.notes || '') && (
              <button onClick={() => update(order.status, {}, '✓ Notes saved')} disabled={busy} className="px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-500 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">Save Notes</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ArchiveSection({ title, orders, onRefresh, defaultOpen = true, accentColor = 'text-zinc-400', emptyLabel, headerSlot, selectable, selected, onToggle }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex items-center px-4 py-3 hover:bg-zinc-800/20 transition-colors gap-2">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 flex-1 text-left min-h-[28px]">
          <span className={`text-sm font-bold ${accentColor}`}>{title}</span>
          <span className="bg-zinc-800 text-zinc-500 text-xs font-semibold rounded-full px-2 py-0.5">{orders.length}</span>
        </button>
        {headerSlot && (
          <div className="shrink-0" onClick={e => e.stopPropagation()}>
            {headerSlot}
          </div>
        )}
        <button onClick={() => setOpen(o => !o)} className="shrink-0 p-1 -mr-1">
          <svg className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="border-t border-zinc-800 p-3 space-y-2">
          {orders.length === 0 ? (
            <div className="text-center py-6 text-zinc-600 text-sm">{emptyLabel || 'No orders here.'}</div>
          ) : (
            orders.map(order => <OrderRow key={order.id} order={order} onUpdate={onRefresh} onDelete={onRefresh}
              selectable={selectable} selected={selected?.has(order.id)} onToggle={onToggle} />)
          )}
        </div>
      )}
    </div>
  )
}

function RefreshAllTracking({ onRefresh }) {
  const [busy, setBusy] = useState(false)
  const showToast = useToast()
  const adminToken = sessionStorage.getItem('pl_admin_token')

  const run = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/refresh-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ force: true }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Refresh failed', 'error'); return }
      const live = (data.results || []).filter(r => r.live).length
      const delivered = (data.results || []).filter(r => r.status === 'delivered').length
      showToast(`✓ Checked ${live} shipment${live === 1 ? '' : 's'}${delivered ? ` — ${delivered} delivered` : ''}`)
      onRefresh()
    } catch { showToast('Network error', 'error') }
    finally { setBusy(false) }
  }

  return (
    <button onClick={run} disabled={busy}
      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs font-bold rounded-lg transition-colors">
      {busy ? 'Checking carriers…' : '↻ Refresh Tracking'}
    </button>
  )
}

function RecoverLabels({ onRefresh }) {
  const [busy, setBusy] = useState(false)
  const showToast = useToast()
  const adminToken = sessionStorage.getItem('pl_admin_token')

  const run = async () => {
    if (!confirm('Look up shipping labels from EasyPost for older orders that don\'t have a Print Label button yet? This matches each order\'s tracking number to its EasyPost shipment and saves the label PDF link.')) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/backfill-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Label recovery failed', 'error'); return }
      if (data.scanned === 0) showToast('All orders already have their labels — nothing to recover.', 'info')
      else showToast(`✓ Recovered ${data.updated} label${data.updated === 1 ? '' : 's'}${data.unmatched ? ` · ${data.unmatched} not found in EasyPost` : ''}`)
      onRefresh()
    } catch { showToast('Network error', 'error') }
    finally { setBusy(false) }
  }

  return (
    <button onClick={run} disabled={busy}
      className="px-3 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 disabled:opacity-40 text-emerald-300 text-xs font-bold rounded-lg transition-colors">
      {busy ? 'Recovering labels…' : '🏷 Recover Labels'}
    </button>
  )
}

// Schedule a free USPS package pickup at the ship-from address via EasyPost.
function PickupScheduler() {
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [last, setLast] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
  const [form, setForm] = useState({ date: tomorrow, start_time: '10:00', end_time: '16:00', package_count: '', instructions: '' })

  useEffect(() => {
    fetch('/api/admin/schedule-pickup', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then(r => r.json()).then(d => setLast(d.pickup || null)).catch(() => {})
  }, [])

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }))

  const schedule = async () => {
    if (!form.date || !form.start_time || !form.end_time) { setErr('Pick a date and a time window'); return }
    if (form.start_time >= form.end_time) { setErr('The "ready by" time must be before the "available until" time'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/schedule-pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Could not schedule the pickup'); return }
      setLast(data)
      showToast(`📬 USPS pickup scheduled — confirmation ${data.confirmation || 'received'}`)
      setOpen(false)
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  const fmtWindow = (p) => {
    if (!p?.min_datetime) return ''
    return `${p.min_datetime.slice(0, 10)}, ${p.min_datetime.slice(11, 16)}–${(p.max_datetime || '').slice(11, 16)}`
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-lg">📅</span>
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-bold">USPS Pickup</div>
          {last
            ? <div className="text-zinc-500 text-xs truncate">Scheduled {fmtWindow(last)} · confirmation <span className="text-emerald-400 font-semibold">{last.confirmation || '—'}</span> · free</div>
            : <div className="text-zinc-500 text-xs">Have USPS collect your packages — free, no drop-off needed</div>}
        </div>
        <button onClick={() => { setOpen(o => !o); setErr('') }}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors shrink-0 ${open ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
          {open ? 'Close' : last ? 'Reschedule' : 'Schedule Pickup'}
        </button>
      </div>
      {open && (
        <div className="border-t border-zinc-800 p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Date</label>
              <input type="date" value={form.date} min={tomorrow} onChange={set('date')} className={inpSm + ' w-full'} />
            </div>
            <div>
              <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Ready by</label>
              <input type="time" value={form.start_time} onChange={set('start_time')} className={inpSm + ' w-full'} />
            </div>
            <div>
              <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Available until</label>
              <input type="time" value={form.end_time} onChange={set('end_time')} className={inpSm + ' w-full'} />
            </div>
            <div>
              <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1"># Packages</label>
              <input type="number" min="1" placeholder="e.g. 5" value={form.package_count} onChange={set('package_count')} className={inpSm + ' w-full'} />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Where / instructions</label>
              <input type="text" placeholder="e.g. Front porch, ring bell" value={form.instructions} onChange={set('instructions')} className={inpSm + ' w-full'} />
            </div>
          </div>
          {err && <div className="text-red-400 text-xs whitespace-pre-line">{err}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={schedule} disabled={busy} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">
              {busy ? 'Scheduling…' : '📬 Schedule Free USPS Pickup'}
            </button>
            <span className="text-zinc-600 text-xs">Next business day · $0.00</span>
          </div>
          <p className="text-zinc-700 text-xs">Attaches to your latest USPS label; USPS collects all outgoing packages at your ship-from address.</p>
        </div>
      )}
    </div>
  )
}

function OrdersTab({ data, loading, onRefresh, onSwitchTab }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()
  const orders = data?.orders || []
  const stats = data?.stats || {}

  const toggleSelect = (id) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const bulkUpdate = async (status) => {
    const ids = [...selected]
    if (!ids.length) return
    if (!confirm(`Mark ${ids.length} selected order(s) as ${status}? This sends the customer the matching notification.`)) return
    setBulkBusy(true)
    try {
      await Promise.all(ids.map(id => fetch('/api/admin/update-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ order_id: id, status }),
      })))
      showToast(`✓ ${ids.length} order(s) marked ${status}`)
      setSelected(new Set())
      onRefresh()
    } catch { showToast('Bulk update failed', 'error') }
    finally { setBulkBusy(false) }
  }

  const q = search.toLowerCase()
  const match = o => !search || o.order_number?.toLowerCase().includes(q) || o.customer_name?.toLowerCase().includes(q) || o.customer_email?.toLowerCase().includes(q)

  const pending   = orders.filter(o => ['pending','paid'].includes(o.status) && match(o))
  const fulfilled = orders.filter(o => o.status === 'fulfilled' && match(o))
  const shipped   = orders.filter(o => o.status === 'shipped' && match(o))

  const trackCounts = shipped.reduce((acc, o) => {
    if (!o.tracking?.number) return acc
    const s = o.tracking_status || 'unknown'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pending" value={(stats.pending || 0) + (stats.paid || 0)} color="text-yellow-400" />
        <StatCard label="Fulfilled" value={stats.fulfilled || 0} color="text-sky-400" />
        <StatCard label="Shipped" value={stats.shipped || 0} color="text-green-400" />
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-amber-400">Revenue (30d)</div>
          <div className="text-3xl font-black text-white">${(stats.monthly_revenue || 0).toFixed(2)}</div>
          <div className="text-zinc-600 text-xs mt-1">All time: ${(stats.total_revenue || 0).toFixed(2)}</div>
        </div>
      </div>

      {(stats.pending || 0) > 0 && (
        <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <span className="text-lg">⚡</span>
          <span className="text-amber-300 text-sm font-semibold">
            {stats.pending} order{stats.pending === 1 ? '' : 's'} awaiting payment verification
          </span>
          <span className="text-amber-400/60 text-xs hidden sm:inline">— verify payment, then mark Paid</span>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input type="text" placeholder="Search orders, customers..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm" />
        <RecoverLabels onRefresh={onRefresh} />
      </div>

      <PickupScheduler />

      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex items-center gap-2 flex-wrap bg-blue-600/15 border border-blue-500/40 rounded-xl px-4 py-2.5 backdrop-blur">
          <span className="text-blue-300 text-sm font-bold">{selected.size} selected</span>
          <div className="flex gap-2 flex-wrap ml-auto">
            <button onClick={() => bulkUpdate('paid')} disabled={bulkBusy} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg">✓ Mark Paid</button>
            <button onClick={() => bulkUpdate('fulfilled')} disabled={bulkBusy} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg">✓ Mark Fulfilled</button>
            <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-lg">Clear</button>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="text-center py-20 text-zinc-600">Loading orders...</div>
      ) : (
        <div className="space-y-3">
          {/* Stage 1 — Pending (includes payment-verified "paid" status) */}
          <ArchiveSection
            title="Pending"
            orders={pending}
            onRefresh={onRefresh}
            defaultOpen={pending.length > 0}
            accentColor="text-yellow-400"
            emptyLabel="No pending orders."
            selectable selected={selected} onToggle={toggleSelect} />

          {/* Stage 2 — Fulfilled */}
          <ArchiveSection
            title="Fulfilled"
            orders={fulfilled}
            onRefresh={onRefresh}
            defaultOpen={fulfilled.length > 0}
            accentColor="text-sky-400"
            emptyLabel="No fulfilled orders."
            selectable selected={selected} onToggle={toggleSelect} />

          {/* Stage 3 — Shipped (live carrier tracking) */}
          {Object.keys(trackCounts).length > 0 && (
            <div className="flex items-center gap-2 flex-wrap px-1 pt-1">
              <span className="text-zinc-600 text-xs font-semibold uppercase tracking-wider">In the mail:</span>
              {['exception', 'out_for_delivery', 'in_transit', 'label_created', 'delivered', 'unknown'].map(s => trackCounts[s] ? (
                <span key={s} className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${TRACK_COLORS[s]}`}>
                  {trackCounts[s]} {TRACK_LABELS[s]}
                </span>
              ) : null)}
            </div>
          )}
          <ArchiveSection
            title="Shipped"
            orders={shipped}
            onRefresh={onRefresh}
            defaultOpen={shipped.length > 0}
            accentColor="text-green-400"
            emptyLabel="No shipped orders."
            headerSlot={shipped.length > 0 ? <RefreshAllTracking onRefresh={onRefresh} /> : null} />

          {/* Completed + Cancelled have their own dedicated tabs */}
          <div className="text-center py-4 text-zinc-600 text-xs">
            View <button onClick={() => onSwitchTab?.('completed')} className="text-emerald-400 hover:text-emerald-300 font-semibold underline-offset-2">✅ Completed Orders</button>  ·  <button onClick={() => onSwitchTab?.('cancelled')} className="text-red-400 hover:text-red-300 font-semibold underline-offset-2">❌ Cancelled &amp; Refunded</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Inventory Tab ────────────────────────────────────────────────────────────

const EMPTY_PRODUCT = { code: '', name: '', size: '', tagline: '', description: '', description_es: '', price: '', compare_at_price: '', image_url: '', photos: [], category: 'Research Supplies', department: 'Peptides', collections: [], display_order: '', stock_qty: '', low_stock_threshold: '5', batch_number: '', weight_oz: '' }
const MAX_PHOTOS = 10

// Parse a product's photos into an array (photos array, photos_json string, or a
// single legacy image_url).
function parsePhotos(p) {
  if (Array.isArray(p?.photos)) return p.photos.filter(Boolean)
  if (typeof p?.photos_json === 'string') { try { const a = JSON.parse(p.photos_json); if (Array.isArray(a)) return a.filter(Boolean) } catch {} }
  return p?.image_url ? [p.image_url] : []
}

function ProductForm({ initial, onSave, onCancel, existingProducts = [] }) {
  const [form, setForm] = useState(() => {
    const base = initial ? { ...initial, photos: parsePhotos(initial) } : { ...EMPTY_PRODUCT }
    // New product (no id): pre-fill the next display order from the inventory,
    // even when a department was pre-selected from the tab.
    if (!initial?.id) {
      const maxOrder = existingProducts.reduce((m, p) => Math.max(m, Number(p.display_order) || 0), 0)
      base.display_order = String(maxOrder + 1)
    }
    return base
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [imgDrag, setImgDrag] = useState(false)
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  // ── Auto-generate helpers ──────────────────────────────────────────────────
  const takenCodes = new Set(existingProducts.filter(p => p.id !== form.id).map(p => String(p.code || '').toLowerCase()))
  const generateSku = () => {
    const baseSlug = (form.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product'
    let code = baseSlug, n = 2
    while (takenCodes.has(code)) { code = `${baseSlug}-${n++}` }
    setForm(p => ({ ...p, code }))
  }
  const generateDisplayOrder = () => {
    const maxOrder = existingProducts.reduce((m, p) => Math.max(m, Number(p.display_order) || 0), 0)
    setForm(p => ({ ...p, display_order: String(maxOrder + 1) }))
  }
  const generateBatch = () => {
    const taken = new Set(existingProducts.map(p => String(p.batch_number || '').toUpperCase()).filter(Boolean))
    const prefix = ((form.name || form.category || 'PL').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'PL')
    const now = new Date()
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    // Next sequence for this prefix+month, then guarantee global uniqueness
    let seq = 1
    for (const b of taken) { const m = b.match(new RegExp(`^${prefix}-${ym}-(\\d+)$`)); if (m) seq = Math.max(seq, Number(m[1]) + 1) }
    let batch = `${prefix}-${ym}-${String(seq).padStart(3, '0')}`
    while (taken.has(batch.toUpperCase())) { seq++; batch = `${prefix}-${ym}-${String(seq).padStart(3, '0')}` }
    setForm(p => ({ ...p, batch_number: batch }))
  }

  // Center-crop to a 1:1 square and downscale, then add to the photo gallery.
  const addPhotoFile = (file) => {
    if (!file || !file.type.startsWith('image/')) { setErr('Please select an image file'); return }
    if ((form.photos || []).length >= MAX_PHOTOS) { setErr(`Up to ${MAX_PHOTOS} photos`); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const SIZE = 800
        const side = Math.min(img.width, img.height)
        const sx = Math.round((img.width - side) / 2), sy = Math.round((img.height - side) / 2)
        const canvas = document.createElement('canvas')
        canvas.width = SIZE; canvas.height = SIZE
        canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        setForm(p => ({ ...p, photos: [...(p.photos || []), dataUrl].slice(0, MAX_PHOTOS) }))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }
  const addPhotoFiles = (files) => { [...(files || [])].forEach(addPhotoFile) }
  const removePhoto = (i) => setForm(p => ({ ...p, photos: (p.photos || []).filter((_, idx) => idx !== i) }))
  const movePhoto = (i, dir) => setForm(p => {
    const arr = [...(p.photos || [])]; const j = i + dir
    if (j < 0 || j >= arr.length) return p
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    return { ...p, photos: arr }
  })

  const save = async () => {
    if (!form.name || !form.price) { setErr('Name and price are required'); return }
    setBusy(true); setErr('')
    try {
      const method = form.id ? 'PUT' : 'POST'
      const res = await fetch('/api/admin/products', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ ...form, price: Number(form.price) }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Save failed'); return }
      showToast(form.id ? '✓ Product updated' : '✓ Product created')
      onSave()
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-white font-bold">{form.id ? 'Edit Product' : 'Add New Product'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Product Name *</label>
          <input type="text" placeholder="BPC-157" value={form.name} onChange={set('name')} className={inp + ' w-full'} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider">SKU / Code</label>
            <button type="button" onClick={generateSku} disabled={!form.name}
              className="text-xs px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/40 text-blue-400 rounded-lg transition-colors disabled:opacity-40 font-semibold">
              ⚙ Generate
            </button>
          </div>
          <input type="text" placeholder="bpc-157" value={form.code} onChange={set('code')} className={inp + ' w-full'} />
          {form.code && takenCodes.has(String(form.code).toLowerCase()) && (
            <p className="text-amber-400 text-xs mt-1">⚠ This SKU is already in use — click Generate for a unique one.</p>
          )}
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Size / Variant</label>
          <input type="text" placeholder="5mg" value={form.size} onChange={set('size')} className={inp + ' w-full'} />
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Price * ($)</label>
          <input type="number" step="0.01" placeholder="49.99" value={form.price} onChange={set('price')} className={inp + ' w-full'} />
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Was Price ($)</label>
          <input type="number" step="0.01" placeholder="Leave blank if no sale" value={form.compare_at_price || ''} onChange={set('compare_at_price')} className={inp + ' w-full'} />
          <p className="text-zinc-600 text-xs mt-1">Shows as red strikethrough on storefront</p>
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Department <span className="text-blue-400 normal-case">· home-page tab</span></label>
          <select value={form.department || 'Peptides'}
            onChange={e => {
              const dept = e.target.value
              const cats = categoriesFor(dept)
              setForm(p => ({ ...p, department: dept, category: cats.includes(p.category) ? p.category : cats[0] }))
            }}
            className={inp + ' w-full cursor-pointer'}>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Category <span className="text-zinc-600 normal-case">· {form.department || 'Peptides'}</span></label>
          <select value={categoriesFor(form.department).includes(form.category) ? form.category : ''} onChange={set('category')} className={inp + ' w-full cursor-pointer'}>
            {!categoriesFor(form.department).includes(form.category) && <option value="" disabled>Select a category…</option>}
            {categoriesFor(form.department).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {taggableCollections(form.department).length > 0 && (
          <div className="sm:col-span-2">
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Collections <span className="text-zinc-600 normal-case">· menu sub-categories (pick any that apply)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {taggableCollections(form.department).map(c => {
                const active = productCollections(form).includes(c)
                return (
                  <button key={c} type="button"
                    onClick={() => setForm(p => {
                      const cur = productCollections(p)
                      const next = cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c]
                      return { ...p, collections: next }
                    })}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600'}`}>
                    {c}
                  </button>
                )
              })}
            </div>
            <p className="text-zinc-600 text-xs mt-1.5">A product can be in several collections. “Shop All” and “New Arrivals” fill automatically.</p>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider">Display Order</label>
            <button type="button" onClick={generateDisplayOrder}
              className="text-xs px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/40 text-blue-400 rounded-lg transition-colors font-semibold">
              ⚙ Auto
            </button>
          </div>
          <input type="number" placeholder="999" value={form.display_order} onChange={set('display_order')} className={inp + ' w-full'} />
          <p className="text-zinc-600 text-xs mt-1">Auto = next after the current inventory</p>
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Stock Quantity</label>
          <input type="number" min="0" placeholder="0" value={form.stock_qty} onChange={set('stock_qty')} className={inp + ' w-full'} />
          <p className="text-zinc-600 text-xs mt-1">0 = unlimited / untracked</p>
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Low Stock Alert At</label>
          <input type="number" min="0" placeholder="5" value={form.low_stock_threshold} onChange={set('low_stock_threshold')} className={inp + ' w-full'} />
          <p className="text-zinc-600 text-xs mt-1">Alert email when qty drops to this</p>
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Shipping Weight (oz)</label>
          <input type="number" min="0" step="0.1" placeholder="0" value={form.weight_oz} onChange={set('weight_oz')} className={inp + ' w-full'} />
          <p className="text-zinc-600 text-xs mt-1">Auto-fills label weight from the order's items</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider">Batch / Lot Number</label>
            <button type="button" onClick={generateBatch} disabled={!form.name && !form.category}
              className="text-xs px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/40 text-blue-400 rounded-lg transition-colors disabled:opacity-40 font-semibold">
              ⚙ Generate
            </button>
          </div>
          <input type="text" placeholder="e.g. REC-202606-001" value={form.batch_number || ''} onChange={set('batch_number')} className={inp + ' w-full'} />
          <p className="text-zinc-600 text-xs mt-1">For internal tracking &amp; records · unique</p>
        </div>
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider">Tagline</label>
            <button type="button" onClick={async () => {
              setBusy(true)
              try {
                const res = await fetch('/api/admin/generate-description', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('pl_admin_token')}` },
                  body: JSON.stringify({ name: form.name, category: form.category, size: form.size, department: form.department, field: 'tagline' }),
                })
                const data = await res.json()
                if (data.tagline) setForm(p => ({ ...p, tagline: data.tagline }))
                else setErr(data.error || 'Generation failed')
              } catch { setErr('Network error') }
              finally { setBusy(false) }
            }} disabled={busy || !form.name}
              className="text-xs px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/40 text-blue-400 rounded-lg transition-colors disabled:opacity-40 font-semibold">
              ✨ Auto-fill
            </button>
          </div>
          <input type="text" placeholder="Short one-liner" value={form.tagline} onChange={set('tagline')} className={inp + ' w-full'} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">
            Product Photos <span className="text-zinc-600 normal-case">· up to {MAX_PHOTOS} · 1:1 square · first is the main image</span>
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {(form.photos || []).map((src, i) => (
              <div key={i} className="relative aspect-square bg-zinc-950 rounded-xl border border-zinc-700 overflow-hidden group">
                <img src={src} alt={`Photo ${i + 1}`} className="absolute inset-0 h-full w-full object-cover" />
                {i === 0 && <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Main</span>}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-1 py-1 bg-zinc-950/70 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => movePhoto(i, -1)} disabled={i === 0} className="text-zinc-300 hover:text-white disabled:opacity-30 text-xs px-1" title="Move left">◀</button>
                  <button type="button" onClick={() => removePhoto(i)} className="text-red-400 hover:text-red-300 text-xs px-1" title="Remove">✕</button>
                  <button type="button" onClick={() => movePhoto(i, 1)} disabled={i === (form.photos.length - 1)} className="text-zinc-300 hover:text-white disabled:opacity-30 text-xs px-1" title="Move right">▶</button>
                </div>
              </div>
            ))}
            {(form.photos || []).length < MAX_PHOTOS && (
              <div
                onDragOver={e => { e.preventDefault(); setImgDrag(true) }}
                onDragLeave={() => setImgDrag(false)}
                onDrop={e => { e.preventDefault(); setImgDrag(false); addPhotoFiles(e.dataTransfer.files) }}
                onClick={() => document.getElementById('prod-photos-upload').click()}
                className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${imgDrag ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-500'}`}>
                <input id="prod-photos-upload" type="file" accept="image/*" multiple className="hidden"
                  onChange={e => { addPhotoFiles(e.target.files); e.target.value = '' }} />
                <svg className="w-6 h-6 text-zinc-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-zinc-500 text-xs px-1">Add photos</span>
              </div>
            )}
          </div>
          <p className="text-zinc-600 text-xs mt-1.5">Auto-cropped to square &amp; compressed. Drag to the box or click. Reorder to set the main image.</p>
        </div>
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider">Description</label>
            <button type="button" onClick={async () => {
              setBusy(true)
              try {
                const res = await fetch('/api/admin/generate-description', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('pl_admin_token')}` },
                  body: JSON.stringify({ name: form.name, category: form.category, size: form.size, department: form.department }),
                })
                const data = await res.json()
                if (data.description) setForm(p => ({ ...p, description: data.description }))
                else setErr(data.error || 'Generation failed')
              } catch { setErr('Network error') }
              finally { setBusy(false) }
            }} disabled={busy || !form.name}
              className="text-xs px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/40 text-blue-400 rounded-lg transition-colors disabled:opacity-40 font-semibold">
              ✨ Auto-fill
            </button>
          </div>
          <textarea rows={3} placeholder="Product description..." value={form.description} onChange={set('description')} className={inp + ' w-full resize-none'} />
        </div>
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider">Spanish Description</label>
            <span className="text-zinc-600 text-xs">Auto-generated on save · editable</span>
          </div>
          <textarea rows={3} placeholder="Auto-translated when you save a product with a description..." value={form.description_es || ''} onChange={set('description_es')} className={inp + ' w-full resize-none'} />
        </div>
        <div className="sm:col-span-2 flex items-center gap-2 bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5">
          <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-zinc-400 text-xs">In Stock / Out of Stock is <span className="text-blue-400 font-semibold">automatically managed by quantity</span>. Set qty &gt; 0 to mark in stock. Set qty to 0 to mark out of stock.</span>
        </div>
      </div>
      {err && <div className="text-red-400 text-sm">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">
          {busy ? 'Saving...' : 'Save Product'}
        </button>
        <button onClick={onCancel} className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold rounded-xl transition-colors">Cancel</button>
      </div>
    </div>
  )
}

function InlineQty({ product, field, onSaved }) {
  const [val, setVal] = useState(String(product[field] ?? ''))
  const [busy, setBusy] = useState(false)
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const save = async () => {
    const numVal = Number(val) || 0
    if (numVal === Number(product[field] ?? 0)) return
    setBusy(true)
    try {
      await fetch('/api/admin/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ ...product, [field]: numVal }),
      })
      showToast('✓ Quantity updated')
      onSaved()
    } catch {} finally { setBusy(false) }
  }

  return (
    <input type="number" min="0" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      disabled={busy}
      className="w-16 text-center bg-zinc-800 border border-zinc-700 rounded-lg px-1.5 py-1 text-white text-xs focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
    />
  )
}

function Modal({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
        {children}
      </div>
    </div>
  )
}

function InventoryTab() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [heroImgs, setHeroImgs] = useState({}) // department → hero photo (for tab thumbnails)
  const [sortOrder, setSortOrder] = useState('az')
  const [translating, setTranslating] = useState(false)
  const [saleAmounts, setSaleAmounts] = useState({})       // department -> $ off (string; '' or 0 = off)
  const [savedSaleAmounts, setSavedSaleAmounts] = useState({})
  const [saleSaving, setSaleSaving] = useState(false)
  const [showWasPrice, setShowWasPrice] = useState(true)
  const [wasPriceSaving, setWasPriceSaving] = useState(false)
  const [wasAmountEnabled, setWasAmountEnabled] = useState(false)
  const [wasAmount, setWasAmount] = useState('')
  const [savedWasAmount, setSavedWasAmount] = useState('')
  const [wasAmountSaving, setWasAmountSaving] = useState(false)
  const [masterAdjust, setMasterAdjust] = useState('')
  const [savedMasterAdjust, setSavedMasterAdjust] = useState('')
  const [masterAdjustSaving, setMasterAdjustSaving] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [bulkAmount, setBulkAmount] = useState('')
  const [bulkSign, setBulkSign] = useState('-')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkSaleAmount, setBulkSaleAmount] = useState('')
  const [bulkSaleBusy, setBulkSaleBusy] = useState(false)
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/products', { headers: { Authorization: `Bearer ${adminToken}` } })
      const d = await res.json()
      setProducts(d.products || [])
    } catch {}
    finally { setLoading(false) }
  }, [adminToken])


  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then(r => r.json())
      .then(d => {
        // Per-department sale amounts (with legacy single-amount fallback)
        const s = d.settings || {}
        let sc = {}
        if (typeof s.sale_config === 'string' && s.sale_config.trim()) {
          try { const c = JSON.parse(s.sale_config); if (c && typeof c === 'object' && !Array.isArray(c)) sc = c } catch {}
        } else if (s.sale_mode_enabled === '1') {
          const a = Number(s.sale_discount_amount) || 0
          if (a > 0) {
            let depts = null
            if (typeof s.sale_departments === 'string' && s.sale_departments.trim()) { try { const x = JSON.parse(s.sale_departments); if (Array.isArray(x)) depts = x } catch {} }
            ;(depts || DEPARTMENTS).forEach(dp => { if (DEPARTMENTS.includes(dp)) sc[dp] = a })
          }
        }
        const amounts = {}
        for (const dp of DEPARTMENTS) amounts[dp] = Number(sc[dp]) > 0 ? String(sc[dp]) : ''
        setSaleAmounts(amounts)
        setSavedSaleAmounts(amounts)
        setShowWasPrice(d.settings?.show_was_price !== '0')
        const waOn = d.settings?.was_amount_enabled === '1'
        const waAmt = d.settings?.was_amount || ''
        setWasAmountEnabled(waOn)
        setWasAmount(waAmt)
        setSavedWasAmount(waAmt)
        const adj = d.settings?.master_price_adjust || ''
        setMasterAdjust(adj)
        setSavedMasterAdjust(adj)
        // Department hero photos (for the tab thumbnails)
        const hs = {}
        for (const [dep, key] of Object.entries(HERO_KEY)) if (d.settings?.[key]) hs[dep] = d.settings[key]
        setHeroImgs(hs)
      })
      .catch(() => {})
  }, [adminToken])

  // Persist the per-department sale amounts as a single sale_config object.
  const saveSale = async (amounts = saleAmounts) => {
    setSaleSaving(true)
    try {
      const config = {}
      for (const dp of DEPARTMENTS) { const a = Number(amounts[dp]) || 0; if (a > 0) config[dp] = a }
      const anyOn = Object.keys(config).length > 0
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: { sale_config: JSON.stringify(config), sale_mode_enabled: anyOn ? '1' : '0' } }),
      })
      setSavedSaleAmounts({ ...amounts })
      const summary = anyOn ? Object.entries(config).map(([d, a]) => `${d} $${a}`).join(' · ') : 'off'
      showToast(anyOn ? `✓ Sale updated — ${summary}` : '✓ Sale turned off', 'success')
    } catch {
      showToast('Failed to save sale settings', 'error')
    } finally {
      setSaleSaving(false)
    }
  }
  // Turn a single department's sale off (amount → 0) and save immediately.
  const clearSaleDept = (dep) => {
    const next = { ...saleAmounts, [dep]: '' }
    setSaleAmounts(next)
    saveSale(next)
  }

  const saveShowWasPrice = async (show) => {
    setWasPriceSaving(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: { show_was_price: show ? '1' : '0' } }),
      })
      showToast(show ? '✓ Was Price shown on storefront' : '✓ Was Price hidden — SALE badge still displays')
    } catch {
      showToast('Failed to save setting', 'error')
    } finally {
      setWasPriceSaving(false)
    }
  }

  const saveWasAmount = async (enabled, amount) => {
    setWasAmountSaving(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: { was_amount_enabled: enabled ? '1' : '0', was_amount: String(Number(amount) || 0) } }),
      })
      setSavedWasAmount(String(Number(amount) || 0))
      showToast(enabled ? `✓ Was Amount ON — showing $${Number(amount).toFixed(2)} above sale price` : '✓ Was Amount OFF')
    } catch {
      showToast('Failed to save setting', 'error')
    } finally {
      setWasAmountSaving(false)
    }
  }

  const applyBulkPrice = async () => {
    const delta = (bulkSign === '+' ? 1 : -1) * Number(bulkAmount)
    if (!bulkAmount || isNaN(delta)) return
    setBulkBusy(true)
    try {
      const toUpdate = products.filter(p => selected.has(p.id))
      await Promise.all(toUpdate.map(p =>
        fetch('/api/admin/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ ...p, price: Math.max(0.01, Number(p.price) + delta) }),
        })
      ))
      showToast(`✓ Price updated for ${toUpdate.length} product${toUpdate.length !== 1 ? 's' : ''}`)
      setSelected(new Set())
      setBulkAmount('')
      load()
    } catch {
      showToast('Bulk update failed', 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  // Set a manual per-product sale on every selected product: the current price
  // becomes the "was" (compare_at_price), the new price is that minus the amount.
  // Mirrors exactly what typing into the Price/Was fields on one product does —
  // just applied to many at once.
  const applyBulkSale = async () => {
    const amt = Number(bulkSaleAmount)
    if (!bulkSaleAmount || isNaN(amt) || amt <= 0) return
    setBulkSaleBusy(true)
    try {
      const toUpdate = products.filter(p => selected.has(p.id))
      await Promise.all(toUpdate.map(p => {
        const was = Math.max(0.01, Number(p.price))
        const price = Math.max(0.01, was - amt)
        return fetch('/api/admin/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ ...p, price, compare_at_price: was }),
        })
      }))
      showToast(`✓ Sale set for ${toUpdate.length} product${toUpdate.length !== 1 ? 's' : ''}`)
      setSelected(new Set())
      setBulkSaleAmount('')
      load()
    } catch {
      showToast('Bulk sale update failed', 'error')
    } finally {
      setBulkSaleBusy(false)
    }
  }

  // Remove the manual "was" price from every selected product (does not touch
  // the current price — a global department sale, if any, still applies as usual).
  const clearBulkSale = async () => {
    setBulkSaleBusy(true)
    try {
      const toUpdate = products.filter(p => selected.has(p.id))
      await Promise.all(toUpdate.map(p =>
        fetch('/api/admin/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ ...p, compare_at_price: null }),
        })
      ))
      showToast(`✓ Sale cleared for ${toUpdate.length} product${toUpdate.length !== 1 ? 's' : ''}`)
      setSelected(new Set())
      load()
    } catch {
      showToast('Clear sale failed', 'error')
    } finally {
      setBulkSaleBusy(false)
    }
  }

  const saveMasterAdjust = async (amount) => {
    setMasterAdjustSaving(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: { master_price_adjust: String(Number(amount) || 0) } }),
      })
      setSavedMasterAdjust(String(Number(amount) || 0))
      const n = Number(amount) || 0
      showToast(n === 0 ? '✓ Price adjust cleared' : n > 0 ? `✓ All prices +$${n.toFixed(2)}` : `✓ All prices −$${Math.abs(n).toFixed(2)}`)
    } catch {
      showToast('Failed to save setting', 'error')
    } finally {
      setMasterAdjustSaving(false)
    }
  }

  const deleteProduct = async (id) => {
    if (!confirm('Delete this product? This cannot be undone.')) return
    await fetch('/api/admin/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id }),
    })
    showToast('Product deleted', 'info')
    load()
  }

  const translateAll = async () => {
    if (!confirm('Translate all missing Spanish descriptions using AI? This may take a minute.')) return
    setTranslating(true)
    try {
      const res = await fetch('/api/admin/translate-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const d = await res.json()
      if (d.total === 0) {
        showToast('✓ All products already have Spanish descriptions', 'info')
      } else {
        showToast(`✓ Translated ${d.translated}/${d.total} products${d.failed > 0 ? ` (${d.failed} failed)` : ''}`)
      }
      load()
    } catch {
      showToast('Translation failed — try again', 'error')
    } finally {
      setTranslating(false)
    }
  }

  // Compute the effective (customer-facing) price for a product given current master controls
  // — same shared logic the storefront API uses, so this preview can't drift out of sync.
  const computeEffective = (p) => {
    const { price, compare_at_price } = computeDisplayPricing(p, {
      masterAdjust: Number(masterAdjust) || 0,
      saleConfig: saleAmounts,
      wasAmountEnabled,
      wasAmount: Number(wasAmount) || 0,
    })
    return { price, was: compare_at_price }
  }

  const anySaleActive = Object.values(saleAmounts).some(a => Number(a) > 0)
  const anyAdjustmentActive = anySaleActive || wasAmountEnabled || (Number(masterAdjust) || 0) !== 0

  // Treat a missing department as Peptides (matches the storefront default)
  const deptOf = (p) => DEPARTMENTS.includes(p.department) ? p.department : 'Peptides'
  const deptCount = (dep) => products.filter(p => deptOf(p) === dep).length

  const filtered = products.filter(p => {
    if (deptFilter !== 'all' && deptOf(p) !== deptFilter) return false
    if (catFilter !== 'all' && p.category !== catFilter) return false
    if (search) return p.name?.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase())
    return true
  })

  if (sortOrder === 'az') {
    filtered.sort((a, b) => a.name?.localeCompare(b.name))
  } else if (sortOrder === 'za') {
    filtered.sort((a, b) => b.name?.localeCompare(a.name))
  }

  // A case's live quantity is derived from its parent single's shared vial pool
  const byId = new Map(products.map(p => [p.id, p]))
  const caseInfo = (p) => {
    if (p.bundle_of_product_id == null) return null
    const parent = byId.get(p.bundle_of_product_id)
    const per = Math.max(1, Number(p.bundle_qty) || 1)
    const parentQty = parent ? Number(parent.stock_qty) || 0 : 0
    const avail = parentQty > 0 ? Math.floor(parentQty / per) : 0
    const inStock = parent ? (parentQty > 0 ? (avail > 0 && !!parent.in_stock) : !!parent.in_stock) : false
    return { avail, per, inStock, parent, parentQty }
  }

  // Export the current inventory view to a CSV file (works on phone + desktop)
  const downloadCsv = () => {
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const headers = ['Code', 'Product', 'Size', 'Category', 'In Stock', 'Quantity', 'Low Stock Alert', 'Price']
    const lines = filtered.map(p => {
      // Cases report available whole cases derived from the parent vial pool
      let qty = Number(p.stock_qty) || 0
      if (p.bundle_of_product_id != null) {
        const parent = byId.get(p.bundle_of_product_id)
        const per = Math.max(1, Number(p.bundle_qty) || 1)
        qty = parent && Number(parent.stock_qty) > 0 ? Math.floor(Number(parent.stock_qty) / per) : 0
      }
      return [
        p.code, p.name, p.size, p.category,
        p.in_stock ? 'Yes' : 'No', qty,
        p.low_stock_threshold ?? 0, Number(p.price || 0).toFixed(2),
      ].map(esc).join(',')
    })
    const csv = '﻿' + [headers.join(','), ...lines].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pryme-inventory-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
    showToast(`✓ Exported ${filtered.length} item${filtered.length !== 1 ? 's' : ''} to CSV`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-zinc-400 text-sm">{products.length} products · {products.filter(p => p.in_stock).length} in stock · {products.filter(p => p.description_es).length} translated</div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={downloadCsv}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-1.5"
            title="Download the current inventory list as a CSV file">
            ⬇ Download CSV
          </button>
          <button onClick={translateAll} disabled={translating}
            className="px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-1.5">
            {translating ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '🌐'}
            {translating ? 'Translating…' : 'Translate All ES'}
          </button>
          <button onClick={() => { setAdding(true); setEditing(null) }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors">
            + Add Product
          </button>
        </div>
      </div>

      <Modal open={adding || !!editing} onClose={() => { setAdding(false); setEditing(null) }}>
        <ProductForm
          initial={editing || (adding && deptFilter !== 'all' ? { ...EMPTY_PRODUCT, department: deptFilter, category: categoriesFor(deptFilter)[0] } : null)}
          existingProducts={products}
          onSave={() => { setAdding(false); setEditing(null); load() }}
          onCancel={() => { setAdding(false); setEditing(null) }}
        />
      </Modal>

      {/* ── Per-Department Sales ──────────────────────────────────────────── */}
      <div className={`border rounded-xl px-4 py-3 transition-colors bg-zinc-900 border-zinc-800`}>
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-2 h-2 rounded-full shrink-0 ${Object.values(saleAmounts).some(a => Number(a) > 0) ? 'bg-green-400 shadow-[0_0_6px_1px_rgba(74,222,128,0.6)]' : 'bg-zinc-600'}`} />
          <span className="text-white font-bold text-sm">Department Sales</span>
          <span className="text-zinc-500 text-xs">Set independent discounts per department</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DEPARTMENTS.map(dep => {
            const amt = saleAmounts[dep] || ''
            const saved = savedSaleAmounts[dep] || ''
            const changed = String(amt) !== String(saved)
            const isOn = Number(amt) > 0
            return (
              <div key={dep} className={`border rounded-lg p-3 transition-colors ${isOn ? 'bg-green-600/10 border-green-600/30' : 'bg-zinc-800/50 border-zinc-700'}`}>
                <div className="text-xs font-semibold text-zinc-400 mb-2">{dep}</div>
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-zinc-400 text-sm font-bold">$</span>
                  <input
                    type="number" min="0" step="0.01" placeholder="0"
                    value={amt}
                    onChange={e => setSaleAmounts({ ...saleAmounts, [dep]: e.target.value })}
                    disabled={saleSaving}
                    className={inpSm + ' flex-1 text-right'}
                  />
                  <span className="text-zinc-500 text-xs">off</span>
                </div>
                {changed && (
                  <button onClick={() => saveSale({ ...saleAmounts })} disabled={saleSaving}
                    className="w-full px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-bold rounded border border-zinc-600 transition-colors disabled:opacity-50">
                    {saleSaving ? '…' : 'Save'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Show Was Price ────────────────────────────────────────────────── */}
      <div className={`flex items-center gap-3 flex-wrap border rounded-xl px-4 py-3 transition-colors ${!showWasPrice ? 'bg-amber-500/5 border-amber-500/25' : 'bg-zinc-900 border-zinc-800'}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${showWasPrice ? 'bg-blue-400' : 'bg-zinc-600'}`} />
          <span className="text-white font-bold text-sm">Show Was Price</span>
          {showWasPrice
            ? <span className="text-blue-400 text-xs font-bold bg-blue-400/10 px-2 py-0.5 rounded-full">SHOWING</span>
            : <span className="text-zinc-500 text-xs font-bold bg-zinc-800 px-2 py-0.5 rounded-full">HIDDEN</span>}
        </div>
        <p className="text-zinc-500 text-xs w-full sm:w-auto sm:flex-1">
          {showWasPrice ? 'Strikethrough "was" price visible on storefront' : 'Prices show normally — SALE badge still displays'}
        </p>
        <button
          onClick={() => {
            const next = !showWasPrice
            setShowWasPrice(next)
            saveShowWasPrice(next)
          }}
          disabled={wasPriceSaving}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
            showWasPrice
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
              : 'bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 border border-blue-600/25'
          }`}>
          {wasPriceSaving ? '…' : showWasPrice ? 'Hide Was Price' : 'Show Was Price'}
        </button>
      </div>

      {/* ── Was Amount ────────────────────────────────────────────────────── */}
      <div className={`flex items-center gap-3 flex-wrap border rounded-xl px-4 py-3 transition-colors ${wasAmountEnabled ? 'bg-purple-500/5 border-purple-500/25' : 'bg-zinc-900 border-zinc-800'}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${wasAmountEnabled ? 'bg-purple-400 shadow-[0_0_6px_1px_rgba(192,132,252,0.6)]' : 'bg-zinc-600'}`} />
          <span className="text-white font-bold text-sm">Was Amount</span>
          {wasAmountEnabled
            ? <span className="text-purple-400 text-xs font-bold bg-purple-400/10 px-2 py-0.5 rounded-full">ACTIVE</span>
            : <span className="text-zinc-600 text-xs">off</span>}
        </div>
        <p className="text-zinc-500 text-xs hidden sm:block">Shows "was" price as sale price + this amount</p>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-sm font-bold">$</span>
          <input
            type="number" min="0" step="0.01" placeholder="0.00"
            value={wasAmount}
            onChange={e => setWasAmount(e.target.value)}
            className={inpSm + ' w-20 text-right'}
          />
          <span className="text-zinc-500 text-xs">above price</span>
        </div>
        <div className="flex gap-2">
          {wasAmountEnabled && String(wasAmount) !== String(savedWasAmount) && (
            <button onClick={() => saveWasAmount(true, wasAmount)} disabled={wasAmountSaving}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-lg border border-zinc-700 transition-colors disabled:opacity-50">
              Update
            </button>
          )}
          <button
            onClick={() => {
              if (!wasAmountEnabled && (!wasAmount || Number(wasAmount) <= 0)) {
                showToast('Enter a was amount before enabling', 'error'); return
              }
              const next = !wasAmountEnabled
              setWasAmountEnabled(next)
              saveWasAmount(next, wasAmount)
            }}
            disabled={wasAmountSaving}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
              wasAmountEnabled
                ? 'bg-red-600/15 hover:bg-red-600/25 text-red-400 border border-red-600/25'
                : 'bg-purple-600/15 hover:bg-purple-600/25 text-purple-400 border border-purple-600/25'
            }`}>
            {wasAmountSaving ? '…' : wasAmountEnabled ? 'Turn Off' : 'Enable'}
          </button>
        </div>
      </div>

      {/* ── Master Price Adjust ───────────────────────────────────────────── */}
      {(() => {
        const adjVal = Number(masterAdjust) || 0
        const savedVal = Number(savedMasterAdjust) || 0
        const isActive = savedVal !== 0
        const isDirty = String(masterAdjust) !== String(savedMasterAdjust)
        return (
          <div className={`flex items-center gap-3 flex-wrap border rounded-xl px-4 py-3 transition-colors ${isActive ? 'bg-cyan-500/5 border-cyan-500/25' : 'bg-zinc-900 border-zinc-800'}`}>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-cyan-400 shadow-[0_0_6px_1px_rgba(34,211,238,0.6)]' : 'bg-zinc-600'}`} />
              <span className="text-white font-bold text-sm">Price Adjust</span>
              {isActive && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${savedVal > 0 ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                  {savedVal > 0 ? `+$${savedVal.toFixed(2)}` : `−$${Math.abs(savedVal).toFixed(2)}`} all
                </span>
              )}
            </div>
            <p className="text-zinc-500 text-xs hidden sm:block">Global offset added to every product price (use negative to discount)</p>
            <div className="flex items-center gap-2">
              <input
                type="number" step="0.01" placeholder="0.00"
                value={masterAdjust}
                onChange={e => setMasterAdjust(e.target.value)}
                className={inpSm + ' w-24 text-right'}
              />
              <span className="text-zinc-500 text-xs">all prices</span>
            </div>
            <div className="flex gap-2">
              {isDirty && (
                <button onClick={() => saveMasterAdjust(masterAdjust)} disabled={masterAdjustSaving}
                  className="px-3 py-1.5 bg-cyan-600/15 hover:bg-cyan-600/25 text-cyan-400 border border-cyan-600/25 text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                  {masterAdjustSaving ? '…' : adjVal === 0 ? 'Clear' : 'Apply'}
                </button>
              )}
              {isActive && !isDirty && (
                <button onClick={() => { setMasterAdjust('0'); saveMasterAdjust(0) }} disabled={masterAdjustSaving}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                  {masterAdjustSaving ? '…' : 'Reset'}
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Department tabs — view / add products by department ──────────────── */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mb-1">
        {['all', ...DEPARTMENTS].map(dep => (
          <button key={dep} onClick={() => { setDeptFilter(dep); setCatFilter('all') }}
            className={`flex items-center gap-1.5 pr-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all shrink-0 ${dep !== 'all' && heroImgs[dep] ? 'pl-1.5' : 'pl-4'} ${deptFilter === dep ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
            {dep !== 'all' && heroImgs[dep] && (
              <img src={heroImgs[dep]} alt="" className="w-7 h-7 rounded-lg object-cover border border-white/10 shrink-0" />
            )}
            {dep === 'all' ? 'All Departments' : dep}
            <span className={`text-xs rounded-full px-1.5 ${deptFilter === dep ? 'bg-white/20' : 'bg-zinc-800'}`}>{dep === 'all' ? products.length : deptCount(dep)}</span>
          </button>
        ))}
      </div>

      {/* Department home-page hero photo — contextual to the selected department */}
      {deptFilter !== 'all' && (
        <DeptHeroCard department={deptFilter}
          onSaved={(dep, val) => setHeroImgs(p => { const n = { ...p }; if (val) n[dep] = val; else delete n[dep]; return n })} />
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input type="text" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm" />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={inp + ' cursor-pointer'}>
          {['all', ...CATEGORIES].map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
        </select>
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className={inp + ' cursor-pointer'}>
          <option value="default">Default Order</option>
          <option value="az">Name A-Z</option>
          <option value="za">Name Z-A</option>
        </select>
      </div>

      {/* ── Bulk Selection Toolbar ───────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-blue-600/8 border border-blue-600/25 rounded-xl px-4 py-3">
          <span className="text-blue-400 font-bold text-sm shrink-0">
            {selected.size} product{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <span className="text-zinc-400 text-xs font-semibold">Adjust base price:</span>
            <select value={bulkSign} onChange={e => setBulkSign(e.target.value)} className={inpSm + ' cursor-pointer'}>
              <option value="-">− Subtract</option>
              <option value="+">+ Add</option>
            </select>
            <div className="flex items-center gap-1">
              <span className="text-zinc-400 font-bold">$</span>
              <input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={bulkAmount}
                onChange={e => setBulkAmount(e.target.value)}
                className={inpSm + ' w-24 text-right'}
              />
            </div>
            <button
              onClick={applyBulkPrice}
              disabled={bulkBusy || !bulkAmount || Number(bulkAmount) <= 0}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
              {bulkBusy ? '…' : 'Apply to Selected'}
            </button>
          </div>
          <button
            onClick={() => { setSelected(new Set()); setBulkAmount('') }}
            className="text-zinc-500 hover:text-white text-xs px-2 py-1 rounded transition-colors shrink-0">
            Clear selection
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-red-600/8 border border-red-600/25 rounded-xl px-4 py-3">
          <span className="text-red-400 font-bold text-sm shrink-0">Run a sale on selection:</span>
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <span className="text-zinc-400 text-xs font-semibold">$ off current price:</span>
            <div className="flex items-center gap-1">
              <span className="text-zinc-400 font-bold">$</span>
              <input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={bulkSaleAmount}
                onChange={e => setBulkSaleAmount(e.target.value)}
                className={inpSm + ' w-24 text-right'}
              />
            </div>
            <button
              onClick={applyBulkSale}
              disabled={bulkSaleBusy || !bulkSaleAmount || Number(bulkSaleAmount) <= 0}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
              {bulkSaleBusy ? '…' : 'Set Sale'}
            </button>
            <button
              onClick={clearBulkSale}
              disabled={bulkSaleBusy}
              className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-bold rounded-lg disabled:opacity-40 transition-colors">
              {bulkSaleBusy ? '…' : 'Clear Sale'}
            </button>
          </div>
          <span className="text-zinc-500 text-xs shrink-0 max-w-[220px]">Sets each product's own "was" price to its current price, minus this amount.</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-zinc-600">Loading inventory...</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every(p => selected.has(p.id))}
                    ref={el => { if (el) el.indeterminate = selected.size > 0 && filtered.some(p => selected.has(p.id)) && !filtered.every(p => selected.has(p.id)) }}
                    onChange={e => setSelected(e.target.checked ? new Set(filtered.map(p => p.id)) : new Set())}
                    className="w-4 h-4 rounded cursor-pointer accent-blue-500"
                  />
                </th>
                <th className="text-left text-zinc-500 text-xs font-semibold uppercase tracking-wider px-3 py-3 hidden sm:table-cell w-14">Photo</th>
                <th className="text-left text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3">Product</th>
                <th className="text-left text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3 hidden md:table-cell">Category</th>
                <th className="text-right text-zinc-500 text-xs font-semibold uppercase tracking-wider px-3 py-3">
                  <span>Price</span>
                  {anyAdjustmentActive && <span className="ml-1 text-blue-400 normal-case font-semibold">· live</span>}
                </th>
                <th className="text-center text-zinc-500 text-xs font-semibold uppercase tracking-wider px-3 py-3">Qty</th>
                <th className="text-center text-zinc-500 text-xs font-semibold uppercase tracking-wider px-3 py-3 hidden sm:table-cell">Alert At</th>
                <th className="text-center text-zinc-500 text-xs font-semibold uppercase tracking-wider px-3 py-3">Stock</th>
                <th className="text-right text-zinc-500 text-xs font-semibold uppercase tracking-wider px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filtered.map(p => {
                const isLow = p.low_stock_threshold > 0 && p.stock_qty > 0 && p.stock_qty <= p.low_stock_threshold
                return (
                  <tr key={p.id} className={`hover:bg-zinc-800/30 transition-colors ${selected.has(p.id) ? 'bg-blue-600/10' : isLow ? 'bg-yellow-500/5' : ''}`}>
                    <td className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={e => setSelected(prev => {
                          const next = new Set(prev)
                          e.target.checked ? next.add(p.id) : next.delete(p.id)
                          return next
                        })}
                        className="w-4 h-4 rounded cursor-pointer accent-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="w-full h-full object-contain p-0.5"
                            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                        ) : null}
                        <div style={{ display: p.image_url ? 'none' : 'flex' }}
                          className="w-full h-full items-center justify-center text-zinc-600 text-xs font-bold">
                          {p.name?.slice(0, 2).toUpperCase()}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white font-medium leading-tight">{p.name}</div>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="text-xs font-semibold bg-blue-500/10 border border-blue-500/25 text-blue-300 px-1.5 py-0.5 rounded">{deptOf(p)}</span>
                        {p.size && <span className="text-zinc-500 text-xs">{p.size}</span>}
                        {p.batch_number && (
                          <span className="text-xs font-mono bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">
                            {p.batch_number}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">{p.category}</td>
                    {(() => {
                      const eff = computeEffective(p)
                      const hasWas = eff.was && eff.was > eff.price
                      const isAdjusted = Math.abs(eff.price - Number(p.price)) > 0.005
                      return (
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          {hasWas && showWasPrice && (
                            <div className="text-red-400 text-xs line-through leading-none">${eff.was.toFixed(2)}</div>
                          )}
                          {hasWas && !showWasPrice && (
                            <div className="text-red-400/50 text-xs leading-none mb-0.5 font-semibold">SALE</div>
                          )}
                          <div className="text-amber-400 font-bold">${eff.price.toFixed(2)}</div>
                          {isAdjusted && (
                            <div className="text-zinc-600 text-xs leading-none mt-0.5">base ${Number(p.price).toFixed(2)}</div>
                          )}
                        </td>
                      )
                    })()}
                    <td className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        {(() => {
                          const ci = caseInfo(p)
                          if (ci) return (
                            <>
                              <span className="text-white font-semibold">{ci.avail}</span>
                              <span className="text-zinc-600 text-[10px] leading-tight" title={`Auto: ${ci.parentQty} vials ÷ ${ci.per}`}>cases · auto</span>
                            </>
                          )
                          return (
                            <>
                              <InlineQty key={`${p.id}-qty-${p.stock_qty}`} product={p} field="stock_qty" onSaved={load} />
                              {isLow && <span className="text-yellow-500 text-xs font-semibold">low</span>}
                            </>
                          )
                        })()}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      <InlineQty key={`${p.id}-thresh-${p.low_stock_threshold}`} product={p} field="low_stock_threshold" onSaved={load} />
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {(() => {
                        const ci = caseInfo(p)
                        const inStock = ci ? ci.inStock : p.in_stock
                        return (
                          <span className={`px-2 py-1 rounded-lg text-xs font-bold ${inStock ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                            {inStock ? 'In Stock' : 'Out'}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => { setEditing(p); setAdding(false) }}
                          className="text-zinc-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-700 text-xs font-semibold">Edit</button>
                        <button onClick={() => deleteProduct(p.id)}
                          className="text-zinc-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-zinc-700 text-xs font-semibold">Del</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-12 text-zinc-600">No products found.</div>}
        </div>
      )}
    </div>
  )
}

// ─── Promos Tab ───────────────────────────────────────────────────────────────

const EMPTY_PROMO = { code: '', type: 'promo', discount_type: 'percent', discount_value: '', min_order_amount: '', max_uses: '', expires_at: '', is_active: true, no_tax: false, one_use_per_user: false, free_shipping: false }

function PromoForm({ initial, defaultType, onSave, onCancel }) {
  const [form, setForm] = useState(initial ? {
    ...initial,
    expires_at: initial.expires_at ? new Date(initial.expires_at * 1000).toISOString().slice(0, 16) : '',
    is_active: !!initial.is_active,
    no_tax: !!initial.no_tax,
    one_use_per_user: !!initial.one_use_per_user,
    free_shipping: !!initial.free_shipping,
  } : { ...EMPTY_PROMO, type: defaultType || 'promo' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = async () => {
    // A free-shipping code may have a 0 discount value; otherwise a value is required.
    if (!form.code || (!form.free_shipping && !form.discount_value)) { setErr('Code and discount value required'); return }
    setBusy(true); setErr('')
    try {
      const method = form.id ? 'PUT' : 'POST'
      const res = await fetch('/api/admin/promos', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          ...form,
          discount_value: Number(form.discount_value),
          min_order_amount: Number(form.min_order_amount) || 0,
          max_uses: Number(form.max_uses) || 0,
          expires_at: form.expires_at || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Save failed'); return }
      showToast(form.id ? '✓ Promo code updated' : '✓ Promo code created')
      onSave()
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-zinc-900/80 border border-zinc-700 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Code *</label>
          <input type="text" placeholder="SAVE10" value={form.code} onChange={set('code')} className={inpSm + ' w-full uppercase'} />
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Type</label>
          <select value={form.type} onChange={set('type')} className={inpSm + ' w-full cursor-pointer'}>
            <option value="promo">Promo</option>
            <option value="partner">Affiliate Partner</option>
          </select>
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Discount Type</label>
          <select value={form.discount_type} onChange={set('discount_type')} className={inpSm + ' w-full cursor-pointer'}>
            <option value="percent">Percent (%)</option>
            <option value="fixed">Fixed ($)</option>
          </select>
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Value *</label>
          <input type="number" step="0.01" placeholder={form.discount_type === 'percent' ? '10' : '5.00'} value={form.discount_value} onChange={set('discount_value')} className={inpSm + ' w-full'} />
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Min Order ($)</label>
          <input type="number" step="0.01" placeholder="0" value={form.min_order_amount} onChange={set('min_order_amount')} className={inpSm + ' w-full'} />
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Max Uses</label>
          <input type="number" placeholder="0 = unlimited" value={form.max_uses} onChange={set('max_uses')} className={inpSm + ' w-full'} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Expires At</label>
          <input type="datetime-local" value={form.expires_at} onChange={set('expires_at')} className={inpSm + ' w-full'} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="promo_active" checked={form.is_active} onChange={set('is_active')} className="w-3.5 h-3.5 accent-blue-500" />
          <label htmlFor="promo_active" className="text-white text-xs font-medium cursor-pointer">Active</label>
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input type="checkbox" id="promo_no_tax" checked={!!form.no_tax} onChange={set('no_tax')} className="w-3.5 h-3.5 mt-0.5 accent-green-500 shrink-0" />
            <div>
              <span className="text-white text-xs font-semibold group-hover:text-green-400 transition-colors">No Tax Applied</span>
              <p className="text-zinc-500 text-xs leading-relaxed mt-0.5">When this code is used at checkout, sales tax is waived entirely for that order.</p>
            </div>
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input type="checkbox" id="promo_one_use" checked={!!form.one_use_per_user} onChange={set('one_use_per_user')} className="w-3.5 h-3.5 mt-0.5 accent-purple-500 shrink-0" />
            <div>
              <span className="text-white text-xs font-semibold group-hover:text-purple-400 transition-colors">One Use Per Customer</span>
              <p className="text-zinc-500 text-xs leading-relaxed mt-0.5">Each customer account can only redeem this code once. Good for welcome or first-order promos.</p>
            </div>
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input type="checkbox" id="promo_free_ship" checked={!!form.free_shipping} onChange={set('free_shipping')} className="w-3.5 h-3.5 mt-0.5 accent-sky-500 shrink-0" />
            <div>
              <span className="text-white text-xs font-semibold group-hover:text-sky-400 transition-colors">Free Shipping</span>
              <p className="text-zinc-500 text-xs leading-relaxed mt-0.5">Waives the carrier shipping cost when this code is used. For a free-shipping-only code, set the discount value to 0. Pair with “One Use Per Customer” for free shipping once per customer.</p>
            </div>
          </label>
        </div>
      </div>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">
          {busy ? 'Saving...' : form.id ? 'Update' : 'Add Code'}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-bold rounded-lg transition-colors">Cancel</button>
      </div>
    </div>
  )
}

function PromoSection({ title, addType, codes, onRefresh, showType }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()
  const filtered = codes

  const deleteCode = async (id) => {
    if (!confirm('Delete this code?')) return
    setBusy(true)
    await fetch('/api/admin/promos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id }),
    })
    showToast('Promo code deleted', 'info')
    setBusy(false)
    onRefresh()
  }

  const toggleActive = async (c) => {
    await fetch('/api/admin/promos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ ...c, is_active: !c.is_active }),
    })
    showToast(c.is_active ? 'Code deactivated' : '✓ Code activated', c.is_active ? 'info' : 'success')
    onRefresh()
  }

  const now = Math.floor(Date.now() / 1000)
  const badgeFor = (c) => {
    if (!c.is_active) return <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-400 font-semibold">Inactive</span>
    if (c.expires_at && c.expires_at < now) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 font-semibold">Expired</span>
    if (c.max_uses > 0 && c.used_count >= c.max_uses) return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30 font-semibold">Maxed</span>
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30 font-semibold">Active</span>
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-sm">{title}</span>
          <span className="text-xs bg-zinc-800 text-zinc-400 rounded-full px-2 py-0.5">{filtered.length}</span>
        </div>
        {addType && (
          <button onClick={() => { setShowForm(true); setEditing(null) }}
            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors">
            + Add
          </button>
        )}
      </div>

      {(showForm || editing) && (
        <div className="p-3 border-b border-zinc-800">
          <PromoForm
            initial={editing}
            defaultType={addType}
            onSave={() => { setShowForm(false); setEditing(null); onRefresh() }}
            onCancel={() => { setShowForm(false); setEditing(null) }}
          />
        </div>
      )}

      {filtered.length === 0 && !showForm && !editing ? (
        <div className="text-center py-8 text-zinc-600 text-sm">No {title.toLowerCase()} yet.</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800/60">
              <th className="text-left text-zinc-500 font-semibold uppercase tracking-wider px-4 py-2.5">Code</th>
              <th className="text-left text-zinc-500 font-semibold uppercase tracking-wider px-4 py-2.5 hidden sm:table-cell">Discount</th>
              <th className="text-left text-zinc-500 font-semibold uppercase tracking-wider px-4 py-2.5 hidden md:table-cell">Expires</th>
              <th className="text-center text-zinc-500 font-semibold uppercase tracking-wider px-4 py-2.5 hidden sm:table-cell">Uses</th>
              <th className="text-center text-zinc-500 font-semibold uppercase tracking-wider px-4 py-2.5">Status</th>
              <th className="text-right text-zinc-500 font-semibold uppercase tracking-wider px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/40">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-zinc-800/20 transition-colors">
                <td className="px-4 py-2.5 font-bold text-white tracking-wide">
                  {c.code}
                  {showType && (
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold ${c.type === 'partner' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'}`}>
                      {c.type === 'partner' ? 'Affiliate' : 'Promo'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-zinc-300 hidden sm:table-cell">
                  <span>{c.discount_type === 'percent' ? `${c.discount_value}% off` : `$${Number(c.discount_value).toFixed(2)} off`}</span>
                  {c.min_order_amount > 0 && <span className="text-zinc-600 ml-1">(min ${c.min_order_amount})</span>}
                  {!!c.no_tax && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30 font-semibold">No Tax</span>}
                  {!!c.one_use_per_user && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 font-semibold">1×/user</span>}
                  {!!c.free_shipping && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30 font-semibold">Free Ship</span>}
                </td>
                <td className="px-4 py-2.5 text-zinc-400 hidden md:table-cell">{c.expires_at ? formatDateShort(c.expires_at) : 'No expiry'}</td>
                <td className="px-4 py-2.5 text-center text-zinc-400 hidden sm:table-cell">
                  {c.used_count}{c.max_uses > 0 ? `/${c.max_uses}` : ''}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button onClick={() => toggleActive(c)} title="Toggle active">{badgeFor(c)}</button>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => { setEditing(c); setShowForm(false) }}
                      className="text-zinc-500 hover:text-white px-2 py-1 rounded hover:bg-zinc-700 font-semibold transition-colors">Edit</button>
                    <button onClick={() => deleteCode(c.id)} disabled={busy}
                      className="text-zinc-600 hover:text-red-400 px-2 py-1 rounded hover:bg-zinc-700 font-semibold transition-colors">Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function PromosTab() {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const adminToken = sessionStorage.getItem('pl_admin_token')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/promos', { headers: { Authorization: `Bearer ${adminToken}` } })
      const d = await res.json()
      setCodes(d.codes || [])
    } catch {}
    finally { setLoading(false) }
  }, [adminToken])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-center py-20 text-zinc-600">Loading...</div>

  const now = Math.floor(Date.now() / 1000)
  const isExpired = c => c.expires_at && c.expires_at < now
  const active = codes.filter(c => !isExpired(c))
  const expired = codes.filter(isExpired)

  return (
    <div className="space-y-4">
      <PromoSection title="Promo Codes" addType="promo"
        codes={active.filter(c => c.type === 'promo')} onRefresh={load} />
      <PromoSection title="Affiliate Partner Codes" addType="partner"
        codes={active.filter(c => c.type === 'partner')} onRefresh={load} />
      {expired.length > 0 && (
        <PromoSection title="Expired Codes" codes={expired} onRefresh={load} showType />
      )}
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

const EMPTY_RATE = { name: '', price: '', min_days: '', max_days: '', display_order: '' }

function ShippingRateForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_RATE)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }))

  const save = async () => {
    if (!form.name || form.price === '') { setErr('Name and price required'); return }
    setBusy(true); setErr('')
    try {
      const method = form.id ? 'PUT' : 'POST'
      const res = await fetch('/api/admin/shipping-rates', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          ...form,
          price: Number(form.price),
          min_days: form.min_days ? Number(form.min_days) : null,
          max_days: form.max_days ? Number(form.max_days) : null,
          display_order: Number(form.display_order) || 999,
          is_active: form.is_active !== false,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Save failed'); return }
      showToast(form.id ? '✓ Shipping rate updated' : '✓ Shipping rate created')
      onSave()
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-zinc-900/80 border border-zinc-700 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="sm:col-span-2">
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Rate Name *</label>
          <input type="text" placeholder="Standard Shipping" value={form.name} onChange={set('name')} className={inpSm + ' w-full'} />
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Price ($) *</label>
          <input type="number" step="0.01" placeholder="7.99" value={form.price} onChange={set('price')} className={inpSm + ' w-full'} />
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Order</label>
          <input type="number" placeholder="1" value={form.display_order} onChange={set('display_order')} className={inpSm + ' w-full'} />
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Min Days</label>
          <input type="number" placeholder="3" value={form.min_days} onChange={set('min_days')} className={inpSm + ' w-full'} />
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Max Days</label>
          <input type="number" placeholder="7" value={form.max_days} onChange={set('max_days')} className={inpSm + ' w-full'} />
        </div>
      </div>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">
          {busy ? 'Saving...' : form.id ? 'Update' : 'Add Rate'}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-bold rounded-lg transition-colors">Cancel</button>
      </div>
    </div>
  )
}

const BANNER_STYLES = [
  { id: 'fire',   label: '🔥 Fire',   from: '#ea580c', to: '#be123c' },
  { id: 'gold',   label: '✨ Gold',   from: '#eab308', to: '#ea580c' },
  { id: 'blue',   label: '💎 Blue',   from: '#2563eb', to: '#4338ca' },
  { id: 'purple', label: '💜 Purple', from: '#7c3aed', to: '#4338ca' },
  { id: 'green',  label: '🌿 Green',  from: '#10b981', to: '#0891b2' },
]

const EMPTY_BANNER = { banner_enabled: '0', banner_pre_text: "Don't forget to use code", banner_code: '', banner_post_text: 'for a special discount on your order!', banner_style: 'fire', banner_expires_at: '' }

// Department → settings key for its home-page hero photo. (Underlying setting
// key names are kept stable so previously uploaded photos are preserved.)
const HERO_KEY = { 'Peptides': 'home_hero_peptides', 'Health & Wellness': 'home_hero_supplements', 'Beauty & Grooming': 'home_hero_skincare', 'Apparel & Gear': 'home_hero_apparel' }

// Compact hero-image control for a single department, shown inline in the
// Products tab when that department is selected. Stored in settings and served
// to the home page via /api/storefront/home-media.
function DeptHeroCard({ department, onSaved }) {
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()
  const key = HERO_KEY[department]
  const [img, setImg] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!key) return
    setImg(''); setSaved(false)
    fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then(r => r.json())
      .then(d => setImg(d.settings?.[key] || ''))
      .catch(() => {})
  }, [key, adminToken])

  const persist = async (value) => {
    setBusy(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: { [key]: value } }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 1800)
      onSaved?.(department, value)
    } catch { showToast('Failed to save image', 'warning') }
    finally { setBusy(false) }
  }

  const onFile = (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const im = new Image()
      im.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX = 1400
        let w = im.width, h = im.height
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX } }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(im, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        setImg(dataUrl); persist(dataUrl)
      }
      im.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  if (!key) return null
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4">
      <div className="relative w-28 sm:w-36 aspect-square shrink-0 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center">
        {img
          ? <img src={img} alt={department} className="absolute inset-0 h-full w-full object-cover" />
          : <span className="text-zinc-700 text-xs">No photo</span>}
        {busy && <div className="absolute inset-0 bg-zinc-950/60 flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-white font-bold text-sm flex items-center gap-2">🖼 {department} home-page photo
          {saved && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">✓ Saved</span>}
        </div>
        <div className="text-zinc-500 text-xs mt-0.5">Shown on the {department} card on the home page. Use a square (1:1) image. Optional — a branded card shows if empty.</div>
        <div className="flex gap-2 mt-2.5">
          <label className="cursor-pointer px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors">
            {img ? 'Replace photo' : 'Upload photo'}
            <input type="file" accept="image/*" onChange={onFile} className="hidden" />
          </label>
          {img && (
            <button onClick={() => { setImg(''); persist('') }} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-semibold rounded-lg transition-colors">Remove</button>
          )}
        </div>
      </div>
    </div>
  )
}

// Self-contained 2FA management card — its own state/effects, only reads
// adminToken/showToast from its parent, so it can't interfere with the rest
// of SettingsTab's state.
function TwoFactorSettings() {
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()
  const [status, setStatus] = useState(null) // { enabled } | null while loading
  const [setup, setSetup] = useState(null) // { secret, otpauthUrl } while mid-setup
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [disablePw, setDisablePw] = useState('')
  const [showDisable, setShowDisable] = useState(false)

  const load = useCallback(() => {
    fetch('/api/admin/totp-disable', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then(r => r.json())
      .then(d => setStatus({ enabled: !!d.enabled }))
      .catch(() => setStatus({ enabled: false }))
  }, [adminToken])

  useEffect(() => { load() }, [load])

  const startSetup = async () => {
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/admin/totp', { headers: { Authorization: `Bearer ${adminToken}` } })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Failed to start setup'); return }
      setSetup(d)
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  const confirmEnable = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/admin/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ secret: setup.secret, code }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Invalid code'); return }
      showToast('✓ Two-factor authentication enabled')
      setSetup(null); setCode('')
      load()
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  const disable = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/admin/totp-disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ password: disablePw }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Incorrect password'); return }
      showToast('Two-factor authentication disabled', 'warning')
      setShowDisable(false); setDisablePw('')
      load()
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div>
          <div className="text-white font-bold text-sm flex items-center gap-2 flex-wrap">
            🔐 Two-Factor Authentication
            {status?.enabled && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">● Enabled</span>}
            {status && !status.enabled && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-500">○ Disabled</span>}
          </div>
          <div className="text-zinc-500 text-xs mt-0.5">Requires a code from an authenticator app in addition to your password</div>
        </div>
      </div>

      <div className="p-4">
        {!status ? (
          <div className="text-zinc-600 text-sm">Loading…</div>
        ) : setup ? (
          <form onSubmit={confirmEnable} className="space-y-4">
            <p className="text-zinc-400 text-sm">Add this key to your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.) — manual entry, type "Time based":</p>
            <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 font-mono text-blue-400 text-sm tracking-wider break-all select-all">{setup.secret}</div>
            <div>
              <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Enter the 6-digit code to confirm</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="123456"
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-center text-xl tracking-[0.3em] font-mono focus:outline-none focus:border-blue-500" />
            </div>
            {err && <div className="text-red-400 text-sm">{err}</div>}
            <div className="flex gap-2">
              <button type="submit" disabled={busy || code.length !== 6}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">Confirm & Enable</button>
              <button type="button" onClick={() => { setSetup(null); setCode(''); setErr('') }}
                className="px-4 py-2.5 text-zinc-400 hover:text-white text-sm font-semibold transition-colors">Cancel</button>
            </div>
          </form>
        ) : status.enabled ? (
          showDisable ? (
            <form onSubmit={disable} className="space-y-3">
              <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">Confirm your admin password to disable 2FA</label>
              <input type="password" value={disablePw} onChange={e => setDisablePw(e.target.value)} autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" />
              {err && <div className="text-red-400 text-sm">{err}</div>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy || !disablePw}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">Disable 2FA</button>
                <button type="button" onClick={() => { setShowDisable(false); setDisablePw(''); setErr('') }}
                  className="px-4 py-2.5 text-zinc-400 hover:text-white text-sm font-semibold transition-colors">Cancel</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setShowDisable(true)}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-bold rounded-xl transition-colors">Disable 2FA</button>
          )
        ) : (
          <>
            <p className="text-zinc-500 text-sm mb-3">Not enabled — your admin panel currently relies on the password alone.</p>
            {err && <div className="text-red-400 text-sm mb-3">{err}</div>}
            <button onClick={startSetup} disabled={busy}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">Set Up Two-Factor Authentication</button>
          </>
        )}
      </div>
    </div>
  )
}

function SettingsTab() {
  const [rates, setRates] = useState([])
  const [settings, setSettings] = useState({ free_shipping_threshold: '0', tax_rate: '0', tax_label: 'Tax', google_maps_key: '', pending_reminder_hours: '24', pending_autocancel_hours: '72', review_request_delay_days: '3', review_promo_code: '' })
  const [easypostSettings, setEasyPostSettings] = useState({ easypost_api_key: '', ship_from_name: 'Pryme Labs', ship_from_street: '7400 Moline St', ship_from_city: 'Houston', ship_from_state: 'TX', ship_from_zip: '77087', ship_from_phone: '' })
  const [easypostSaving, setEasyPostSaving] = useState(false)
  const [easypostSaved, setEasyPostSaved] = useState(false)
  const [banner, setBanner] = useState(EMPTY_BANNER)
  const [bannerBusy, setBannerBusy] = useState(false)
  const [bannerSaved, setBannerSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [pendingBusy, setPendingBusy] = useState(false)
  const [pendingSaved, setPendingSaved] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewSaved, setReviewSaved] = useState(false)
  const [odBusy, setOdBusy] = useState(false)
  const [localDelivery, setLocalDelivery] = useState({ enabled: false, radius_miles: '15', uber_cost: '', flat_rate: '50' })
  const [localDeliverySaving, setLocalDeliverySaving] = useState(false)
  const [uberCreds, setUberCreds] = useState({ uber_client_id: '', uber_client_secret: '', uber_customer_id: '', uber_pickup_name: 'Pryme Labs', uber_pickup_address: '7400 Moline St, Houston, TX 77087', uber_pickup_phone: '' })
  const [uberCredsSaving, setUberCredsSaving] = useState(false)
  const [uberCredsSaved, setUberCredsSaved] = useState(false)
  const [fsBannerEnabled, setFsBannerEnabled] = useState(false)
  const [fsBannerBusy, setFsBannerBusy] = useState(false)
  const [fsAllEnabled, setFsAllEnabled] = useState(false) // free shipping on ALL orders
  const [fsAllBusy, setFsAllBusy] = useState(false)
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  // Handle OneDrive connect redirect result
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('onedrive') === 'connected') {
      showToast('✓ OneDrive connected! Backups will start automatically.', 'success')
      window.history.replaceState({}, '', '/admin')
      load()
    } else if (p.get('onedrive') === 'error') {
      showToast(`OneDrive error: ${p.get('msg') || 'Unknown error'}`, 'error')
      window.history.replaceState({}, '', '/admin')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ratesRes, settingsRes] = await Promise.all([
        fetch('/api/admin/shipping-rates', { headers: { Authorization: `Bearer ${adminToken}` } }),
        fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${adminToken}` } }),
      ])
      const [ratesData, settingsData] = await Promise.all([ratesRes.json(), settingsRes.json()])
      setRates(ratesData.rates || [])
      if (settingsData.settings) {
        const loaded = { ...settingsData.settings }
        if (loaded.tax_rate != null) loaded.tax_rate = String(Number(loaded.tax_rate) * 100)
        setSettings(s => ({ ...s, ...loaded }))
        setLocalDelivery(ld => ({
          ...ld,
          enabled: loaded.local_delivery_enabled === '1',
          radius_miles: loaded.local_delivery_radius_miles || '15',
          uber_cost: loaded.local_delivery_uber_cost || '',
          flat_rate: loaded.local_delivery_flat_rate || '50',
        }))
        setFsBannerEnabled(loaded.free_shipping_banner_enabled === '1')
        setFsAllEnabled(loaded.free_shipping_all === '1')
        setEasyPostSettings(s => ({
          ...s,
          easypost_api_key: loaded.easypost_api_key || '',
          ship_from_name:   loaded.ship_from_name   || s.ship_from_name,
          ship_from_street: loaded.ship_from_street || s.ship_from_street,
          ship_from_city:   loaded.ship_from_city   || s.ship_from_city,
          ship_from_state:  loaded.ship_from_state  || s.ship_from_state,
          ship_from_zip:    loaded.ship_from_zip    || s.ship_from_zip,
          ship_from_phone:  loaded.ship_from_phone  || '',
        }))
        setUberCreds(u => ({
          ...u,
          uber_client_id:      loaded.uber_client_id      || '',
          uber_client_secret:  loaded.uber_client_secret  || '',
          uber_customer_id:    loaded.uber_customer_id    || '',
          uber_pickup_name:    loaded.uber_pickup_name    || u.uber_pickup_name,
          uber_pickup_address: loaded.uber_pickup_address || u.uber_pickup_address,
          uber_pickup_phone:   loaded.uber_pickup_phone   || '',
        }))
        setBanner(b => ({
          ...b,
          banner_enabled: loaded.banner_enabled || '0',
          banner_pre_text: loaded.banner_pre_text ?? b.banner_pre_text,
          banner_code: loaded.banner_code || '',
          banner_post_text: loaded.banner_post_text ?? b.banner_post_text,
          banner_style: loaded.banner_style || 'fire',
          // Convert stored Unix timestamp back to datetime-local string
          banner_expires_at: loaded.banner_expires_at
            ? new Date(Number(loaded.banner_expires_at) * 1000).toISOString().slice(0, 16)
            : '',
        }))
      }
    } catch {}
    finally { setLoading(false) }
  }, [adminToken])

  useEffect(() => { load() }, [load])

  const deleteRate = async (id) => {
    if (!confirm('Delete this shipping rate?')) return
    await fetch('/api/admin/shipping-rates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id }),
    })
    showToast('Shipping rate deleted', 'info')
    load()
  }

  const toggleRate = async (rate) => {
    await fetch('/api/admin/shipping-rates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ ...rate, is_active: !rate.is_active }),
    })
    showToast(rate.is_active ? 'Rate deactivated' : '✓ Rate activated', rate.is_active ? 'info' : 'success')
    load()
  }

  const saveBanner = async (overrides = {}) => {
    setBannerBusy(true)
    const merged = { ...banner, ...overrides }
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: {
          banner_enabled: merged.banner_enabled,
          banner_pre_text: merged.banner_pre_text,
          banner_code: merged.banner_code,
          banner_post_text: merged.banner_post_text,
          banner_style: merged.banner_style,
          // Store as Unix timestamp (empty string = no expiry)
          banner_expires_at: merged.banner_expires_at
            ? String(Math.floor(new Date(merged.banner_expires_at).getTime() / 1000))
            : '',
        }}),
      })
      setBanner(merged)
      showToast(merged.banner_enabled === '1' ? '✓ Promo banner live on storefront' : '✓ Promo banner hidden')
      setBannerSaved(true)
      setTimeout(() => setBannerSaved(false), 2000)
    } catch { showToast('Failed to save banner', 'error') }
    finally { setBannerBusy(false) }
  }

  const saveFsBanner = async (nextEnabled) => {
    setFsBannerBusy(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: { free_shipping_banner_enabled: nextEnabled ? '1' : '0' } }),
      })
      setFsBannerEnabled(nextEnabled)
      showToast(nextEnabled ? '✓ Free shipping banner is live' : '✓ Free shipping banner hidden')
    } catch { showToast('Failed to save', 'error') }
    finally { setFsBannerBusy(false) }
  }

  const saveFsAll = async (nextEnabled) => {
    setFsAllBusy(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: { free_shipping_all: nextEnabled ? '1' : '0' } }),
      })
      setFsAllEnabled(nextEnabled)
      showToast(nextEnabled ? '✓ Free shipping ON for all orders — storefront banner is live' : '✓ Free shipping (all orders) turned off')
    } catch { showToast('Failed to save', 'error') }
    finally { setFsAllBusy(false) }
  }

  const saveEasyPostSettings = async () => {
    setEasyPostSaving(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: {
          easypost_api_key: easypostSettings.easypost_api_key,
          ship_from_name:   easypostSettings.ship_from_name,
          ship_from_street: easypostSettings.ship_from_street,
          ship_from_city:   easypostSettings.ship_from_city,
          ship_from_state:  easypostSettings.ship_from_state,
          ship_from_zip:    easypostSettings.ship_from_zip,
          ship_from_phone:  easypostSettings.ship_from_phone,
        }}),
      })
      showToast('✓ Shipping label settings saved')
      setEasyPostSaved(true)
      setTimeout(() => setEasyPostSaved(false), 2000)
    } catch { showToast('Failed to save', 'error') }
    finally { setEasyPostSaving(false) }
  }

  const saveSettings = async () => {
    setSettingsBusy(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: {
          free_shipping_threshold: String(settings.free_shipping_threshold),
          tax_rate: String(Number(settings.tax_rate) / 100),
          tax_label: settings.tax_label || 'Tax',
          google_maps_key: settings.google_maps_key || '',
        }}),
      })
      showToast('✓ Settings saved')
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    } catch {}
    finally { setSettingsBusy(false) }
  }

  const savePendingAutomation = async () => {
    const reminder = Math.max(1, Math.floor(Number(settings.pending_reminder_hours) || 24))
    const cancel   = Math.max(1, Math.floor(Number(settings.pending_autocancel_hours) || 72))
    if (reminder >= cancel) { showToast('Reminder hours must be less than auto-cancel hours', 'error'); return }
    setPendingBusy(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: {
          pending_reminder_hours: String(reminder),
          pending_autocancel_hours: String(cancel),
        }}),
      })
      setSettings(s => ({ ...s, pending_reminder_hours: String(reminder), pending_autocancel_hours: String(cancel) }))
      showToast('✓ Automation timers saved')
      setPendingSaved(true)
      setTimeout(() => setPendingSaved(false), 2000)
    } catch {}
    finally { setPendingBusy(false) }
  }

  const saveReviewSettings = async () => {
    const days = Math.max(0, Math.floor(Number(settings.review_request_delay_days) || 3))
    const code = String(settings.review_promo_code || '').trim().toUpperCase()
    setReviewBusy(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: {
          review_request_delay_days: String(days),
          review_promo_code: code,
        }}),
      })
      setSettings(s => ({ ...s, review_request_delay_days: String(days), review_promo_code: code }))
      showToast('✓ Review email settings saved')
      setReviewSaved(true)
      setTimeout(() => setReviewSaved(false), 2000)
    } catch {}
    finally { setReviewBusy(false) }
  }

  const saveLocalDelivery = async (enabledOverride) => {
    setLocalDeliverySaving(true)
    const enabled = enabledOverride !== undefined ? enabledOverride : localDelivery.enabled
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: {
          local_delivery_enabled: enabled ? '1' : '0',
          local_delivery_radius_miles: String(localDelivery.radius_miles || '15'),
          local_delivery_uber_cost: String(localDelivery.uber_cost || ''),
          local_delivery_flat_rate: String(localDelivery.flat_rate || '50'),
          local_delivery_hub_lat: '29.7065',
          local_delivery_hub_lng: '-95.3127',
        }}),
      })
      showToast(enabled ? '🚗 Local delivery is now LIVE' : '✓ Local delivery turned off', enabled ? 'success' : 'info')
    } catch { showToast('Failed to save', 'error') }
    finally { setLocalDeliverySaving(false) }
  }

  const saveUberCreds = async () => {
    setUberCredsSaving(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: {
          uber_client_id:      uberCreds.uber_client_id,
          uber_client_secret:  uberCreds.uber_client_secret,
          uber_customer_id:    uberCreds.uber_customer_id,
          uber_pickup_name:    uberCreds.uber_pickup_name,
          uber_pickup_address: uberCreds.uber_pickup_address,
          uber_pickup_phone:   uberCreds.uber_pickup_phone,
        }}),
      })
      showToast('✓ Uber Direct credentials saved')
      setUberCredsSaved(true)
      setTimeout(() => setUberCredsSaved(false), 2000)
    } catch { showToast('Failed to save', 'error') }
    finally { setUberCredsSaving(false) }
  }

  if (loading) return <div className="text-center py-20 text-zinc-600">Loading...</div>

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Two-Factor Authentication ────────────────────────────────────── */}
      <TwoFactorSettings />

      {/* ── Promo Banner ──────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div>
            <div className="text-white font-bold text-sm flex items-center gap-2 flex-wrap">
              🏷 Promo Banner
              {(() => {
                const expired = banner.banner_expires_at && new Date(banner.banner_expires_at) < new Date()
                if (expired) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">⏰ Expired</span>
                if (banner.banner_enabled === '1') return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">● Live</span>
                return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-500">○ Hidden</span>
              })()}
            </div>
            <div className="text-zinc-500 text-xs mt-0.5">Displays above the navbar on every storefront page</div>
          </div>
          <button
            onClick={() => {
              const next = banner.banner_enabled === '1' ? '0' : '1'
              saveBanner({ banner_enabled: next })
            }}
            disabled={bannerBusy}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
              banner.banner_enabled === '1'
                ? 'bg-red-600/15 hover:bg-red-600/25 text-red-400 border border-red-600/25'
                : 'bg-green-600/15 hover:bg-green-600/25 text-green-400 border border-green-600/25'
            }`}>
            {bannerBusy ? '…' : banner.banner_enabled === '1' ? 'Hide Banner' : 'Go Live'}
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Live preview */}
          {(() => {
            const style = BANNER_STYLES.find(s => s.id === banner.banner_style) || BANNER_STYLES[0]
            return (
              <div>
                <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Preview</div>
                <div className="rounded-xl overflow-hidden" style={{ background: `linear-gradient(to right, ${style.from}, ${style.to})` }}>
                  <div className="px-8 py-2.5 flex items-center justify-center gap-2 flex-wrap text-white text-xs sm:text-sm font-semibold">
                    <span>🏷</span>
                    {banner.banner_pre_text && <span>{banner.banner_pre_text}</span>}
                    {banner.banner_code && (
                      <span className="inline-flex items-center gap-1 bg-black/25 border border-white/30 rounded-lg px-2.5 py-0.5 font-black tracking-widest text-xs sm:text-sm">
                        {banner.banner_code}
                        <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" strokeWidth={2}/><path strokeWidth={2} d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                      </span>
                    )}
                    {banner.banner_post_text && <span>{banner.banner_post_text}</span>}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Message (before code)</label>
              <input type="text" placeholder="Don't forget to use code"
                value={banner.banner_pre_text}
                onChange={e => setBanner(b => ({ ...b, banner_pre_text: e.target.value }))}
                className={inp + ' w-full'} />
            </div>
            <div>
              <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Promo Code</label>
              <input type="text" placeholder="PRYME20"
                value={banner.banner_code}
                onChange={e => setBanner(b => ({ ...b, banner_code: e.target.value.toUpperCase() }))}
                className={inp + ' w-full font-mono font-bold tracking-widest uppercase'} />
              <p className="text-zinc-600 text-xs mt-1">Customers can click to copy this code. The banner <span className="text-zinc-400">auto-hides the moment this code expires or is turned off</span> in Promos.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Message (after code)</label>
              <input type="text" placeholder="for 20% off your order!"
                value={banner.banner_post_text}
                onChange={e => setBanner(b => ({ ...b, banner_post_text: e.target.value }))}
                className={inp + ' w-full'} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">
                Extra Auto-Expire (optional)
                <span className="ml-1.5 text-zinc-600 normal-case font-normal">— the banner already hides when the promo code above expires; set this only to hide it even sooner</span>
              </label>
              <div className="flex items-center gap-3">
                <input type="datetime-local"
                  value={banner.banner_expires_at}
                  onChange={e => setBanner(b => ({ ...b, banner_expires_at: e.target.value }))}
                  className={inp + ' flex-1'} />
                {banner.banner_expires_at && (
                  <button
                    onClick={() => setBanner(b => ({ ...b, banner_expires_at: '' }))}
                    className="text-zinc-500 hover:text-red-400 text-xs font-semibold transition-colors shrink-0">
                    Clear
                  </button>
                )}
              </div>
              {banner.banner_expires_at && new Date(banner.banner_expires_at) < new Date() && (
                <p className="text-red-400 text-xs mt-1">⏰ This date is in the past — the banner is currently expired and hidden from customers.</p>
              )}
              {banner.banner_expires_at && new Date(banner.banner_expires_at) >= new Date() && (
                <p className="text-zinc-500 text-xs mt-1">
                  Banner will automatically hide on {new Date(banner.banner_expires_at).toLocaleString()}.
                </p>
              )}
            </div>
          </div>

          {/* Color scheme */}
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Color Theme</label>
            <div className="flex gap-2 flex-wrap">
              {BANNER_STYLES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setBanner(b => ({ ...b, banner_style: s.id }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    banner.banner_style === s.id
                      ? 'border-white/40 text-white shadow-lg scale-105'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}
                  style={banner.banner_style === s.id ? { background: `linear-gradient(to right, ${s.from}, ${s.to})` } : {}}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => saveBanner()} disabled={bannerBusy}
            className={`px-5 py-2 text-sm font-bold rounded-xl transition-colors ${bannerSaved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white'}`}>
            {bannerSaved ? '✓ Saved' : bannerBusy ? 'Saving…' : 'Save Banner'}
          </button>
        </div>
      </div>

      {/* ── Free Shipping — All Orders ───────────────────────────────────── */}
      <div className={`rounded-2xl overflow-hidden border transition-colors ${fsAllEnabled ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div>
            <div className="text-white font-bold text-sm flex items-center gap-2">
              🚚 Free Shipping — All Orders
              {fsAllEnabled
                ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">● Live</span>
                : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-500">○ Off</span>}
            </div>
            <div className="text-zinc-500 text-xs mt-0.5">Turn on to make <span className="text-zinc-300 font-semibold">every order ship free</span> (no minimum, no code) — shows a storefront banner announcing it.</div>
          </div>
          <button onClick={() => saveFsAll(!fsAllEnabled)} disabled={fsAllBusy}
            className="relative inline-flex items-center gap-2 disabled:opacity-50" aria-label="Toggle free shipping on all orders">
            <span className={`text-xs font-bold transition-colors ${fsAllEnabled ? 'text-green-400' : 'text-zinc-500'}`}>{fsAllBusy ? '…' : fsAllEnabled ? 'On' : 'Off'}</span>
            <span className={`relative inline-block w-11 h-6 rounded-full transition-colors duration-200 ${fsAllEnabled ? 'bg-green-500' : 'bg-zinc-700'}`}>
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${fsAllEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Storefront banner preview</div>
            <div className="rounded-xl overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700">
              <div className="px-8 py-2 flex items-center justify-center gap-2 flex-wrap text-white text-xs sm:text-sm font-semibold">
                <span>🚚</span><span className="font-black">FREE SHIPPING ON ALL ORDERS</span><span className="text-white/70 text-xs font-normal">— no minimum, no code needed</span>
              </div>
            </div>
          </div>
          <p className="text-zinc-600 text-xs">While this is on, all carrier shipping is free at checkout and the banner above shows on the storefront. It overrides the threshold banner below.</p>
        </div>
      </div>

      {/* ── Free Shipping Banner ─────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div>
            <div className="text-white font-bold text-sm flex items-center gap-2">
              🚚 Free Shipping Banner
              {fsBannerEnabled
                ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">● Live</span>
                : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-500">○ Hidden</span>
              }
            </div>
            <div className="text-zinc-500 text-xs mt-0.5">Shows a banner with your free shipping threshold — no code needed</div>
          </div>
          {/* Live toggle switch */}
          <button
            onClick={() => saveFsBanner(!fsBannerEnabled)}
            disabled={fsBannerBusy}
            className="relative inline-flex items-center gap-2 disabled:opacity-50"
            aria-label="Toggle free shipping banner">
            <span className={`text-xs font-bold transition-colors ${fsBannerEnabled ? 'text-green-400' : 'text-zinc-500'}`}>
              {fsBannerBusy ? '…' : fsBannerEnabled ? 'On' : 'Off'}
            </span>
            <span className={`relative inline-block w-11 h-6 rounded-full transition-colors duration-200 ${fsBannerEnabled ? 'bg-green-500' : 'bg-zinc-700'}`}>
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${fsBannerEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
          </button>
        </div>

        {/* Preview */}
        <div className="p-4 space-y-3">
          <div>
            <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Preview</div>
            <div className="rounded-xl overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700">
              <div className="px-8 py-2 flex items-center justify-center gap-2 flex-wrap text-white text-xs sm:text-sm font-semibold">
                <span>🚚</span>
                <span>
                  FREE SHIPPING on orders over{' '}
                  <span className="font-black">${Number(settings.free_shipping_threshold || 0).toFixed(0)}</span>
                </span>
                <span className="text-white/60 text-xs font-normal">— no code needed</span>
              </div>
            </div>
          </div>
          <p className="text-zinc-600 text-xs">
            The threshold shown above is pulled from your <span className="text-zinc-400 font-semibold">Free Shipping Threshold</span> setting below. Update that value and it will reflect here automatically.
          </p>
        </div>
      </div>

      {/* ── Shipping Labels (EasyPost) ───────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="text-white font-bold text-sm flex items-center gap-2">🏷 Shipping Labels <span className="text-xs font-normal text-zinc-500">via EasyPost</span></div>
          <div className="text-zinc-500 text-xs mt-0.5">Connect your EasyPost account to buy postage labels directly from each order</div>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">
              EasyPost API Key
              <a href="https://www.easypost.com/account/api-keys" target="_blank" rel="noopener noreferrer"
                className="ml-2 normal-case font-normal text-blue-400 hover:text-blue-300 transition-colors">
                Get your key ↗
              </a>
            </label>
            <input type="password"
              placeholder="EZAKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={easypostSettings.easypost_api_key}
              onChange={e => setEasyPostSettings(s => ({ ...s, easypost_api_key: e.target.value }))}
              className={inp + ' w-full font-mono'} />
            <p className="text-zinc-600 text-xs mt-1">Use your production (not test) key once your account is verified · discounted carrier rates</p>
          </div>
          <div>
            <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Ship-From Address</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="sm:col-span-2">
                <label className="block text-zinc-600 text-xs mb-1">Name / Business</label>
                <input type="text" placeholder="Pryme Labs"
                  value={easypostSettings.ship_from_name}
                  onChange={e => setEasyPostSettings(s => ({ ...s, ship_from_name: e.target.value }))}
                  className={inp + ' w-full'} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-zinc-600 text-xs mb-1">Street Address</label>
                <input type="text" placeholder="7400 Moline St"
                  value={easypostSettings.ship_from_street}
                  onChange={e => setEasyPostSettings(s => ({ ...s, ship_from_street: e.target.value }))}
                  className={inp + ' w-full'} />
              </div>
              <div>
                <label className="block text-zinc-600 text-xs mb-1">City</label>
                <input type="text" placeholder="Houston"
                  value={easypostSettings.ship_from_city}
                  onChange={e => setEasyPostSettings(s => ({ ...s, ship_from_city: e.target.value }))}
                  className={inp + ' w-full'} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-zinc-600 text-xs mb-1">State</label>
                  <input type="text" placeholder="TX" maxLength={2}
                    value={easypostSettings.ship_from_state}
                    onChange={e => setEasyPostSettings(s => ({ ...s, ship_from_state: e.target.value.toUpperCase() }))}
                    className={inp + ' w-full uppercase'} />
                </div>
                <div>
                  <label className="block text-zinc-600 text-xs mb-1">ZIP</label>
                  <input type="text" placeholder="77087"
                    value={easypostSettings.ship_from_zip}
                    onChange={e => setEasyPostSettings(s => ({ ...s, ship_from_zip: e.target.value }))}
                    className={inp + ' w-full'} />
                </div>
              </div>
              <div>
                <label className="block text-zinc-600 text-xs mb-1">Phone (optional)</label>
                <input type="tel" placeholder="(346) 555-0000"
                  value={easypostSettings.ship_from_phone}
                  onChange={e => setEasyPostSettings(s => ({ ...s, ship_from_phone: e.target.value }))}
                  className={inp + ' w-full'} />
              </div>
            </div>
          </div>
          <button onClick={saveEasyPostSettings} disabled={easypostSaving}
            className={`px-5 py-2 text-sm font-bold rounded-xl transition-colors ${easypostSaved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white'}`}>
            {easypostSaved ? '✓ Saved' : easypostSaving ? 'Saving…' : 'Save Label Settings'}
          </button>
        </div>
      </div>

      {/* Shipping Rates */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-white font-bold text-sm">Shipping Rates</span>
          <button onClick={() => { setShowForm(true); setEditing(null) }}
            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors">
            + Add Rate
          </button>
        </div>
        {(showForm || editing) && (
          <div className="p-3 border-b border-zinc-800">
            <ShippingRateForm
              initial={editing}
              onSave={() => { setShowForm(false); setEditing(null); load() }}
              onCancel={() => { setShowForm(false); setEditing(null) }}
            />
          </div>
        )}
        {rates.length === 0 && !showForm ? (
          <div className="text-center py-8 text-zinc-600 text-sm">No shipping rates yet. Add one above.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800/60">
                <th className="text-left text-zinc-500 font-semibold uppercase tracking-wider px-4 py-2.5">Name</th>
                <th className="text-right text-zinc-500 font-semibold uppercase tracking-wider px-4 py-2.5">Price</th>
                <th className="text-center text-zinc-500 font-semibold uppercase tracking-wider px-4 py-2.5 hidden sm:table-cell">Days</th>
                <th className="text-center text-zinc-500 font-semibold uppercase tracking-wider px-4 py-2.5">Status</th>
                <th className="text-right text-zinc-500 font-semibold uppercase tracking-wider px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {rates.map(r => (
                <tr key={r.id} className="hover:bg-zinc-800/20 transition-colors">
                  <td className="px-4 py-2.5 text-white font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right text-amber-400 font-bold">{Number(r.price) === 0 ? 'Free' : `$${Number(r.price).toFixed(2)}`}</td>
                  <td className="px-4 py-2.5 text-center text-zinc-400 hidden sm:table-cell">
                    {r.min_days && r.max_days ? `${r.min_days}–${r.max_days}d` : r.min_days ? `${r.min_days}+ d` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => toggleRate(r)}
                      className={`text-xs px-2 py-0.5 rounded-full font-semibold transition-colors ${r.is_active ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'bg-zinc-700/60 text-zinc-400'}`}>
                      {r.is_active ? 'Active' : 'Off'}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => { setEditing(r); setShowForm(false) }}
                        className="text-zinc-500 hover:text-white px-2 py-1 rounded hover:bg-zinc-700 font-semibold transition-colors">Edit</button>
                      <button onClick={() => deleteRate(r.id)}
                        className="text-zinc-600 hover:text-red-400 px-2 py-1 rounded hover:bg-zinc-700 font-semibold transition-colors">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Local Delivery ───────────────────────────────────────────────── */}
      <div className={`bg-zinc-900 border rounded-2xl p-5 space-y-4 transition-colors ${localDelivery.enabled ? 'border-green-600/40 bg-green-500/5' : 'border-zinc-800'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚗</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">Same-Day Local Delivery</span>
                {localDelivery.enabled
                  ? <span className="text-xs bg-green-500/20 border border-green-500/30 text-green-400 px-2 py-0.5 rounded-full font-bold animate-pulse">LIVE</span>
                  : <span className="text-xs bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full font-bold">OFF</span>}
              </div>
              <p className="text-zinc-500 text-xs mt-0.5">Hub: 7400 Moline St, Houston TX 77087 · Dispatched via Uber Courier</p>
            </div>
          </div>
          <button
            onClick={() => {
              const next = !localDelivery.enabled
              setLocalDelivery(ld => ({ ...ld, enabled: next }))
              saveLocalDelivery(next)
            }}
            disabled={localDeliverySaving}
            className={`px-5 py-2 rounded-xl text-sm font-black transition-colors disabled:opacity-50 ${
              localDelivery.enabled
                ? 'bg-red-600/15 hover:bg-red-600/25 text-red-400 border border-red-600/30'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}>
            {localDeliverySaving ? '...' : localDelivery.enabled ? '⏹ Turn Off' : '▶ Go Live'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Customer Flat Rate ($)</label>
            <div className="flex items-center gap-1">
              <span className="text-zinc-400 font-bold">$</span>
              <input type="number" step="0.01" min="0" placeholder="50.00"
                value={localDelivery.flat_rate}
                onChange={e => setLocalDelivery(ld => ({ ...ld, flat_rate: e.target.value }))}
                className={inp + ' w-full'} />
            </div>
            <p className="text-zinc-600 text-xs mt-1">What the customer pays — always charged, no free shipping</p>
          </div>
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Delivery Radius (miles)</label>
            <input type="number" min="1" max="50" placeholder="15"
              value={localDelivery.radius_miles}
              onChange={e => setLocalDelivery(ld => ({ ...ld, radius_miles: e.target.value }))}
              className={inp + ' w-full'} />
            <p className="text-zinc-600 text-xs mt-1">Customers outside this radius won't see local delivery</p>
          </div>
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Your Uber Cost (hidden)</label>
            <div className="flex items-center gap-1">
              <span className="text-zinc-400 font-bold">$</span>
              <input type="number" step="0.01" placeholder="0.00"
                value={localDelivery.uber_cost}
                onChange={e => setLocalDelivery(ld => ({ ...ld, uber_cost: e.target.value }))}
                className={inp + ' w-full'} />
            </div>
            <p className="text-zinc-600 text-xs mt-1">For your records only — never shown to customer</p>
          </div>
        </div>

        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-xs text-zinc-400 space-y-1">
          <div className="font-semibold text-zinc-300 mb-1">How it works</div>
          <div>· Customer selects "Same-Day Local Delivery ($50)" at checkout</div>
          <div>· Their address is validated against your {localDelivery.radius_miles || 15}-mile radius from your Hub</div>
          <div>· Mark the order <strong className="text-zinc-300">Fulfilled</strong>, then click <strong className="text-zinc-300">🚗 Dispatch Driver</strong> — Uber picks up and delivers</div>
          <div>· Customer receives shipping notification with a white-label tracking link (no Uber branding)</div>
          <div>· Order auto-completes when Uber marks the delivery as delivered</div>
        </div>

        <button onClick={() => saveLocalDelivery()} disabled={localDeliverySaving}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl transition-colors disabled:opacity-40">
          {localDeliverySaving ? 'Saving...' : 'Save Radius & Cost'}
        </button>
      </div>

      {/* ── Uber Direct API Credentials ───────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div>
          <div className="text-white font-bold text-sm flex items-center gap-2">🚗 Uber Direct API Credentials</div>
          <p className="text-zinc-500 text-xs mt-0.5">Required to dispatch drivers from the order panel. Apply at <a href="https://developer.uber.com" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">developer.uber.com</a> → Uber Direct.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Client ID</label>
            <input type="text" placeholder="Your Uber app Client ID"
              value={uberCreds.uber_client_id}
              onChange={e => setUberCreds(u => ({ ...u, uber_client_id: e.target.value }))}
              className={inp + ' w-full'} />
          </div>
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Client Secret</label>
            <input type="password" placeholder="••••••••"
              value={uberCreds.uber_client_secret}
              onChange={e => setUberCreds(u => ({ ...u, uber_client_secret: e.target.value }))}
              className={inp + ' w-full'} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Customer ID</label>
            <input type="text" placeholder="Uber Direct customer_id (from dashboard)"
              value={uberCreds.uber_customer_id}
              onChange={e => setUberCreds(u => ({ ...u, uber_customer_id: e.target.value }))}
              className={inp + ' w-full'} />
            <p className="text-zinc-600 text-xs mt-1">Found in your Uber for Business dashboard under Uber Direct → API</p>
          </div>
          <div className="sm:col-span-2 border-t border-zinc-800 pt-3">
            <div className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">Pickup Location (Your Hub)</div>
          </div>
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Business Name</label>
            <input type="text" placeholder="Pryme Labs"
              value={uberCreds.uber_pickup_name}
              onChange={e => setUberCreds(u => ({ ...u, uber_pickup_name: e.target.value }))}
              className={inp + ' w-full'} />
          </div>
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Pickup Phone</label>
            <input type="tel" placeholder="+17135550100"
              value={uberCreds.uber_pickup_phone}
              onChange={e => setUberCreds(u => ({ ...u, uber_pickup_phone: e.target.value }))}
              className={inp + ' w-full'} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Pickup Address</label>
            <input type="text" placeholder="7400 Moline St, Houston, TX 77087"
              value={uberCreds.uber_pickup_address}
              onChange={e => setUberCreds(u => ({ ...u, uber_pickup_address: e.target.value }))}
              className={inp + ' w-full'} />
          </div>
        </div>
        <button onClick={saveUberCreds} disabled={uberCredsSaving}
          className={`px-5 py-2 text-sm font-bold rounded-xl transition-colors ${uberCredsSaved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white'}`}>
          {uberCredsSaved ? '✓ Saved' : uberCredsSaving ? 'Saving...' : 'Save Uber Credentials'}
        </button>
      </div>

      {/* Store Config */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
        <div className="text-white font-bold text-sm">Store Configuration</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Free Shipping at ($)</label>
            <input type="number" step="0.01" placeholder="0 = disabled" value={settings.free_shipping_threshold}
              onChange={e => setSettings(s => ({ ...s, free_shipping_threshold: e.target.value }))}
              className={inp + ' w-full'} />
            <p className="text-zinc-600 text-xs mt-1">0 = no free shipping threshold</p>
          </div>
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Tax Rate (%)</label>
            <input type="number" step="0.01" placeholder="0" value={settings.tax_rate}
              onChange={e => setSettings(s => ({ ...s, tax_rate: e.target.value }))}
              className={inp + ' w-full'} />
            <p className="text-zinc-600 text-xs mt-1">0 = no tax applied</p>
          </div>
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Tax Label</label>
            <input type="text" placeholder="Tax" value={settings.tax_label}
              onChange={e => setSettings(s => ({ ...s, tax_label: e.target.value }))}
              className={inp + ' w-full'} />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Google Maps API Key</label>
            <input type="text" placeholder="AIza..." value={settings.google_maps_key || ''}
              onChange={e => setSettings(s => ({ ...s, google_maps_key: e.target.value }))}
              className={inp + ' w-full'} />
            <p className="text-zinc-600 text-xs mt-1">Enables address autocomplete at checkout. Requires Places API enabled on your key.</p>
          </div>
        </div>
        <button onClick={saveSettings} disabled={settingsBusy}
          className={`px-5 py-2 text-sm font-bold rounded-xl transition-colors ${settingsSaved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white'}`}>
          {settingsSaved ? '✓ Saved' : settingsBusy ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Pending Order Automation */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
        <div>
          <div className="text-white font-bold text-sm">Pending Order Automation</div>
          <div className="text-zinc-500 text-xs mt-0.5">For unpaid orders. The hourly scheduler sends one reminder, then auto-cancels &amp; releases inventory if still unpaid.</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Send Reminder After (hours)</label>
            <input type="number" min="1" step="1" placeholder="24" value={settings.pending_reminder_hours}
              onChange={e => setSettings(s => ({ ...s, pending_reminder_hours: e.target.value }))}
              className={inp + ' w-full'} />
            <p className="text-zinc-600 text-xs mt-1">One friendly payment reminder is emailed/texted at this age.</p>
          </div>
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Auto-Cancel After (hours)</label>
            <input type="number" min="1" step="1" placeholder="72" value={settings.pending_autocancel_hours}
              onChange={e => setSettings(s => ({ ...s, pending_autocancel_hours: e.target.value }))}
              className={inp + ' w-full'} />
            <p className="text-zinc-600 text-xs mt-1">Still unpaid at this age → cancelled, stock released, customer notified.</p>
          </div>
        </div>
        <button onClick={savePendingAutomation} disabled={pendingBusy}
          className={`px-5 py-2 text-sm font-bold rounded-xl transition-colors ${pendingSaved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white'}`}>
          {pendingSaved ? '✓ Saved' : pendingBusy ? 'Saving...' : 'Save Timers'}
        </button>
      </div>

      {/* Post-Delivery Review Email */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
        <div>
          <div className="text-white font-bold text-sm">Post-Delivery Review Email</div>
          <div className="text-zinc-500 text-xs mt-0.5">A friendly thank-you / review request is auto-sent to customers this many days after their order is delivered.</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Send After (days)</label>
            <input type="number" min="0" step="1" placeholder="3" value={settings.review_request_delay_days}
              onChange={e => setSettings(s => ({ ...s, review_request_delay_days: e.target.value }))}
              className={inp + ' w-full'} />
            <p className="text-zinc-600 text-xs mt-1">Days after delivery to send the thank-you.</p>
          </div>
          <div>
            <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Thank-You Promo Code <span className="text-zinc-600 normal-case font-normal">(optional)</span></label>
            <input type="text" placeholder="e.g. THANKYOU10" value={settings.review_promo_code}
              onChange={e => setSettings(s => ({ ...s, review_promo_code: e.target.value.toUpperCase() }))}
              className={inp + ' w-full uppercase'} />
            <p className="text-zinc-600 text-xs mt-1">Shown in the email to encourage a repeat order. Leave blank for none.</p>
          </div>
        </div>
        <button onClick={saveReviewSettings} disabled={reviewBusy}
          className={`px-5 py-2 text-sm font-bold rounded-xl transition-colors ${reviewSaved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white'}`}>
          {reviewSaved ? '✓ Saved' : reviewBusy ? 'Saving...' : 'Save Review Settings'}
        </button>
      </div>

      {/* OneDrive Backup */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white font-bold text-sm flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
              OneDrive Backup
            </div>
            <div className="text-zinc-500 text-xs mt-0.5">Auto-saves every order, status change &amp; subscriber to your OneDrive</div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${settings.onedrive_connected ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-zinc-700/60 text-zinc-500 border-zinc-600/40'}`}>
            {settings.onedrive_connected ? '● Connected' : '○ Not connected'}
          </span>
        </div>

        {settings.onedrive_connected ? (
          <div className="space-y-2">
            <div className="bg-zinc-800/50 rounded-xl px-3 py-2.5 text-xs text-zinc-400 space-y-1">
              <div className="font-semibold text-zinc-300 mb-1">What gets saved automatically:</div>
              <div>📄 <strong>Orders:</strong> prymelabs-cc/Store Operations/Orders/YYYY-MM/</div>
              <div>📊 <strong>Monthly ledger:</strong> prymelabs-cc/Store Operations/Finance/</div>
              <div>🔄 <strong>Status updates:</strong> prymelabs-cc/Store Operations/Status Updates/</div>
              <div>👤 <strong>Subscribers:</strong> prymelabs-cc/Store Operations/Customers/</div>
            </div>
            <button
              disabled={odBusy}
              onClick={async () => {
                if (!confirm('Disconnect OneDrive backup? No files will be deleted.')) return
                setOdBusy(true)
                try {
                  await fetch('/api/admin/onedrive-auth', {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${adminToken}` },
                  })
                  showToast('OneDrive disconnected', 'info')
                  load()
                } catch { showToast('Error disconnecting', 'error') }
                finally { setOdBusy(false) }
              }}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-400 text-xs font-bold rounded-xl transition-colors border border-zinc-700">
              Disconnect OneDrive
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-zinc-800/50 rounded-xl px-3 py-2.5 text-xs text-zinc-500 leading-relaxed">
              Requires two Cloudflare secrets: <code className="text-zinc-300 bg-zinc-700 px-1 rounded">ONEDRIVE_CLIENT_ID</code> and <code className="text-zinc-300 bg-zinc-700 px-1 rounded">ONEDRIVE_CLIENT_SECRET</code> — then click Connect below.
            </div>
            <button
              disabled={odBusy}
              onClick={async () => {
                setOdBusy(true)
                try {
                  const res = await fetch('/api/admin/onedrive-auth', {
                    headers: { Authorization: `Bearer ${adminToken}` },
                  })
                  const data = await res.json()
                  if (data.auth_url) {
                    window.location.href = data.auth_url
                  } else {
                    showToast(data.error || 'Could not get auth URL', 'error')
                    setOdBusy(false)
                  }
                } catch { showToast('Network error', 'error'); setOdBusy(false) }
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
              {odBusy ? 'Redirecting…' : 'Connect OneDrive'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tax Records Tab ──────────────────────────────────────────────────────────

function TaxRecordsTab({ data, loading }) {
  const [filter, setFilter] = useState('all')
  const orders = data?.orders || []

  const taxed = orders.filter(o => Number(o.tax_amount) > 0 && !['cancelled', 'refunded'].includes(o.status))
  const exempt = orders.filter(o => Number(o.tax_amount) === 0 && !['cancelled', 'refunded'].includes(o.status))

  const display = filter === 'taxed' ? taxed : filter === 'exempt' ? exempt : [...taxed, ...exempt].sort((a, b) => b.created_at - a.created_at)

  const totalTaxCollected = taxed.reduce((s, o) => s + Number(o.tax_amount), 0)
  const totalTaxable = taxed.reduce((s, o) => s + (Number(o.order_total) || Number(o.subtotal)), 0)

  const FILTERS = [
    { id: 'all', label: 'All Orders', count: taxed.length + exempt.length },
    { id: 'taxed', label: 'Taxed', count: taxed.length },
    { id: 'exempt', label: 'Tax Exempt', count: exempt.length },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1.5">Taxed Orders</div>
          <div className="text-2xl font-black text-white">{taxed.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1.5">Tax Collected</div>
          <div className="text-2xl font-black text-white">${totalTaxCollected.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 col-span-2 sm:col-span-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Exempt Orders</div>
          <div className="text-2xl font-black text-white">{exempt.length}</div>
        </div>
      </div>

      <div className="flex gap-1.5">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 ${filter === f.id ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
            {f.label}
            <span className={`text-xs rounded-full px-1.5 ${filter === f.id ? 'bg-white/20' : 'bg-zinc-700'}`}>{f.count}</span>
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="text-center py-20 text-zinc-600">Loading...</div>
      ) : display.length === 0 ? (
        <div className="text-center py-20 text-zinc-600 text-sm">No orders in this category yet.</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3">Order</th>
                <th className="text-left text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3 hidden md:table-cell">Customer</th>
                <th className="text-left text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Date</th>
                <th className="text-right text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3">Subtotal</th>
                <th className="text-right text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Shipping</th>
                <th className="text-right text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3">Tax</th>
                <th className="text-right text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3">Total</th>
                <th className="text-center text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {display.map(o => {
                const isTaxed = Number(o.tax_amount) > 0
                const displayTotal = o.order_total > 0 ? o.order_total : o.subtotal
                return (
                  <tr key={o.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white font-bold text-xs flex items-center gap-1.5">
                        {o.order_number}
                        {isWillCallOrder(o) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold" title="Will Call — pickup">🏷️ WC</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">{o.customer_name}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs hidden lg:table-cell">{formatDate(o.created_at)}</td>
                    <td className="px-4 py-3 text-right text-white">${Number(o.subtotal).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-zinc-400 hidden sm:table-cell">
                      {Number(o.shipping_cost) > 0 ? `$${Number(o.shipping_cost).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isTaxed ? (
                        <span className="text-blue-400 font-semibold">${Number(o.tax_amount).toFixed(2)}</span>
                      ) : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-400 font-black">${Number(displayTotal).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      {isTaxed
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-semibold">Taxed</span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-400 font-semibold">Exempt</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Announcements Tab ───────────────────────────────────────────────────────

function AnnouncementsTab() {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')
  const adminToken = sessionStorage.getItem('pl_admin_token')

  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) { setErr('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { setErr('Image must be under 5MB for email embedding. Use a URL for larger images.'); return }
    const reader = new FileReader()
    reader.onload = (e) => { setImagePreview(e.target.result); setImageUrl(e.target.result) }
    reader.readAsDataURL(file)
  }

  const sendTest = async () => {
    if (!subject.trim() || !message.trim()) { setErr('Subject and message required'); return }
    if (!testEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())) { setErr('Enter a valid test email address'); return }
    setTestBusy(true); setErr(''); setResult(null)
    try {
      const res = await fetch('/api/admin/announce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          preview_text: preview.trim() || undefined,
          image_url: imageUrl.trim() || undefined,
          test_email: testEmail.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Failed to send test'); return }
      setResult({ test: true, to: testEmail.trim() })
    } catch { setErr('Network error') }
    finally { setTestBusy(false) }
  }

  const send = async () => {
    if (!subject.trim() || !message.trim()) { setErr('Subject and message required'); return }
    if (!confirm(`Send this announcement to all subscribed users?`)) return
    setBusy(true); setErr(''); setResult(null)
    try {
      const res = await fetch('/api/admin/announce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          preview_text: preview.trim() || undefined,
          image_url: imageUrl.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Failed to send'); return }
      setResult(data)
      setSubject(''); setMessage(''); setPreview(''); setImageUrl(''); setImagePreview('')
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div>
          <div className="text-white font-bold text-sm mb-1">Send Announcement</div>
          <p className="text-zinc-500 text-xs">Sends an email to all subscribed customers. Customers can unsubscribe in their orders page.</p>
        </div>

        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Subject Line *</label>
          <input type="text" placeholder="🔥 New Products Just Dropped!" value={subject} onChange={e => setSubject(e.target.value)}
            className={inp + ' w-full'} />
        </div>
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Preview Text</label>
          <input type="text" placeholder="Short preview shown in inbox (optional)" value={preview} onChange={e => setPreview(e.target.value)}
            className={inp + ' w-full'} />
        </div>

        {/* Image upload */}
        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Image (optional)</label>
          <div className="space-y-2">
            <input type="url" placeholder="Paste image URL (https://...)" value={imageUrl.startsWith('data:') ? '' : imageUrl}
              onChange={e => { setImageUrl(e.target.value); setImagePreview(e.target.value) }}
              className={inpSm + ' w-full'} />
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleImageFile(e.dataTransfer.files[0]) }}
              className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer ${dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-600'}`}
              onClick={() => document.getElementById('announce-img-input').click()}>
              <input id="announce-img-input" type="file" accept="image/*" className="hidden"
                onChange={e => handleImageFile(e.target.files[0])} />
              {imagePreview && (imagePreview.startsWith('data:') || imageUrl) ? (
                <div className="space-y-2">
                  <img src={imagePreview || imageUrl} alt="Preview" className="max-h-32 mx-auto rounded-lg object-contain" />
                  <button type="button" onClick={e => { e.stopPropagation(); setImageUrl(''); setImagePreview('') }}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors">Remove image</button>
                </div>
              ) : (
                <div>
                  <svg className="w-6 h-6 text-zinc-600 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-zinc-500 text-xs">Drop an image here or click to upload</p>
                  <p className="text-zinc-600 text-xs mt-0.5">Max 5MB for direct upload · Use URL for larger images</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Message *</label>
          <textarea rows={6} placeholder="Write your promotion or announcement here..." value={message} onChange={e => setMessage(e.target.value)}
            className={inp + ' w-full resize-none'} />
          <p className="text-zinc-600 text-xs mt-1">Use line breaks for paragraphs. A "Shop Now" button is automatically added.</p>
        </div>

        {err && <div className="text-red-400 text-sm">{err}</div>}
        {result && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
            <div className="text-green-400 font-bold text-sm">{result.test ? 'Test sent!' : 'Sent successfully!'}</div>
            <div className="text-zinc-400 text-xs mt-0.5">
              {result.test ? `Preview emailed to ${result.to}. Check your inbox.` : `${result.sent} of ${result.total} emails delivered.`}
            </div>
          </div>
        )}

        {/* Send a preview to yourself first */}
        <div className="border-t border-zinc-800 pt-4">
          <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Test it first (sends to one address only)</label>
          <div className="flex gap-2 flex-wrap">
            <input type="email" placeholder="your@email.com" value={testEmail} onChange={e => setTestEmail(e.target.value)}
              className={inpSm + ' flex-1 min-w-[200px]'} />
            <button onClick={sendTest} disabled={testBusy || !subject.trim() || !message.trim()}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors whitespace-nowrap">
              {testBusy ? 'Sending…' : '✉️ Send Test'}
            </button>
          </div>
          <p className="text-zinc-600 text-xs mt-1">Only this address gets it — subscribers are not emailed.</p>
        </div>

        <button onClick={send} disabled={busy || !subject.trim() || !message.trim()}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors">
          {busy ? 'Sending...' : '📣 Send to All Subscribers'}
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Notes</div>
        <ul className="text-zinc-400 text-sm space-y-1.5">
          <li>· Only customers with accounts who have not unsubscribed will receive the email.</li>
          <li>· Each email is personalized with the customer's name.</li>
          <li>· An unsubscribe link is included in every email pointing to their orders page.</li>
        </ul>
      </div>
    </div>
  )
}

// ─── Suggestions Tab ──────────────────────────────────────────────────────────

function SuggestionsTab() {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/suggestions', {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const d = await res.json()
      setSuggestions(d.suggestions || [])
    } catch {}
    finally { setLoading(false) }
  }, [adminToken])

  useEffect(() => { load() }, [load])

  const toggleRead = async (s) => {
    setBusy(true)
    try {
      await fetch('/api/admin/suggestions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: s.id, is_read: !s.is_read }),
      })
      setSuggestions(prev => prev.map(x => x.id === s.id ? { ...x, is_read: !s.is_read } : x))
      showToast(s.is_read ? 'Marked as unread' : '✓ Marked as read', 'info')
    } catch {}
    finally { setBusy(false) }
  }

  const deleteSuggestion = async (id) => {
    if (!confirm('Delete this suggestion?')) return
    setBusy(true)
    try {
      await fetch('/api/admin/suggestions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id }),
      })
      setSuggestions(prev => prev.filter(x => x.id !== id))
      showToast('Suggestion deleted', 'info')
    } catch {}
    finally { setBusy(false) }
  }

  const unreadCount = suggestions.filter(s => !s.is_read).length

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            💡 Customer Suggestions
            {unreadCount > 0 && (
              <span className="bg-blue-600 text-white text-xs font-black px-2 py-0.5 rounded-full">{unreadCount} new</span>
            )}
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5">Feedback submitted by customers from the storefront.</p>
        </div>
        <button onClick={load} className="text-zinc-500 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition-colors" title="Refresh">
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-zinc-600">Loading...</div>
      ) : suggestions.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <div className="text-zinc-600 text-4xl mb-3">💬</div>
          <div className="text-zinc-500 text-sm">No suggestions yet. They will appear here once customers submit feedback.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map(s => (
            <div key={s.id}
              className={`bg-zinc-900 border rounded-2xl p-4 transition-colors ${s.is_read ? 'border-zinc-800' : 'border-blue-700/50 bg-blue-950/10'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-white font-semibold text-sm">{s.customer_name}</span>
                    {!s.is_read && (
                      <span className="text-xs bg-blue-600/20 border border-blue-600/40 text-blue-400 px-2 py-0.5 rounded-full font-semibold">New</span>
                    )}
                    <span className="text-zinc-600 text-xs">{formatDate(s.created_at)}</span>
                  </div>
                  <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{s.message}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => toggleRead(s)}
                    disabled={busy}
                    title={s.is_read ? 'Mark as unread' : 'Mark as read'}
                    className={`p-1.5 rounded-lg transition-colors ${s.is_read ? 'text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10' : 'text-blue-400 hover:text-zinc-400 hover:bg-zinc-800'}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {s.is_read
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      }
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteSuggestion(s.id)}
                    disabled={busy}
                    title="Delete suggestion"
                    className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Trash Tab ────────────────────────────────────────────────────────────────

function TrashTab() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/trash-orders', { headers: { Authorization: `Bearer ${adminToken}` } })
      const d = await res.json()
      setOrders(d.orders || [])
    } catch {}
    finally { setLoading(false) }
  }, [adminToken])

  useEffect(() => { load() }, [load])

  const action = async (orderId, act) => {
    if (act === 'permanent' && !confirm('Permanently delete this order? This cannot be undone.')) return
    setBusy(true)
    try {
      await fetch('/api/admin/delete-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ order_id: orderId, action: act }),
      })
      showToast(act === 'restore' ? '✓ Order restored' : 'Order permanently deleted', act === 'restore' ? 'success' : 'info')
      load()
    } catch {}
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-lg">Trash</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Soft-deleted orders. Restore to move back, or permanently delete.</p>
        </div>
        <button onClick={load} className="text-zinc-500 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition-colors" title="Refresh">
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-zinc-600">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <div className="text-zinc-600 text-4xl mb-3">🗑️</div>
          <div className="text-zinc-500 text-sm">Trash is empty.</div>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3">Order</th>
                <th className="text-left text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3 hidden md:table-cell">Customer</th>
                <th className="text-right text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3">Total</th>
                <th className="text-center text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Status</th>
                <th className="text-center text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Deleted</th>
                <th className="text-right text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {orders.map(o => {
                const displayTotal = o.order_total > 0 ? o.order_total : o.subtotal
                return (
                  <tr key={o.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white font-bold text-xs">{o.order_number}</div>
                      <div className="text-zinc-500 text-xs capitalize">{o.payment_method}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="text-zinc-300 text-xs">{o.customer_name}</div>
                      <div className="text-zinc-600 text-xs">{o.customer_email}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-amber-400 font-black">${Number(displayTotal).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[o.status] || STATUS_COLORS.pending}`}>
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-500 text-xs hidden lg:table-cell">{formatDate(o.deleted_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => action(o.id, 'restore')} disabled={busy}
                          className="text-xs px-2.5 py-1 bg-green-600/20 hover:bg-green-600/30 border border-green-600/40 text-green-400 rounded-lg font-semibold transition-colors disabled:opacity-40">
                          Restore
                        </button>
                        <button onClick={() => action(o.id, 'permanent')} disabled={busy}
                          className="text-xs px-2.5 py-1 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-400 rounded-lg font-semibold transition-colors disabled:opacity-40">
                          Delete Forever
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Certificates of Analysis (COA) Tab ────────────────────────────────────────

function CoaForm({ initial, onSaved, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const save = async () => {
    if (!title.trim()) { setErr('Title is required'); return }
    if (!initial && !file) { setErr('A file is required'); return }
    setBusy(true); setErr('')
    try {
      const form = new FormData()
      form.append('title', title.trim())
      form.append('description', description.trim())
      if (initial) {
        form.append('id', initial.id)
        form.append('enabled', initial.enabled ? '1' : '0')
      }
      if (file) form.append('file', file)

      const res = await fetch('/api/admin/coa', {
        method: initial ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: form,
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Save failed'); return }
      showToast(initial ? '✓ Certificate updated' : '✓ Certificate added')
      onSaved()
    } catch { setErr('Network error') }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-zinc-900/80 border border-zinc-700 rounded-xl p-4 space-y-3">
      <div>
        <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Title (matches product name) *</label>
        <input type="text" placeholder="e.g. BPC-157" value={title} onChange={e => setTitle(e.target.value)} className={inpSm + ' w-full'} />
      </div>
      <div>
        <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Description</label>
        <textarea rows={2} placeholder="Batch info, testing notes, etc." value={description} onChange={e => setDescription(e.target.value)} className={inpSm + ' w-full resize-none'} />
      </div>
      <div>
        <label className="block text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">
          {initial ? 'Replace File (optional)' : 'File *'}
        </label>
        <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}
          className="block w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-zinc-700 file:text-white hover:file:bg-zinc-600" />
      </div>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">
          {busy ? 'Saving...' : initial ? 'Update' : 'Add Certificate'}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-bold rounded-lg transition-colors">Cancel</button>
      </div>
    </div>
  )
}

function CoaCard({ doc, productNames, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const linked = productNames.has(doc.title.trim().toLowerCase())

  const toggleEnabled = async () => {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('id', doc.id)
      form.append('title', doc.title)
      form.append('description', doc.description || '')
      form.append('enabled', doc.enabled ? '0' : '1')
      await fetch('/api/admin/coa', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: form,
      })
      onChanged()
    } catch {}
    finally { setBusy(false) }
  }

  const remove = async () => {
    if (!confirm(`Delete the certificate "${doc.title}"? This cannot be undone.`)) return
    await fetch('/api/admin/coa', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: doc.id }),
    })
    showToast('Certificate deleted', 'info')
    onChanged()
  }

  if (editing) {
    return <CoaForm initial={doc} onSaved={() => { setEditing(false); onChanged() }} onCancel={() => setEditing(false)} />
  }

  return (
    <div className="bg-zinc-900/80 border border-zinc-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <a href={`/api/coa-file/${doc.file_key}`} target="_blank" rel="noreferrer"
        className="shrink-0 w-14 h-14 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl hover:border-blue-500 transition-colors">
        {doc.file_type?.startsWith('image/') ? '🖼️' : '📄'}
      </a>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-bold text-sm">{doc.title}</span>
          {linked
            ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30 font-semibold">✓ Linked to product</span>
            : <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-400 font-semibold">⚠ No matching product</span>}
        </div>
        {doc.description && <p className="text-zinc-500 text-xs mt-1 line-clamp-2">{doc.description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={toggleEnabled} disabled={busy}
          className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors disabled:opacity-40 ${doc.enabled ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'bg-zinc-700/60 text-zinc-400 border border-zinc-600/40'}`}>
          {doc.enabled ? 'On' : 'Off'}
        </button>
        <button onClick={() => setEditing(true)} className="text-xs px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg font-semibold transition-colors">Edit</button>
        <button onClick={remove} className="text-xs px-2.5 py-1 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-400 rounded-lg font-semibold transition-colors">Delete</button>
      </div>
    </div>
  )
}

function CoaTab() {
  const [docs, setDocs] = useState([])
  const [productNames, setProductNames] = useState(new Set())
  const [productsByName, setProductsByName] = useState(new Map())
  const [coaEnabled, setCoaEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [globalBusy, setGlobalBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(new Set())
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [docsRes, productsRes, settingsRes] = await Promise.all([
        fetch('/api/admin/coa', { headers: { Authorization: `Bearer ${adminToken}` } }),
        fetch('/api/admin/products', { headers: { Authorization: `Bearer ${adminToken}` } }),
        fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${adminToken}` } }),
      ])
      const docsData = await docsRes.json()
      const productsData = await productsRes.json()
      const settingsData = await settingsRes.json()
      const byName = new Map((productsData.products || []).map(p => [p.name.trim().toLowerCase(), p]))
      setDocs(docsData.documents || [])
      setProductsByName(byName)
      setProductNames(new Set(byName.keys()))
      setCoaEnabled(settingsData.settings?.coa_enabled === '1')
    } catch {}
    finally { setLoading(false) }
  }, [adminToken])

  useEffect(() => { load() }, [load])

  const toggleFolder = (cat) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  // Group certificates into folders by their linked product's category
  const folders = new Map()
  for (const d of docs) {
    const product = productsByName.get(d.title.trim().toLowerCase())
    const cat = product?.category || 'Uncategorized'
    if (!folders.has(cat)) folders.set(cat, [])
    folders.get(cat).push(d)
  }
  const orderedCats = [...CATEGORIES, 'Uncategorized'].filter(c => folders.has(c))

  const toggleGlobal = async () => {
    setGlobalBusy(true)
    const next = !coaEnabled
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ updates: { coa_enabled: next ? '1' : '0' } }),
      })
      setCoaEnabled(next)
      showToast(next ? '✓ Certificates now visible in shop' : 'Certificates hidden from shop', next ? 'success' : 'info')
    } catch {}
    finally { setGlobalBusy(false) }
  }

  if (loading) return <div className="text-center py-20 text-zinc-600">Loading...</div>

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white font-bold text-lg">Certificates of Analysis</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Upload COA photos/PDFs. They auto-link to products with a matching name and appear in the product details modal.</p>
        </div>
        <button onClick={toggleGlobal} disabled={globalBusy}
          className={`text-sm px-3.5 py-2 rounded-xl font-bold transition-colors disabled:opacity-40 ${coaEnabled ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'bg-zinc-700/60 text-zinc-400 border border-zinc-600/40'}`}>
          {coaEnabled ? '✓ Visible in Shop' : 'Hidden from Shop'}
        </button>
      </div>

      {adding ? (
        <CoaForm onSaved={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />
      ) : (
        <button onClick={() => setAdding(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors">
          + Add Certificate
        </button>
      )}

      {docs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <div className="text-zinc-600 text-4xl mb-3">📄</div>
          <div className="text-zinc-500 text-sm">No certificates uploaded yet.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {orderedCats.map(cat => {
            const certs = folders.get(cat)
            const isOpen = !collapsed.has(cat)
            return (
              <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <button onClick={() => toggleFolder(cat)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 transition-colors text-left">
                  <span className="flex items-center gap-2 text-white font-bold text-sm">
                    <span className="text-lg">{isOpen ? '📂' : '📁'}</span>
                    {cat}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-400">{certs.length}</span>
                  </span>
                  <span className="text-zinc-500 text-sm transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
                </button>
                {isOpen && (
                  <div className="p-4 pt-0 space-y-3">
                    {certs.map(d => <CoaCard key={d.id} doc={d} productNames={productNames} onChanged={load} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Subscribers Tab ──────────────────────────────────────────────────────────

function SubscriberCard({ s, sevenDaysAgo, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: s.name || '', phone: s.phone || '', lang: s.lang || 'en', email_unsubscribed: !!s.email_unsubscribed })
  const [busy, setBusy] = useState(false)
  const [resetInfo, setResetInfo] = useState(null)
  const [copied, setCopied] = useState(false)
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()
  const isNew = s.created_at && s.created_at >= sevenDaysAgo

  const sendReset = async () => {
    if (!confirm(`Generate a password reset link for ${s.name}?\n\nIt will be emailed to ${s.email}, and you'll also get a copyable link to share directly (e.g. over the phone).`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/reset-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: s.id }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Could not create reset link', 'error'); return }
      setResetInfo(data)
      setCopied(false)
      showToast(data.emailed ? `✓ Reset link emailed to ${s.email}` : '✓ Reset link generated')
    } catch { showToast('Network error', 'error') }
    finally { setBusy(false) }
  }

  const copyResetLink = async () => {
    if (!resetInfo?.reset_url) return
    try { await navigator.clipboard.writeText(resetInfo.reset_url); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch {}
  }

  const startEdit = () => {
    setForm({ name: s.name || '', phone: s.phone || '', lang: s.lang || 'en', email_unsubscribed: !!s.email_unsubscribed })
    setEditing(true)
  }

  const save = async () => {
    if (!form.name.trim()) { showToast('Name cannot be empty', 'error'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/subscribers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: s.id, name: form.name.trim(), phone: form.phone.trim() || null, lang: form.lang, email_unsubscribed: form.email_unsubscribed }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Save failed', 'error'); return }
      showToast('✓ Subscriber updated')
      setEditing(false)
      onSaved?.()
    } catch { showToast('Network error', 'error') }
    finally { setBusy(false) }
  }

  const del = async () => {
    if (!confirm(`Delete ${s.name} (${s.email})?\n\nThis removes their account permanently. Order history is kept.`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/subscribers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: s.id }),
      })
      if (res.ok) { showToast(`${s.name} deleted`, 'info'); onDeleted?.() }
      else showToast('Failed to delete', 'error')
    } catch { showToast('Network error', 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-colors ${isNew ? 'border-green-500/30' : 'border-zinc-800'}`}>
      {/* ── Top row ── */}
      <div className="flex items-start gap-3 p-4">
        <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-blue-400 text-sm font-black">{s.name?.[0]?.toUpperCase() || '?'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-bold text-sm">{s.name}</span>
            {isNew && <span className="text-xs bg-green-500/20 border border-green-500/30 text-green-400 px-1.5 py-0.5 rounded-full font-semibold">New</span>}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold uppercase ${s.lang === 'es' ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30' : 'bg-zinc-700/40 text-zinc-500'}`}>{s.lang || 'en'}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold border ${s.email_unsubscribed ? 'bg-zinc-700/60 text-zinc-400 border-zinc-600/40' : 'bg-green-500/15 text-green-400 border-green-500/30'}`}>
              {s.email_unsubscribed ? 'Announce off' : 'Announce on'}
            </span>
          </div>
          <div className="text-zinc-500 text-xs mt-1">@{s.username}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <a href={`mailto:${s.email}`} className="text-blue-400 text-xs hover:text-blue-300 transition-colors truncate max-w-[200px]">{s.email}</a>
            {s.phone && <a href={`tel:${s.phone}`} className="text-zinc-400 text-xs hover:text-blue-400 transition-colors">{s.phone}</a>}
          </div>
          <div className="flex gap-3 mt-1.5 text-xs text-zinc-500">
            <span>{s.order_count || 0} order{s.order_count !== 1 ? 's' : ''}</span>
            {Number(s.total_spent || 0) > 0 && <span className="text-amber-400 font-semibold">${Number(s.total_spent).toFixed(2)} spent</span>}
            <span>Joined {formatDate(s.created_at)}</span>
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex gap-1.5 shrink-0">
          <button onClick={startEdit} disabled={busy}
            className="p-2.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-colors border border-transparent hover:border-blue-500/20 min-w-[40px] min-h-[40px] flex items-center justify-center"
            title="Edit subscriber">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={sendReset} disabled={busy}
            className="p-2.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-xl transition-colors border border-transparent hover:border-amber-500/20 min-w-[40px] min-h-[40px] flex items-center justify-center"
            title="Send password reset link">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </button>
          <button onClick={del} disabled={busy}
            className="p-2.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/20 min-w-[40px] min-h-[40px] flex items-center justify-center"
            title="Delete subscriber">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Reset link panel ── */}
      {resetInfo && (
        <div className="border-t border-zinc-800 bg-amber-500/5 p-4 space-y-2">
          <div className="text-amber-400 text-xs font-semibold uppercase tracking-wider">
            Password Reset Link {resetInfo.emailed && <span className="text-zinc-500 normal-case font-normal">· emailed to {s.email}</span>}
          </div>
          <div className="flex items-center gap-2">
            <input readOnly value={resetInfo.reset_url} onFocus={e => e.target.select()}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 text-xs font-mono" />
            <button onClick={copyResetLink}
              className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors shrink-0">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button onClick={() => setResetInfo(null)}
              className="px-2 py-2 text-zinc-500 hover:text-white text-xs transition-colors shrink-0">Done</button>
          </div>
          <p className="text-zinc-500 text-xs">Share this link with the customer if their email is unreachable. Expires in {resetInfo.expires_minutes} minutes; single use.</p>
        </div>
      )}

      {/* ── Edit panel ── */}
      {editing && (
        <div className="border-t border-zinc-800 bg-zinc-800/40 p-4 space-y-3">
          <div className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">Edit Subscriber</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-500 text-xs font-semibold mb-1">Name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={inp + ' w-full'} placeholder="Full name" />
            </div>
            <div>
              <label className="block text-zinc-500 text-xs font-semibold mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className={inp + ' w-full'} placeholder="+1 555-0000" />
            </div>
            <div>
              <label className="block text-zinc-500 text-xs font-semibold mb-1">Language</label>
              <select value={form.lang} onChange={e => setForm(f => ({ ...f, lang: e.target.value }))}
                className={inp + ' w-full cursor-pointer'}>
                <option value="en">🇺🇸 English</option>
                <option value="es">🇲🇽 Spanish</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-500 text-xs font-semibold mb-1">Announcements</label>
              <select value={form.email_unsubscribed ? 'off' : 'on'} onChange={e => setForm(f => ({ ...f, email_unsubscribed: e.target.value === 'off' }))}
                className={inp + ' w-full cursor-pointer'}>
                <option value="on">✅ On</option>
                <option value="off">🔕 Off</option>
              </select>
            </div>
          </div>
          <div className="bg-zinc-900/60 rounded-xl px-3 py-2 text-xs text-zinc-500">
            <span className="text-zinc-600">Email:</span> <span className="text-zinc-400">{s.email}</span>
            <span className="mx-2 text-zinc-700">·</span>
            <span className="text-zinc-600">Username:</span> <span className="text-zinc-400">@{s.username}</span>
            <span className="text-zinc-600 ml-2">(read-only)</span>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors min-h-[44px]">
              {busy ? 'Saving…' : '✓ Save Changes'}
            </button>
            <button onClick={() => setEditing(false)} disabled={busy}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-zinc-300 text-sm font-bold rounded-xl transition-colors min-h-[44px]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SubscribersTab({ onNewCount, onTotalCount }) {
  const [subscribers, setSubscribers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const adminToken = sessionStorage.getItem('pl_admin_token')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/subscribers', {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const d = await res.json()
      const list = d.subscribers || []
      setSubscribers(list)
      const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60
      onNewCount?.(list.filter(s => s.created_at && s.created_at >= sevenDaysAgo).length)
      onTotalCount?.(list.length)
    } catch {}
    finally { setLoading(false) }
  }, [adminToken, onNewCount, onTotalCount])

  useEffect(() => { load() }, [load])

  const now = Math.floor(Date.now() / 1000)
  const sevenDaysAgo = now - 7 * 24 * 60 * 60
  const newCount = subscribers.filter(s => s.created_at && s.created_at >= sevenDaysAgo).length
  const subscribedCount = subscribers.filter(s => !s.email_unsubscribed).length
  const esCount = subscribers.filter(s => s.lang === 'es').length

  const q = search.toLowerCase()
  const filtered = search
    ? subscribers.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.username?.toLowerCase().includes(q) ||
        s.phone?.toLowerCase().includes(q)
      )
    : subscribers

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={subscribers.length} color="text-blue-400" />
        <StatCard label="New (7d)" value={newCount} color="text-green-400" />
        <StatCard label="Announce On" value={subscribedCount} color="text-amber-400" />
        <StatCard label="ES" value={esCount} color="text-violet-400" />
      </div>

      {/* Search + refresh */}
      <div className="flex items-center gap-2">
        <input type="text" placeholder="Search name, email, phone, username…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm" />
        <button onClick={load} className="p-3 text-zinc-500 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors border border-zinc-800 min-w-[44px] min-h-[44px] flex items-center justify-center" title="Refresh">
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="text-center py-20 text-zinc-600">Loading subscribers…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">👥</div>
          <div className="text-zinc-500 text-sm">{search ? 'No subscribers match your search.' : 'No subscribers yet.'}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <SubscriberCard key={s.id} s={s} sevenDaysAgo={sevenDaysAgo} onSaved={load} onDeleted={load} />
          ))}
          <div className="text-xs text-zinc-600 text-center pt-1">
            {filtered.length} of {subscribers.length} subscriber{subscribers.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Completed Orders Tab ─────────────────────────────────────────────────────

function CompletedOrdersTab({ data, loading, onRefresh }) {
  const [search, setSearch] = useState('')
  const orders = (data?.orders || []).filter(o => o.status === 'completed')
  const q = search.toLowerCase()
  const filtered = orders.filter(o => !search || o.order_number?.toLowerCase().includes(q) || o.customer_name?.toLowerCase().includes(q) || o.customer_email?.toLowerCase().includes(q))
  const totalRevenue = orders.reduce((s, o) => s + Number(o.order_total || o.subtotal || 0), 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-emerald-400">Completed</div>
          <div className="text-3xl font-black text-white">{orders.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-amber-400">Revenue</div>
          <div className="text-3xl font-black text-white">${totalRevenue.toFixed(2)}</div>
        </div>
      </div>

      <input type="text" placeholder="Search completed orders..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm" />

      {loading && !data ? (
        <div className="text-center py-20 text-zinc-600">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <div className="text-zinc-600 text-4xl mb-3">✅</div>
          <div className="text-zinc-500 text-sm">{search ? 'No matching completed orders.' : 'No completed orders yet.'}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => <OrderRow key={order.id} order={order} onUpdate={onRefresh} onDelete={onRefresh} />)}
          <div className="text-xs text-zinc-600 text-center pt-1">{filtered.length} order{filtered.length !== 1 ? 's' : ''}</div>
        </div>
      )}
    </div>
  )
}

// ─── Cancelled & Refunded Tab ─────────────────────────────────────────────────

function CancelledOrdersTab({ data, loading, onRefresh }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const all = (data?.orders || []).filter(o => ['cancelled', 'refunded'].includes(o.status))
  const orders = filter === 'all' ? all : all.filter(o => o.status === filter)
  const q = search.toLowerCase()
  const filtered = orders.filter(o => !search || o.order_number?.toLowerCase().includes(q) || o.customer_name?.toLowerCase().includes(q) || o.customer_email?.toLowerCase().includes(q))
  const cancelledCount = all.filter(o => o.status === 'cancelled').length
  const refundedCount  = all.filter(o => o.status === 'refunded').length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-red-400">Total</div>
          <div className="text-3xl font-black text-white">{all.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-red-400">Cancelled</div>
          <div className="text-3xl font-black text-white">{cancelledCount}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-400">Refunded</div>
          <div className="text-3xl font-black text-white">{refundedCount}</div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[{id:'all',label:'All'},{id:'cancelled',label:'Cancelled'},{id:'refunded',label:'Refunded'}].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${filter === f.id ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
            {f.label}
          </button>
        ))}
        <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-40 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-1.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors text-sm" />
      </div>

      {loading && !data ? (
        <div className="text-center py-20 text-zinc-600">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <div className="text-zinc-600 text-4xl mb-3">❌</div>
          <div className="text-zinc-500 text-sm">{search ? 'No matching orders.' : 'No cancelled or refunded orders.'}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => <OrderRow key={order.id} order={order} onUpdate={onRefresh} onDelete={onRefresh} />)}
          <div className="text-xs text-zinc-600 text-center pt-1">{filtered.length} order{filtered.length !== 1 ? 's' : ''}</div>
        </div>
      )}
    </div>
  )
}

// ─── Main AdminPage ───────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const adminToken = sessionStorage.getItem('pl_admin_token')

  useEffect(() => {
    fetch('/api/admin/analytics', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [adminToken])

  if (loading) return <div className="text-center py-20 text-zinc-600">Crunching numbers…</div>
  if (!data?.totals) return <div className="text-center py-20 text-zinc-600">No data yet.</div>

  const t = data.totals
  const maxUnits = Math.max(1, ...(data.products || []).map(p => p.units))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Orders" value={t.orders} color="text-sky-400" />
        <StatCard label="Avg Order Value" value={`$${t.aov.toFixed(2)}`} color="text-amber-400" />
        <StatCard label="Customers" value={t.customers} color="text-blue-400" />
        <StatCard label="Repeat Rate" value={`${t.repeatRate}%`} color="text-emerald-400" />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="text-white font-bold text-sm mb-3">🏆 Best Sellers</div>
        {(data.products || []).length === 0 ? (
          <div className="text-zinc-600 text-sm text-center py-6">No sales yet.</div>
        ) : (
          <div className="space-y-2">
            {data.products.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-zinc-600 text-xs w-5 shrink-0 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white text-sm truncate">{p.name}{p.size ? <span className="text-zinc-500"> ({p.size})</span> : ''}</span>
                    <span className="text-zinc-400 text-xs shrink-0">{p.units} sold · ${p.revenue.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(p.units / maxUnits) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-zinc-600 text-xs">Based on all orders except cancelled/refunded. {t.repeatCustomers} of {t.customers} customers have ordered more than once.</p>
    </div>
  )
}

function ReviewsTab() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/reviews', { headers: { Authorization: `Bearer ${adminToken}` } })
      const data = await res.json()
      setReviews(data.reviews || [])
    } catch {} finally { setLoading(false) }
  }, [adminToken])
  useEffect(() => { load() }, [load])

  const act = async (id, status) => {
    await fetch('/api/admin/reviews', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ id, status }) })
    showToast(status === 'approved' ? '✓ Review approved — now visible' : `Review ${status}`, status === 'rejected' ? 'warning' : 'success')
    load()
  }
  const del = async (id) => {
    if (!confirm('Delete this review permanently?')) return
    await fetch('/api/admin/reviews', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ id }) })
    showToast('Review deleted', 'info')
    load()
  }

  const STATUS = { pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', approved: 'bg-green-500/15 text-green-400 border-green-500/30', rejected: 'bg-red-500/15 text-red-400 border-red-500/30' }

  if (loading) return <div className="text-center py-20 text-zinc-600">Loading reviews…</div>
  if (reviews.length === 0) return <div className="text-center py-20 text-zinc-600">No reviews yet. They appear here for approval once customers submit them.</div>

  return (
    <div className="space-y-3">
      {reviews.map(r => (
        <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-amber-400 text-sm">{'★'.repeat(r.rating)}<span className="text-zinc-700">{'★'.repeat(5 - r.rating)}</span></span>
                <span className="text-white font-bold text-sm">{r.product_name || `#${r.product_id}`}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS[r.status] || ''}`}>{r.status}</span>
              </div>
              <div className="text-zinc-500 text-xs mt-0.5">{r.customer_name} · {formatDate(r.created_at)}</div>
              {r.comment && <p className="text-zinc-300 text-sm mt-2">{r.comment}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              {r.status !== 'approved' && <button onClick={() => act(r.id, 'approved')} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg">Approve</button>}
              {r.status !== 'rejected' && <button onClick={() => act(r.id, 'rejected')} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-lg">Reject</button>}
              <button onClick={() => del(r.id)} className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-400 text-xs font-bold rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Will Call Tab ────────────────────────────────────────────────────────────
// Create an in-store pickup order for a walk-in / phoned-in customer and email
// them the invoice with payment instructions. Pricing + stock are enforced
// server-side by /api/admin/will-call-order — this form is just the entry UI.
function WillCallTab({ onOrderCreated }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // pricing knobs mirrored from settings so the preview matches the charged total
  const [cfg, setCfg] = useState({ saleConfig: {}, masterAdjust: 0, taxRate: 0 })
  const [cart, setCart] = useState({}) // product_id -> { product, qty }
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [method, setMethod] = useState('zelle')
  const [taxExempt, setTaxExempt] = useState(false)
  const [language, setLanguage] = useState('en')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)
  // Customer base — autofill picker sourced from subscribed customers
  const [customers, setCustomers] = useState([])
  const [custQuery, setCustQuery] = useState('')
  const [custOpen, setCustOpen] = useState(false)
  const [pickedId, setPickedId] = useState(null)
  // Promo / discount code
  const [promos, setPromos] = useState([])
  const [promoInput, setPromoInput] = useState('')
  const [activeCode, setActiveCode] = useState('')   // the store's advertised promo, auto-applied
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const showToast = useToast()

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const [pRes, sRes, cRes, prRes] = await Promise.all([
          fetch('/api/admin/products', { headers: { Authorization: `Bearer ${adminToken}` } }),
          fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${adminToken}` } }),
          fetch('/api/admin/subscribers', { headers: { Authorization: `Bearer ${adminToken}` } }),
          fetch('/api/admin/promos', { headers: { Authorization: `Bearer ${adminToken}` } }),
        ])
        const pd = await pRes.json()
        const sd = await sRes.json()
        const cd = await cRes.json()
        const prd = await prRes.json()
        setProducts(pd.products || [])
        setCustomers((cd.subscribers || []).filter(c => c.email))
        setPromos(prd.codes || [])
        // Auto-apply the currently advertised promo code (the storefront banner
        // code) when the promotion is live — the admin can clear or override it.
        const bannerOn = sd.settings?.banner_enabled === '1'
        const bannerCode = (sd.settings?.banner_code || '').toUpperCase().trim()
        if (bannerOn && bannerCode) { setActiveCode(bannerCode); setPromoInput(bannerCode) }
        setCfg({
          saleConfig: resolveSaleConfig(sd.settings || {}),
          masterAdjust: Number(sd.settings?.master_price_adjust) || 0,
          taxRate: Number(sd.settings?.tax_rate) || 0,
        })
      } catch {}
      finally { setLoading(false) }
    })()
  }, [adminToken])

  // Filter the customer base by the picker query (name / email / phone). With no
  // query, surface the most recent customers so the field acts as a dropdown.
  const custMatches = (() => {
    const q = custQuery.trim().toLowerCase()
    const list = q
      ? customers.filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q))
      : customers
    return list.slice(0, 8)
  })()

  const pickCustomer = (c) => {
    setName(c.name || '')
    setEmail(c.email || '')
    setPhone(c.phone || '')
    setLanguage(c.lang === 'es' ? 'es' : 'en')
    setPickedId(c.id)
    setCustQuery(c.name || c.email || '')
    setCustOpen(false)
    setResult(null)
    setErr('')
  }

  const clearCustomer = () => {
    setName(''); setEmail(''); setPhone(''); setPickedId(null); setCustQuery('')
  }

  // Same price math the server applies (see effectivePrice in will-call-order.js)
  const effectivePrice = (p) => {
    const noDiscount = p.no_discount === 1 || p.bundle_of_product_id != null
    if (noDiscount) return Math.max(0.01, Number(p.price))
    let price = Math.max(0.01, Number(p.price) + cfg.masterAdjust)
    const saleAmt = saleAmountForDept(cfg.saleConfig, p.department)
    if (saleAmt > 0) price = Math.max(0.01, price - saleAmt)
    return Number(price.toFixed(2))
  }

  const addItem = (p) => {
    setResult(null)
    setCart(c => {
      const existing = c[p.id]
      return { ...c, [p.id]: { product: p, qty: (existing?.qty || 0) + 1 } }
    })
  }
  const setQty = (id, qty) => {
    setCart(c => {
      if (qty <= 0) { const { [id]: _, ...rest } = c; return rest }
      return { ...c, [id]: { ...c[id], qty: Math.min(100, qty) } }
    })
  }

  const lines = Object.values(cart)
  const isNoDiscount = (p) => p.no_discount === 1 || p.bundle_of_product_id != null
  const subtotal = Number(lines.reduce((s, l) => s + effectivePrice(l.product) * l.qty, 0).toFixed(2))
  // Cases/bundles are excluded from promo discounts (mirrors the server)
  const discountableSubtotal = Number(lines.reduce((s, l) => s + (isNoDiscount(l.product) ? 0 : effectivePrice(l.product) * l.qty), 0).toFixed(2))

  // Validate the entered code against the loaded promo list — same rules the
  // server enforces. Returns { discount, no_tax } or an { error } to show.
  const promoResult = (() => {
    const code = promoInput.trim().toUpperCase()
    if (!code) return { empty: true }
    const p = promos.find(x => (x.code || '').toUpperCase() === code)
    if (!p || p.is_active !== 1) return { error: 'Invalid or inactive code' }
    const now = Math.floor(Date.now() / 1000)
    if (p.expires_at && Number(p.expires_at) < now) return { error: 'Code has expired' }
    if (p.max_uses > 0 && p.used_count >= p.max_uses) return { error: 'Code usage limit reached' }
    if (p.min_order_amount > 0 && discountableSubtotal < p.min_order_amount) {
      return { error: `Min order $${Number(p.min_order_amount).toFixed(2)} for this code` }
    }
    const raw = p.discount_type === 'percent'
      ? discountableSubtotal * p.discount_value / 100
      : Math.min(discountableSubtotal, p.discount_value)
    const discount = Number(Math.max(0, Math.min(discountableSubtotal, raw)).toFixed(2))
    return { code: p.code, discount, no_tax: p.no_tax === 1, label: p.discount_type === 'percent' ? `${p.discount_value}% off` : `$${Number(p.discount_value).toFixed(2)} off` }
  })()

  const discountAmount = promoResult.discount || 0
  const taxRate = (taxExempt || promoResult.no_tax) ? 0 : cfg.taxRate
  const taxAmount = Number(((subtotal - discountAmount) * taxRate).toFixed(2))
  const total = Number((subtotal - discountAmount + taxAmount).toFixed(2))

  const filtered = products.filter(p => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (p.name || '').toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q) || (p.size || '').toLowerCase().includes(q)
  })

  const reset = () => {
    setCart({}); setName(''); setEmail(''); setPhone(''); setMethod('zelle')
    setTaxExempt(false); setLanguage('en'); setNotes(''); setSearch('')
    setCustQuery(''); setPickedId(null); setCustOpen(false)
    // Re-apply the active advertised code for the next order; clear otherwise
    setPromoInput(activeCode || '')
  }

  const submit = async () => {
    setErr('')
    if (!name.trim()) { setErr('Customer name is required'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('A valid customer email is required'); return }
    if (lines.length === 0) { setErr('Add at least one item'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/will-call-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_email: email.trim(),
          customer_phone: phone.trim() || undefined,
          items: lines.map(l => ({ product_id: l.product.id, size: l.product.size, qty: l.qty })),
          payment_method: method,
          tax_exempt: taxExempt,
          notes: notes.trim() || undefined,
          language,
          promo_code: promoResult.code || (promoInput.trim() || undefined),
        }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Failed to create order'); return }
      setResult(d)
      reset()
      showToast(d.emailed ? `✅ ${d.order_number} created — invoice emailed` : `✅ ${d.order_number} created`, 'success')
      onOrderCreated?.()
    } catch { setErr('Network error') }
    finally { setSubmitting(false) }
  }

  const PAY = [{ id: 'zelle', label: 'Zelle' }, { id: 'cashapp', label: 'Cash App' }, { id: 'venmo', label: 'Venmo' }]

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <h2 className="text-white font-bold text-base mb-0.5">🏷️ Will Call — Create Order</h2>
        <p className="text-zinc-500 text-sm">Build an in-store pickup order and email the customer their invoice with payment instructions.</p>
      </div>

      {result && (
        <div className="mb-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl">✅</span>
          <div className="min-w-0">
            <div className="text-emerald-300 font-bold text-sm">Order {result.order_number} created</div>
            <div className="text-zinc-400 text-xs mt-0.5">
              {result.discount_amount > 0 && <span className="text-emerald-400">{result.promo_code} −${Number(result.discount_amount).toFixed(2)} · </span>}
              Total ${Number(result.order_total).toFixed(2)} · {result.emailed ? 'Invoice emailed to customer' : (result.email_error ? 'Email failed — check email settings' : 'Email skipped (not configured)')}
            </div>
            {result.promo_rejected && <div className="text-amber-400 text-xs mt-1">⚠ The discount code didn’t qualify and was not applied.</div>}
            <div className="text-zinc-500 text-xs mt-1">It now appears in the Orders tab as “pending”. Mark it paid once payment lands.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Left: product picker ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="text-white font-bold text-sm mb-3">1 · Add Items</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-blue-500 mb-3" />
          {loading ? (
            <div className="text-zinc-500 text-sm py-8 text-center">Loading products…</div>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
              {filtered.length === 0 && <div className="text-zinc-600 text-sm py-6 text-center">No products match.</div>}
              {filtered.map(p => {
                const inCart = cart[p.id]?.qty || 0
                const oos = !p.in_stock
                return (
                  <button key={p.id} onClick={() => addItem(p)} disabled={oos}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${oos ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-white text-sm font-semibold truncate">{p.name}{p.size ? <span className="text-zinc-500 font-normal"> — {p.size}</span> : null}</div>
                      <div className="text-zinc-500 text-xs">${effectivePrice(p).toFixed(2)}{oos ? ' · Out of stock' : (p.stock_qty > 0 ? ` · ${p.stock_qty} in stock` : '')}</div>
                    </div>
                    {inCart > 0 && <span className="bg-blue-600 text-white text-xs font-bold rounded-full px-2 py-0.5">{inCart}</span>}
                    <span className="text-blue-400 text-lg leading-none shrink-0">＋</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Right: cart + customer + totals ── */}
        <div className="space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-white font-bold text-sm mb-3">2 · Order Items</div>
            {lines.length === 0 ? (
              <div className="text-zinc-600 text-sm py-4 text-center">No items yet — add from the left.</div>
            ) : (
              <div className="space-y-2">
                {lines.map(l => (
                  <div key={l.product.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-white text-sm font-semibold truncate">{l.product.name}{l.product.size ? <span className="text-zinc-500 font-normal"> — {l.product.size}</span> : null}</div>
                      <div className="text-zinc-500 text-xs">${effectivePrice(l.product).toFixed(2)} each</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setQty(l.product.id, l.qty - 1)} className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold">−</button>
                      <span className="w-8 text-center text-white text-sm font-bold">{l.qty}</span>
                      <button onClick={() => setQty(l.product.id, l.qty + 1)} className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold">＋</button>
                    </div>
                    <div className="w-16 text-right text-amber-400 text-sm font-bold shrink-0">${(effectivePrice(l.product) * l.qty).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <div className="text-white font-bold text-sm">3 · Customer</div>

            {/* ── Customer base picker — autofill from subscribed customers ── */}
            <div className="relative">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Customer Base</div>
                {pickedId != null && (
                  <button onClick={clearCustomer} className="text-zinc-500 hover:text-white text-xs">✕ Clear / new customer</button>
                )}
              </div>
              <input
                value={custQuery}
                onChange={e => { setCustQuery(e.target.value); setCustOpen(true); setPickedId(null) }}
                onFocus={() => setCustOpen(true)}
                onBlur={() => setTimeout(() => setCustOpen(false), 150)}
                placeholder={customers.length ? 'Search subscribers by name, email, or phone…' : 'No subscribers yet — enter details below'}
                className={`w-full bg-zinc-800 border rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-blue-500 ${pickedId != null ? 'border-emerald-500/50' : 'border-zinc-700'}`} />
              {custOpen && custMatches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl">
                  {custMatches.map(c => (
                    <button key={c.id} onMouseDown={() => pickCustomer(c)}
                      className="w-full text-left px-3.5 py-2 hover:bg-zinc-700 transition-colors border-b border-zinc-700/50 last:border-0">
                      <div className="text-white text-sm font-semibold truncate flex items-center gap-1.5">
                        {c.name || c.email}
                        {c.lang === 'es' && <span className="text-[10px] text-zinc-400 border border-zinc-600 rounded px-1">ES</span>}
                      </div>
                      <div className="text-zinc-500 text-xs truncate">
                        {c.email}{c.phone ? ` · ${c.phone}` : ''}{c.order_count > 0 ? ` · ${c.order_count} order${c.order_count > 1 ? 's' : ''}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {pickedId != null && (
                <div className="text-emerald-400 text-xs mt-1">✓ Autofilled from customer base — edit below if needed</div>
              )}
            </div>

            <input value={name} onChange={e => { setName(e.target.value); setPickedId(null) }} placeholder="Full name *"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-blue-500" />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email * (invoice is sent here)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-blue-500" />
            <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" placeholder="Phone (optional — for SMS)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-blue-500" />
            <div>
              <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Payment Method</div>
              <div className="flex gap-1.5">
                {PAY.map(pm => (
                  <button key={pm.id} onClick={() => setMethod(pm.id)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${method === pm.id ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>{pm.label}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setLanguage('en')} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${language === 'en' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-white'}`}>English invoice</button>
              <button onClick={() => setLanguage('es')} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${language === 'es' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-white'}`}>Factura en Español</button>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes (optional)" rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-blue-500 resize-none" />
          </div>

          {/* ── Discount code — auto-applies the active advertised promo ── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Discount Code</div>
              {activeCode && promoInput.trim().toUpperCase() === activeCode && promoResult.discount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30 font-bold">🔥 Active promo</span>
              )}
            </div>
            <div className="flex gap-2">
              <input value={promoInput} onChange={e => setPromoInput(e.target.value.toUpperCase())} placeholder="Enter code"
                className={`flex-1 bg-zinc-800 border rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-500 text-sm font-mono tracking-wide focus:outline-none focus:border-blue-500 ${promoResult.discount > 0 ? 'border-emerald-500/50' : promoResult.error ? 'border-red-500/50' : 'border-zinc-700'}`} />
              {promoInput && (
                <button onClick={() => setPromoInput('')} className="px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-semibold">Clear</button>
              )}
            </div>
            {promoResult.discount > 0 && (
              <div className="text-emerald-400 text-xs">✓ {promoResult.code} applied — {promoResult.label}{promoResult.no_tax ? ' · tax waived' : ''} (−${promoResult.discount.toFixed(2)})</div>
            )}
            {promoResult.error && <div className="text-red-400 text-xs">{promoResult.error}</div>}
            {promoResult.empty && activeCode && (
              <button onClick={() => setPromoInput(activeCode)} className="text-blue-400 hover:text-blue-300 text-xs font-semibold">🔥 Apply active promo — {activeCode}</button>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-zinc-400">Subtotal</span><span className="text-white font-semibold">${subtotal.toFixed(2)}</span></div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-400">Discount{promoResult.code ? ` (${promoResult.code})` : ''}</span>
                <span className="text-emerald-400 font-semibold">−${discountAmount.toFixed(2)}</span>
              </div>
            )}
            <label className="flex items-center justify-between text-sm cursor-pointer">
              <span className="text-zinc-400 flex items-center gap-2">
                Tax {taxExempt ? '(exempt)' : cfg.taxRate > 0 ? `(${(cfg.taxRate * 100).toFixed(2)}%)` : '(no rate set)'}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-white font-semibold">${taxAmount.toFixed(2)}</span>
                <input type="checkbox" checked={taxExempt} onChange={e => setTaxExempt(e.target.checked)} className="w-4 h-4 accent-blue-600" title="Tax exempt" />
                <span className="text-zinc-500 text-xs">exempt</span>
              </span>
            </label>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-800">
              <span className="text-white font-bold">Total</span>
              <span className="text-amber-400 font-black text-xl">${total.toFixed(2)}</span>
            </div>
          </div>

          {err && <div className="text-red-400 text-sm px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-xl">{err}</div>}

          <button onClick={submit} disabled={submitting || lines.length === 0}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-colors">
            {submitting ? 'Creating…' : '📧 Create Order & Email Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AdminUsersTab() {
  const showToast = useToast()
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const blank = { id: null, name: '', username: '', email: '', password: '', permissions: [], is_active: true }
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(blank)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${adminToken}` } })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Could not load admin users'); return }
      setUsers(d.users || [])
    } catch { setErr('Network error loading admin users') }
    finally { setLoading(false) }
  }, [adminToken])

  useEffect(() => { loadUsers() }, [loadUsers])

  const togglePerm = (perm) => {
    setForm(prev => {
      const has = prev.permissions.includes(perm)
      return { ...prev, permissions: has ? prev.permissions.filter(p => p !== perm) : [...prev.permissions, perm] }
    })
  }

  const editUser = (u) => {
    setErr('')
    setForm({ ...u, password: '', permissions: Array.isArray(u.permissions) ? u.permissions : [] })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const resetForm = () => {
    setErr('')
    setForm(blank)
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/admin/users', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Could not save user'); return }
      showToast(form.id ? 'Admin user updated' : 'Admin user created')
      resetForm()
      loadUsers()
    } catch { setErr('Network error saving user') }
    finally { setSaving(false) }
  }

  const remove = async (u) => {
    if (!confirm(`Delete admin user ${u.username}?`)) return
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: u.id }),
      })
      if (!res.ok) { showToast('Could not delete admin user', 'error'); return }
      showToast('Admin user deleted')
      if (form.id === u.id) resetForm()
      loadUsers()
    } catch { showToast('Network error deleting user', 'error') }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-white font-bold text-lg">Admin Users</h2>
          <p className="text-zinc-500 text-sm">Create separate admin logins and check off exactly which areas each person can access.</p>
        </div>
        {err && <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-400 text-sm">{err}</div>}
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : users.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-500 text-sm">No extra admin users yet. Your owner login still has full access.</div>
        ) : (
          <div className="space-y-3">
            {users.map(u => (
              <div key={u.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-white font-bold truncate">{u.name}</div>
                    {!u.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-bold">Disabled</span>}
                  </div>
                  <div className="text-zinc-500 text-xs">@{u.username}{u.email ? ` · ${u.email}` : ''}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(u.permissions || []).length === 0 ? (
                      <span className="text-zinc-600 text-xs">No permissions</span>
                    ) : u.permissions.map(p => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-300 font-semibold">
                        {ADMIN_PERMISSION_LABELS[p] || p}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => editUser(u)} className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold">Edit</button>
                  <button onClick={() => remove(u)} className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={save} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 h-fit sticky top-24 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold">{form.id ? 'Edit Admin User' : 'Add Admin User'}</h3>
          {form.id && <button type="button" onClick={resetForm} className="text-zinc-500 hover:text-white text-xs font-bold">New</button>}
        </div>
        <div className="space-y-3">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
          <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase() }))} placeholder="Username"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
          <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="Email optional"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
          <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder={form.id ? 'New password optional' : 'Password'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
          <label className="flex items-center gap-2 text-zinc-300 text-sm">
            <input type="checkbox" checked={form.is_active !== false} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 accent-blue-600" />
            Active user
          </label>
        </div>

        <div>
          <div className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Access Rights</div>
          <div className="grid grid-cols-1 gap-2">
            {ADMIN_PERMISSION_ORDER.map(perm => (
              <label key={perm} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${form.permissions.includes(perm) ? 'bg-blue-500/10 border-blue-500/40 text-white' : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:text-white'}`}>
                <input type="checkbox" checked={form.permissions.includes(perm)} onChange={() => togglePerm(perm)} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm font-semibold">{ADMIN_PERMISSION_LABELS[perm]}</span>
              </label>
            ))}
          </div>
          <p className="text-amber-400/80 text-xs mt-3">Only check “Admin Users & Permissions” if you want this person to manage other admin users too.</p>
        </div>

        <button disabled={saving} className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold">
          {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create Admin User'}
        </button>
      </form>
    </div>
  )
}

function AdminAccountTab({ adminMe, onProfileUpdated }) {
  const showToast = useToast()
  const adminToken = sessionStorage.getItem('pl_admin_token')
  const [form, setForm] = useState({ username: adminMe?.username || 'owner', email: adminMe?.email || '', current_password: '', new_password: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [totp, setTotp] = useState({ enabled: !!adminMe?.totp_enabled, secret: '', otpauthUrl: '', code: '', password: '' })

  useEffect(() => {
    setForm({ username: adminMe?.username || 'owner', email: adminMe?.email || '', current_password: '', new_password: '' })
    setTotp(p => ({ ...p, enabled: !!adminMe?.totp_enabled }))
  }, [adminMe])

  const saveProfile = async (e) => {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Could not update profile'); return }
      showToast('Admin account updated')
      setForm(p => ({ ...p, current_password: '', new_password: '' }))
      onProfileUpdated?.(d.admin)
    } catch { setErr('Network error updating profile') }
    finally { setSaving(false) }
  }

  const start2FA = async () => {
    setErr('')
    try {
      const res = await fetch('/api/admin/totp', { headers: { Authorization: `Bearer ${adminToken}` } })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Could not start 2FA setup'); return }
      setTotp(p => ({ ...p, secret: d.secret, otpauthUrl: d.otpauthUrl, code: '' }))
    } catch { setErr('Network error starting 2FA setup') }
  }

  const enable2FA = async () => {
    setErr('')
    try {
      const res = await fetch('/api/admin/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ secret: totp.secret, code: totp.code }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Could not enable 2FA'); return }
      showToast('2FA enabled')
      setTotp(p => ({ ...p, enabled: true, secret: '', otpauthUrl: '', code: '' }))
      onProfileUpdated?.({ ...adminMe, totp_enabled: true })
    } catch { setErr('Network error enabling 2FA') }
  }

  const disable2FA = async () => {
    setErr('')
    try {
      const res = await fetch('/api/admin/totp-disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ password: totp.password }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Could not disable 2FA'); return }
      showToast('2FA disabled')
      setTotp(p => ({ ...p, enabled: false, password: '' }))
      onProfileUpdated?.({ ...adminMe, totp_enabled: false })
    } catch { setErr('Network error disabling 2FA') }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-white font-bold text-lg">My Admin Account</h2>
        <p className="text-zinc-500 text-sm">Change your admin username/password and manage your own 2FA.</p>
      </div>
      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-400 text-sm">{err}</div>}

      <form onSubmit={saveProfile} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
        <h3 className="text-white font-bold">Login Details</h3>
        <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase() }))} placeholder="Username"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
        {!adminMe?.owner && (
          <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="Email"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
        )}
        <input type="password" value={form.current_password} onChange={e => setForm(p => ({ ...p, current_password: e.target.value }))} placeholder="Current password required"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
        <input type="password" value={form.new_password} onChange={e => setForm(p => ({ ...p, new_password: e.target.value }))} placeholder="New password optional"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
        <button disabled={saving} className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold">
          {saving ? 'Saving…' : 'Save Login Details'}
        </button>
      </form>

      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold">Two-Factor Authentication</h3>
            <p className="text-zinc-500 text-sm">{totp.enabled ? 'Enabled for this admin account.' : 'Add an authenticator app code at login.'}</p>
          </div>
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${totp.enabled ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
            {totp.enabled ? 'Enabled' : 'Off'}
          </span>
        </div>
        {!totp.enabled && !totp.secret && (
          <button onClick={start2FA} className="w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold">Set Up 2FA</button>
        )}
        {!totp.enabled && totp.secret && (
          <div className="space-y-3">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-400 text-sm mb-2">Scan this setup URL in your authenticator app, or copy the secret manually.</p>
              <div className="text-blue-300 text-xs break-all font-mono">{totp.otpauthUrl}</div>
              <div className="text-zinc-500 text-xs mt-2">Secret: <span className="font-mono text-zinc-300">{totp.secret}</span></div>
            </div>
            <input value={totp.code} onChange={e => setTotp(p => ({ ...p, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="6-digit code"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-center tracking-[0.3em] font-mono" />
            <button onClick={enable2FA} disabled={totp.code.length !== 6} className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold">Verify & Enable</button>
          </div>
        )}
        {totp.enabled && (
          <div className="space-y-3">
            <input type="password" value={totp.password} onChange={e => setTotp(p => ({ ...p, password: e.target.value }))} placeholder="Current password to disable"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
            <button onClick={disable2FA} className="w-full py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold">Disable 2FA</button>
          </div>
        )}
      </div>
    </div>
  )
}

// Converts base64url VAPID public key to Uint8Array for PushManager.subscribe()
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(() => !!sessionStorage.getItem('pl_admin_token'))
  const [adminMe, setAdminMe] = useState(null)
  const [loginUser, setLoginUser] = useState('')
  const [pw, setPw] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [adminForgot, setAdminForgot] = useState(false)
  const [adminForgotId, setAdminForgotId] = useState('')
  const [adminForgotSent, setAdminForgotSent] = useState(false)
  const [pendingToken, setPendingToken] = useState(null) // set when password is correct but a 2FA code is still needed
  const [twoFACode, setTwoFACode] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('orders')
  const [newSubCount, setNewSubCount] = useState(0)
  const [totalSubCount, setTotalSubCount] = useState(0)
  const [pushState, setPushState] = useState('idle') // 'idle' | 'loading' | 'enabled' | 'denied' | 'unsupported'

  const load = useCallback(async () => {
    const jwt = sessionStorage.getItem('pl_admin_token')
    if (!jwt) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/dashboard', { headers: { Authorization: `Bearer ${jwt}` } })
      if (res.status === 401) { sessionStorage.removeItem('pl_admin_token'); sessionStorage.removeItem('pl_admin'); setAuthed(false); return }
      const d = await res.json()
      setData(d)
    } catch {}
    finally { setLoading(false) }
  }, [])

  const loadSession = useCallback(async () => {
    const jwt = sessionStorage.getItem('pl_admin_token')
    if (!jwt) return
    try {
      const res = await fetch('/api/admin/session', { headers: { Authorization: `Bearer ${jwt}` } })
      const d = await res.json()
      if (res.ok) setAdminMe(d.admin || { owner: true, role: 'owner', permissions: ['*'] })
      else { sessionStorage.removeItem('pl_admin_token'); setAdminMe(null); setAuthed(false) }
    } catch {}
  }, [])

  // Check existing push subscription on mount
  const checkPushState = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushState('unsupported'); return
    }
    if (Notification.permission === 'denied') {
      setPushState('denied'); return
    }
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setPushState(sub ? 'enabled' : 'idle')
    } catch { setPushState('idle') }
  }, [])

  const enablePush = useCallback(async () => {
    const token = sessionStorage.getItem('pl_admin_token')
    if (!token) return
    setPushState('loading')
    try {
      // 1. Register service worker
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      // 2. Get VAPID public key
      const keyRes = await fetch('/api/push-key')
      if (!keyRes.ok) { setPushState('idle'); return }
      const { publicKey } = await keyRes.json()

      // 3. Subscribe
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicKey),
      })

      // 4. Save subscription on server
      const saveRes = await fetch('/api/admin/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (saveRes.ok) setPushState('enabled')
      else setPushState('idle')
    } catch (err) {
      if (Notification.permission === 'denied') setPushState('denied')
      else setPushState('idle')
    }
  }, [])

  const disablePush = useCallback(async () => {
    const token = sessionStorage.getItem('pl_admin_token')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/admin/push-subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
    } catch {}
    setPushState('idle')
  }, [])

  useEffect(() => {
    if (authed) {
      loadSession()
      load()
      checkPushState()
      // Register SW in background even if not subscribing yet
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
      }
    }
  }, [authed, load, loadSession, checkPushState])

  useEffect(() => {
    if (!authed || !adminMe) return
    const visible = [
      { id: 'orders', permission: 'orders' },
      { id: 'willcall', permission: 'willcall' },
      { id: 'completed', permission: 'orders' },
      { id: 'cancelled', permission: 'orders' },
      { id: 'inventory', permission: 'inventory' },
      { id: 'subscribers', permission: 'subscribers' },
      { id: 'analytics', permission: 'analytics' },
      { id: 'promos', permission: 'promos' },
      { id: 'reviews', permission: 'reviews' },
      { id: 'coa', permission: 'coa' },
      { id: 'settings', permission: 'settings' },
      { id: 'storefront', permission: 'storefront' },
      { id: 'tax', permission: 'tax' },
      { id: 'announce', permission: 'announce' },
      { id: 'suggestions', permission: 'suggestions' },
      { id: 'trash', permission: 'trash' },
      { id: 'admin-users', permission: 'admin_users' },
      { id: 'account', permission: null },
    ].filter(t => adminCan(adminMe, t.permission))
    if (!visible.some(t => t.id === tab)) setTab(visible[0]?.id || 'storefront')
  }, [authed, adminMe, tab])

  const tryLogin = async (e) => {
    e.preventDefault()
    setLoginErr('')
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: pw })
      })
      const data = await res.json()
      if (res.ok && data.requires2fa) {
        setPendingToken(data.pendingToken)
      } else if (res.ok && data.token) {
        sessionStorage.setItem('pl_admin_token', data.token)
        setPw(''); setLoginUser(''); setAdminMe(data.admin || null)
        setAuthed(true)
      } else if (res.status === 429) {
        setLoginErr(data.error || 'Too many attempts. Try again later.')
      } else {
        setLoginErr(data.error || 'Invalid password')
      }
    } catch { setLoginErr('Network error. Please try again.') }
  }

  const tryVerify2FA = async (e) => {
    e.preventDefault()
    setLoginErr('')
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingToken, code: twoFACode })
      })
      const data = await res.json()
      if (res.ok && data.token) {
        sessionStorage.setItem('pl_admin_token', data.token)
        setPw(''); setLoginUser(''); setPendingToken(null); setTwoFACode(''); setAdminMe(data.admin || null)
        setAuthed(true)
      } else if (res.status === 429) {
        setLoginErr(data.error || 'Too many attempts. Try again later.')
      } else {
        setLoginErr(data.error || 'Invalid code')
      }
    } catch { setLoginErr('Network error. Please try again.') }
  }

  const sendAdminReset = async (e) => {
    e.preventDefault()
    setLoginErr('')
    try {
      await fetch('/api/admin/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: adminForgotId }),
      })
      setAdminForgotSent(true)
    } catch { setLoginErr('Network error. Please try again.') }
  }

  if (!authed) {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <h1 className="text-2xl font-black text-white mb-1">Admin</h1>
            <p className="text-zinc-500 text-sm mb-6">
              {pendingToken ? 'Enter the 6-digit code from your authenticator app' : 'Pryme Labs Order Dashboard'}
            </p>
            {adminForgot ? (
              <div className="space-y-4">
                <form onSubmit={sendAdminReset} className="space-y-4">
                  <input type="text" placeholder="Admin username or email" value={adminForgotId} onChange={e => setAdminForgotId(e.target.value)} autoFocus
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-base" />
                  {adminForgotSent && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 text-sm">
                      If an admin account with an email exists, a reset link is on the way.
                    </div>
                  )}
                  {loginErr && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{loginErr}</div>
                  )}
                  <button className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-2xl transition-colors">Send Reset Link</button>
                </form>
                <button type="button" onClick={() => { setAdminForgot(false); setAdminForgotSent(false); setLoginErr('') }}
                  className="w-full text-zinc-500 hover:text-zinc-300 text-sm font-medium transition-colors">← Back to sign in</button>
              </div>
            ) : pendingToken ? (
              <form onSubmit={tryVerify2FA} className="space-y-4">
                <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="123456"
                  value={twoFACode} onChange={e => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-500 text-center text-2xl tracking-[0.3em] font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors" />
                {loginErr && (
                  <div className={`text-sm px-3 py-2 rounded-lg ${loginErr.includes('many') ? 'bg-orange-500/10 border border-orange-500/30 text-orange-400' : 'text-red-400'}`}>
                    {loginErr}
                  </div>
                )}
                <button type="submit" disabled={twoFACode.length !== 6}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 text-white font-bold rounded-2xl transition-colors">Verify</button>
                <button type="button" onClick={() => { setPendingToken(null); setTwoFACode(''); setLoginErr('') }}
                  className="w-full text-zinc-500 hover:text-zinc-300 text-sm font-medium transition-colors">← Back to password</button>
              </form>
            ) : (
              <form onSubmit={tryLogin} className="space-y-4">
                <input type="text" placeholder="Username or email (blank for owner)" value={loginUser} onChange={e => setLoginUser(e.target.value)} autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-base" />
                <input type="password" placeholder="Admin password" value={pw} onChange={e => setPw(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-base" />
                {loginErr && (
                  <div className={`text-sm px-3 py-2 rounded-lg ${loginErr.includes('many') ? 'bg-orange-500/10 border border-orange-500/30 text-orange-400' : 'text-red-400'}`}>
                    {loginErr}
                  </div>
                )}
                <button type="submit" className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-2xl transition-colors">Sign In</button>
                <button type="button" onClick={() => { setAdminForgot(true); setAdminForgotId(loginUser); setAdminForgotSent(false); setLoginErr('') }}
                  className="w-full text-zinc-500 hover:text-blue-400 text-sm transition-colors">Forgot admin password?</button>
              </form>
            )}
          </div>
        </div>
      </ToastProvider>
    )
  }

  if (!adminMe) {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </ToastProvider>
    )
  }

  // ── Storefront Tab (inline, simple) ──────────────────────────────────────
  function StorefrontTab() {
    const links = [
      { href: '/shop',     label: 'Shop',          desc: 'Browse products as a customer',  icon: '🛍️',  color: 'bg-blue-600 hover:bg-blue-700 text-white' },
      { href: '/auth',     label: 'Customer Login', desc: 'Sign in / registration page',   icon: '🔐',  color: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' },
      { href: '/checkout', label: 'Checkout',       desc: 'View the checkout flow',         icon: '💳',  color: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' },
      { href: '/orders',   label: 'My Orders',      desc: 'Customer order history page',    icon: '📦',  color: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' },
    ]
    return (
      <div className="max-w-xl space-y-5">
        <div>
          <h2 className="text-white font-bold text-base mb-0.5">Storefront Access</h2>
          <p className="text-zinc-500 text-sm">Quick links to every customer-facing page. All open in a new tab.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {links.map(l => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
              className={`flex items-start gap-3 p-4 rounded-2xl border border-white/5 transition-colors group ${l.color}`}>
              <span className="text-2xl mt-0.5 shrink-0">{l.icon}</span>
              <div className="min-w-0">
                <div className="font-bold text-sm flex items-center gap-1.5">
                  {l.label}
                  <svg className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </div>
                <div className="text-xs opacity-60 mt-0.5 truncate">{l.desc}</div>
              </div>
            </a>
          ))}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
          <div className="text-white font-bold text-sm">Your Domain</div>
          <a href="https://prymelabs.cc" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 font-mono text-sm transition-colors group">
            prymelabs.cc
            <svg className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
          </a>
          <p className="text-zinc-600 text-xs">SSL active · Deployed on Cloudflare Pages</p>
        </div>
      </div>
    )
  }

  const TABS = [
    { id: 'orders',      label: 'Orders',         short: '📦', permission: 'orders' },
    { id: 'willcall',    label: 'Will Call',       short: '🏷️', permission: 'willcall' },
    { id: 'completed',   label: 'Completed',      short: '✅', permission: 'orders' },
    { id: 'cancelled',   label: 'Cancelled',      short: '❌', permission: 'orders' },
    { id: 'inventory',   label: 'Products',        short: '🏬', permission: 'inventory' },
    { id: 'subscribers', label: totalSubCount > 0 ? `👥 Subs · ${totalSubCount}` : '👥 Subs', short: '👥', badge: newSubCount, permission: 'subscribers' },
    { id: 'analytics',   label: 'Analytics',       short: '📈', permission: 'analytics' },
    { id: 'promos',      label: 'Promos',          short: '🏷️', permission: 'promos' },
    { id: 'reviews',     label: 'Reviews',         short: '⭐', permission: 'reviews' },
    { id: 'coa',         label: 'Certificates',    short: '📄', permission: 'coa' },
    { id: 'settings',    label: 'Settings',        short: '⚙️', permission: 'settings' },
    { id: 'storefront',  label: 'Storefront',      short: '🛍️', permission: 'storefront' },
    { id: 'tax',         label: 'Tax',             short: '🧾', permission: 'tax' },
    { id: 'announce',    label: 'Announce',        short: '📣', permission: 'announce' },
    { id: 'suggestions', label: '💡 Suggestions',  short: '💡', permission: 'suggestions' },
    { id: 'trash',       label: 'Trash',           short: '🗑️', permission: 'trash' },
    { id: 'admin-users', label: 'Admin Users',     short: '👮', permission: 'admin_users' },
    { id: 'account',     label: 'My Account',      short: '🔐' },
  ].filter(t => adminCan(adminMe, t.permission))

  return (
    <ToastProvider>
    <div className="min-h-screen bg-zinc-950">
      <div className="bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/60 sticky top-0 z-20">
        {/* ── Row 1: Logo + Actions ── */}
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
          <h1 className="text-base font-black text-white tracking-widest shrink-0">PRYME<span className="text-blue-500">LABS</span></h1>
          <div className="flex items-center gap-2 shrink-0">
            {(['orders','completed','cancelled','tax'].includes(tab)) && data && (
              <button onClick={load} className="text-zinc-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-zinc-800" title="Refresh">
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
            {/* Push notification bell */}
            {pushState !== 'unsupported' && (
              <button
                onClick={pushState === 'enabled' ? disablePush : pushState === 'denied' ? undefined : enablePush}
                disabled={pushState === 'loading' || pushState === 'denied'}
                title={
                  pushState === 'enabled' ? 'Notifications on — click to disable' :
                  pushState === 'denied'  ? 'Notifications blocked — allow in browser settings' :
                  pushState === 'loading' ? 'Enabling…' : 'Enable push notifications'
                }
                className={`p-2 rounded-lg transition-colors relative ${
                  pushState === 'enabled'  ? 'text-green-400 hover:text-green-300 hover:bg-zinc-800' :
                  pushState === 'denied'   ? 'text-red-500 cursor-not-allowed opacity-60' :
                  pushState === 'loading'  ? 'text-zinc-400 cursor-wait' :
                  'text-zinc-500 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {pushState === 'loading' ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill={pushState === 'enabled' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                )}
              </button>
            )}
            {adminMe && (
              <div className="hidden sm:block text-right mr-1">
                <div className="text-white text-xs font-bold leading-tight">{adminMe.owner ? 'Owner' : adminMe.name}</div>
                <div className="text-zinc-600 text-[10px] leading-tight">{adminMe.owner ? 'Full access' : 'Limited admin'}</div>
              </div>
            )}
            <button onClick={() => { sessionStorage.removeItem('pl_admin_token'); sessionStorage.removeItem('pl_admin'); localStorage.removeItem('pl_admin_pw'); localStorage.removeItem('pl_admin_bypass'); setAdminMe(null); setAuthed(false) }}
              className="text-xs text-zinc-500 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-zinc-800">
              Sign Out
            </button>
          </div>
        </div>
        {/* ── Row 2: Tab Bar ── */}
        <div className="max-w-7xl mx-auto px-2 pb-1.5 flex gap-0.5 overflow-x-auto scrollbar-hide">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1 shrink-0 min-h-[36px] ${tab === t.id ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'}`}>
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden text-base leading-none">{t.short}</span>
              {t.badge > 0 && (
                <span className="bg-green-500 text-white text-xs font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                  {t.badge > 99 ? '99+' : t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'orders' && adminCan(adminMe, 'orders') && <OrdersTab data={data} loading={loading} onRefresh={load} onSwitchTab={setTab} />}
        {tab === 'willcall' && adminCan(adminMe, 'willcall') && <WillCallTab onOrderCreated={load} />}
        {tab === 'completed' && adminCan(adminMe, 'orders') && <CompletedOrdersTab data={data} loading={loading} onRefresh={load} />}
        {tab === 'cancelled' && adminCan(adminMe, 'orders') && <CancelledOrdersTab data={data} loading={loading} onRefresh={load} />}
        {tab === 'inventory' && adminCan(adminMe, 'inventory') && <InventoryTab />}
        {tab === 'subscribers' && adminCan(adminMe, 'subscribers') && <SubscribersTab onNewCount={setNewSubCount} onTotalCount={setTotalSubCount} />}
        {tab === 'analytics' && adminCan(adminMe, 'analytics') && <AnalyticsTab />}
        {tab === 'promos' && adminCan(adminMe, 'promos') && <PromosTab />}
        {tab === 'reviews' && adminCan(adminMe, 'reviews') && <ReviewsTab />}
        {tab === 'coa' && adminCan(adminMe, 'coa') && <CoaTab />}
        {tab === 'settings' && adminCan(adminMe, 'settings') && <SettingsTab />}
        {tab === 'storefront' && adminCan(adminMe, 'storefront') && <StorefrontTab />}
        {tab === 'tax' && adminCan(adminMe, 'tax') && <TaxRecordsTab data={data} loading={loading} />}
        {tab === 'announce' && adminCan(adminMe, 'announce') && <AnnouncementsTab />}
        {tab === 'suggestions' && adminCan(adminMe, 'suggestions') && <SuggestionsTab />}
        {tab === 'trash' && adminCan(adminMe, 'trash') && <TrashTab />}
        {tab === 'admin-users' && adminCan(adminMe, 'admin_users') && <AdminUsersTab />}
        {tab === 'account' && <AdminAccountTab adminMe={adminMe} onProfileUpdated={(next) => setAdminMe(p => ({ ...p, ...next }))} />}
      </main>
    </div>
    </ToastProvider>
  )
}
