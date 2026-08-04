import { sendEmail, sendSMS, deliveredNotificationHtml, deliveredNotificationHtmlEs, trackingNotificationHtml, trackingNotificationHtmlEs } from './email.js'

// ─────────────────────────────────────────────────────────────────────────────
// Live tracking — EasyPost API (primary) with direct carrier fallback.
// EasyPost tracks USPS, UPS, FedEx and more with a single API key.
// Normalized statuses: label_created → in_transit → out_for_delivery → delivered
// (plus exception, unknown)
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_TTL = 1800 // 30 min throttle per package
const MAX_EVENTS  = 40

// ── Carrier deep-link URLs ────────────────────────────────────────────────────
const LINKS = {
  usps:  n => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  ups:   n => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  fedex: n => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  dhl:   n => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}`,
}

export function carrierLink(carrier, number) {
  const fn = LINKS[(carrier || '').toLowerCase().replace(/\s+/g, '')]
  return fn && number ? fn(number) : null
}

function safeParse(s, def) {
  try { return JSON.parse(s || 'null') ?? def } catch { return def }
}

// ── Status normalization ──────────────────────────────────────────────────────

// EasyPost's status enum → our internal status
const EASYPOST_STATUS = {
  pre_transit: 'label_created',
  in_transit:  'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered:   'delivered',
  return_to_sender: 'exception',
  failure:     'exception',
  cancelled:   'exception',
  error:       'exception',
  unknown:     'unknown',
}

// Keyword fallback for direct carrier text or unknown strings
export function normalizeStatus(text) {
  const s = (text || '').toLowerCase()
  if (!s.trim()) return 'unknown'
  if (s.includes('out for delivery')) return 'out_for_delivery'
  if (s.includes('delivered')) return 'delivered'
  if (/exception|alert|returned|return to|unable|undeliverable|failed|refused|damage|seized|dead letter/.test(s)) return 'exception'
  if (/label|pre.?shipment|manifest|order created|order processed|billing information|shipment information sent/.test(s)) return 'label_created'
  return 'in_transit'
}

// ── EasyPost Tracking API ─────────────────────────────────────────────────────
// Covers USPS, UPS, FedEx and more with one key.
// Docs: https://docs.easypost.com/docs/trackers

// Map our stored carrier names to EasyPost's carrier slug
const CARRIER_SLUG = {
  usps:  'USPS',
  ups:   'UPS',
  fedex: 'FedEx',
  dhl:   'DHLExpress',
  'dhl express': 'DHLExpress',
}

function easypostAuthHeader(apiKey) {
  return { Authorization: `Basic ${btoa(`${apiKey}:`)}` }
}

async function fetchEasyPost(easypostKey, carrier, number) {
  const slug = CARRIER_SLUG[(carrier || '').toLowerCase().replace(/[^a-z ]/g, '').trim()] || carrier || ''

  // Creating a tracker is idempotent in EasyPost — if one already exists for
  // this tracking_code + carrier, the existing tracker is returned.
  const r = await fetch('https://api.easypost.com/v2/trackers', {
    method:  'POST',
    headers: { ...easypostAuthHeader(easypostKey), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tracker: { tracking_code: number, carrier: slug } }),
  })

  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`EasyPost track ${r.status}: ${body.slice(0, 400)}`)
  }

  const d = await r.json()

  const status = EASYPOST_STATUS[(d.status || '').toLowerCase()]
    || normalizeStatus(d.status_detail || d.status || '')

  const events = (d.tracking_details || [])
    .map(e => ({
      ts:          e.datetime ? Math.floor(new Date(e.datetime).getTime() / 1000) : null,
      description: e.message || e.status || '',
      location:    [e.tracking_location?.city, e.tracking_location?.state].filter(Boolean).join(', '),
    }))
    .filter(e => e.description)

  const est_delivery = d.est_delivery_date ? String(d.est_delivery_date).slice(0, 10) : null

  return { status, est_delivery, events }
}

// ── Direct carrier fallbacks (used only if no EasyPost key) ──────────────────

const tokenCache = {}
async function getToken(key, fetcher) {
  const hit = tokenCache[key]
  if (hit && hit.exp > Date.now()) return hit.token
  const { token, ttl } = await fetcher()
  tokenCache[key] = { token, exp: Date.now() + Math.max(60, ttl - 120) * 1000 }
  return token
}

async function fetchUSPS(env, number) {
  const token = await getToken('usps', async () => {
    const r = await fetch('https://apis.usps.com/oauth2/v3/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.USPS_CLIENT_ID, client_secret: env.USPS_CLIENT_SECRET }),
    })
    if (!r.ok) throw new Error(`USPS auth ${r.status}`)
    const d = await r.json()
    return { token: d.access_token, ttl: Number(d.expires_in) || 3600 }
  })
  const r = await fetch(`https://apis.usps.com/tracking/v3/tracking/${encodeURIComponent(number)}?expand=DETAIL`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) throw new Error(`USPS track ${r.status}`)
  const d = await r.json()
  const events = (d.trackingEvents || []).map(e => ({
    ts: e.eventTimestamp ? Math.floor(new Date(e.eventTimestamp).getTime() / 1000) : null,
    description: e.eventType || '',
    location: [e.eventCity, e.eventState].filter(Boolean).join(', '),
  }))
  return {
    status: normalizeStatus([d.statusCategory, d.status, events[0]?.description].filter(Boolean).join(' ')),
    est_delivery: d.expectedDeliveryDate ? String(d.expectedDeliveryDate).slice(0, 10) : null,
    events,
  }
}

async function fetchUPS(env, number) {
  const token = await getToken('ups', async () => {
    const r = await fetch('https://onlinetools.ups.com/security/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(`${env.UPS_CLIENT_ID}:${env.UPS_CLIENT_SECRET}`) },
      body: 'grant_type=client_credentials',
    })
    if (!r.ok) throw new Error(`UPS auth ${r.status}`)
    const d = await r.json()
    return { token: d.access_token, ttl: Number(d.expires_in) || 3600 }
  })
  const r = await fetch(`https://onlinetools.ups.com/api/track/v1/details/${encodeURIComponent(number)}?locale=en_US`, {
    headers: { Authorization: `Bearer ${token}`, transId: crypto.randomUUID(), transactionSrc: 'prymelabs-cc' },
  })
  if (!r.ok) throw new Error(`UPS track ${r.status}`)
  const d = await r.json()
  const pkg = d.trackResponse?.shipment?.[0]?.package?.[0]
  if (!pkg) throw new Error('UPS: no package data')
  const events = (pkg.activity || []).map(a => ({
    ts: (() => { const dt = a.date && a.date.length === 8 ? `${a.date.slice(0,4)}-${a.date.slice(4,6)}-${a.date.slice(6,8)}T${(a.time||'000000').slice(0,2)}:${(a.time||'000000').slice(2,4)}:${(a.time||'000000').slice(4,6)}` : null; const ms = dt ? new Date(dt).getTime() : NaN; return Number.isFinite(ms) ? Math.floor(ms/1000) : null })(),
    description: a.status?.description || '',
    location: [a.location?.address?.city, a.location?.address?.stateProvince].filter(Boolean).join(', '),
  }))
  const latest = (pkg.activity || [])[0]
  const typeMap = { D: 'delivered', X: 'exception', RS: 'exception', M: 'label_created', MV: 'label_created' }
  let status = normalizeStatus(latest?.status?.description)
  if (status === 'in_transit' && typeMap[latest?.status?.type]) status = typeMap[latest.status.type]
  const estRaw = (pkg.deliveryDate || []).find(x => x.date)?.date
  return { status, est_delivery: estRaw && estRaw.length === 8 ? `${estRaw.slice(0,4)}-${estRaw.slice(4,6)}-${estRaw.slice(6,8)}` : null, events }
}

async function fetchFedEx(env, number) {
  const token = await getToken('fedex', async () => {
    const r = await fetch('https://apis.fedex.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(env.FEDEX_CLIENT_ID)}&client_secret=${encodeURIComponent(env.FEDEX_CLIENT_SECRET)}`,
    })
    if (!r.ok) throw new Error(`FedEx auth ${r.status}`)
    const d = await r.json()
    return { token: d.access_token, ttl: Number(d.expires_in) || 3600 }
  })
  const r = await fetch('https://apis.fedex.com/track/v1/trackingnumbers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ includeDetailedScans: true, trackingInfo: [{ trackingNumberInfo: { trackingNumber: number } }] }),
  })
  if (!r.ok) throw new Error(`FedEx track ${r.status}`)
  const d = await r.json()
  const tr = d.output?.completeTrackResults?.[0]?.trackResults?.[0]
  if (!tr || tr.error) throw new Error(`FedEx: ${tr?.error?.message || 'no data'}`)
  const codeMap = { DL: 'delivered', OD: 'out_for_delivery', OC: 'label_created', DE: 'exception', SE: 'exception', CA: 'exception', RS: 'exception' }
  const events = (tr.scanEvents || []).map(e => ({
    ts: e.date ? Math.floor(new Date(e.date).getTime() / 1000) : null,
    description: e.eventDescription || '',
    location: [e.scanLocation?.city, e.scanLocation?.stateOrProvinceCode].filter(Boolean).join(', '),
  }))
  const estRaw = (tr.dateAndTimes || []).find(x => ['ESTIMATED_DELIVERY','ACTUAL_DELIVERY'].includes(x.type))?.dateTime
  return {
    status: codeMap[tr.latestStatusDetail?.derivedCode] || normalizeStatus(tr.latestStatusDetail?.statusByLocale || tr.latestStatusDetail?.description),
    est_delivery: estRaw ? String(estRaw).slice(0, 10) : null,
    events,
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const DIRECT_PROVIDERS = {
  usps:  { hasCreds: e => !!(e.USPS_CLIENT_ID  && e.USPS_CLIENT_SECRET),  fetch: fetchUSPS  },
  ups:   { hasCreds: e => !!(e.UPS_CLIENT_ID   && e.UPS_CLIENT_SECRET),   fetch: fetchUPS   },
  fedex: { hasCreds: e => !!(e.FEDEX_CLIENT_ID && e.FEDEX_CLIENT_SECRET), fetch: fetchFedEx },
}

// Returns whether we can get live tracking data (via EasyPost or direct creds)
export function carrierSupported(env, carrier, easypostKey) {
  if (easypostKey) return true // EasyPost handles all carriers
  const p = DIRECT_PROVIDERS[(carrier || '').toLowerCase()]
  return !!(p && p.hasCreds(env))
}

export async function fetchCarrierStatus(env, carrier, number, easypostKey) {
  // Prefer EasyPost — one key handles all carriers
  if (easypostKey) return fetchEasyPost(easypostKey, carrier, number)
  // Fallback to direct carrier APIs
  const p = DIRECT_PROVIDERS[(carrier || '').toLowerCase()]
  if (!p || !p.hasCreds(env)) return null
  return p.fetch(env, number)
}

// ─────────────────────────────────────────────────────────────────────────────
// refreshOrderTracking — pull live status for one order and persist it.
// Pass easypostKey (from DB or env) to use EasyPost as the tracking source.
// Auto-completes orders and notifies customer on delivery.
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshOrderTracking(env, order, { force = false, waitUntil, easypostKey } = {}) {
  const tracking = safeParse(order.tracking_json, {})
  const number   = (tracking.number || '').trim()
  if (!number) return null

  const now  = Math.floor(Date.now() / 1000)
  const live = carrierSupported(env, tracking.carrier, easypostKey)

  const snapshot = () => ({
    order_id:     order.id,
    order_number: order.order_number,
    order_status: order.status,
    carrier:      tracking.carrier || '',
    number,
    link:         carrierLink(tracking.carrier, number),
    status:       order.tracking_status || 'unknown',
    est_delivery: tracking.est_delivery || null,
    events:       safeParse(order.tracking_events_json, []),
    checked_at:   order.tracking_checked_at || null,
    delivered_at: order.delivered_at || null,
    live,
  })

  if (!live) return snapshot()
  if (order.tracking_status === 'delivered' && !force) return snapshot()
  if (!force && order.tracking_checked_at && now - order.tracking_checked_at < REFRESH_TTL) return snapshot()

  let result
  try {
    result = await fetchCarrierStatus(env, tracking.carrier, number, easypostKey)
  } catch (err) {
    console.error(`tracking refresh failed — order ${order.order_number}, ${tracking.carrier} ${number}: ${err.message}`)
    await env.DB.prepare('UPDATE orders SET tracking_checked_at = ? WHERE id = ?').bind(now, order.id).run()
    return { ...snapshot(), checked_at: now, error: 'carrier_unavailable', error_detail: err.message }
  }
  if (!result) return snapshot()

  const delivered    = result.status === 'delivered'
  const deliveredAt  = delivered
    ? (order.delivered_at || result.events.find(e => normalizeStatus(e.description) === 'delivered')?.ts || now)
    : (order.delivered_at || null)
  const newTracking  = { ...tracking, est_delivery: result.est_delivery || tracking.est_delivery || null }
  const completeNow  = delivered && order.status === 'shipped'

  // Auto-ship: if order is still 'fulfilled' but carrier has scanned it (in_transit or beyond),
  // automatically mark as shipped and fire the customer shipped notification
  const prevStatus   = order.tracking_status || 'unknown'
  const carrierScanned = ['in_transit','out_for_delivery','delivered'].includes(result.status)
  const shipNow      = order.status === 'fulfilled' && carrierScanned &&
                       ['label_created','unknown'].includes(prevStatus)

  const newStatus    = completeNow ? 'completed' : shipNow ? 'shipped' : order.status
  let statusUpdate   = ''
  if (completeNow)   statusUpdate = ", status = 'completed', shipped_at = COALESCE(shipped_at, ?)"
  else if (shipNow)  statusUpdate = ", status = 'shipped', shipped_at = ?"

  if (statusUpdate) {
    await env.DB.prepare(
      `UPDATE orders SET tracking_status = ?, tracking_events_json = ?, tracking_checked_at = ?, tracking_json = ?, delivered_at = ?${statusUpdate} WHERE id = ?`
    ).bind(result.status, JSON.stringify(result.events.slice(0, MAX_EVENTS)), now, JSON.stringify(newTracking), deliveredAt, now, order.id).run()
  } else {
    await env.DB.prepare(
      `UPDATE orders SET tracking_status = ?, tracking_events_json = ?, tracking_checked_at = ?, tracking_json = ?, delivered_at = ? WHERE id = ?`
    ).bind(result.status, JSON.stringify(result.events.slice(0, MAX_EVENTS)), now, JSON.stringify(newTracking), deliveredAt, order.id).run()
  }

  if (completeNow) notifyDelivered(env, order, waitUntil)
  if (shipNow)     notifyShipped(env, order, tracking, waitUntil)

  return {
    ...snapshot(),
    order_status: newStatus,
    status:       result.status,
    est_delivery: newTracking.est_delivery,
    events:       result.events.slice(0, MAX_EVENTS),
    checked_at:   now,
    delivered_at: deliveredAt,
    auto_shipped: shipNow || undefined,
  }
}

function notifyShipped(env, order, tracking, waitUntil) {
  const task = (async () => {
    let isEs = false
    if (order.user_id) {
      const u = await env.DB.prepare('SELECT lang FROM users WHERE id = ?').bind(order.user_id).first()
      isEs = u?.lang === 'es'
    }
    const items     = safeParse(order.items_json, [])
    const total     = Number(order.order_total || order.subtotal || 0)
    const firstName = (order.customer_name || '').split(' ')[0]
    const phone     = safeParse(order.shipping_json, {})?.phone?.trim()
    const carrier   = tracking.carrier || 'Carrier'
    const trackNum  = tracking.number  || ''

    const jobs = []
    if (order.customer_email) {
      jobs.push(sendEmail(env, {
        to:      order.customer_email,
        subject: isEs ? `📦 Tu Pedido Ha Sido Enviado — ${order.order_number}` : `📦 Your Order Has Shipped — ${order.order_number}`,
        html:    isEs
          ? trackingNotificationHtmlEs({ order_number: order.order_number, customer_name: order.customer_name, items, total: order.subtotal, carrier, tracking_number: trackNum })
          : trackingNotificationHtml({ order_number: order.order_number, customer_name: order.customer_name, items, total: order.subtotal, carrier, tracking_number: trackNum }),
      }).catch(() => {}))
    }
    if (phone) {
      jobs.push(sendSMS(env, {
        to:      phone,
        message: isEs
          ? `${firstName}, ¡tu pedido de Pryme Labs ${order.order_number} ha sido enviado vía ${carrier}! Rastreo: ${trackNum}`
          : `${firstName}, your Pryme Labs order ${order.order_number} has shipped via ${carrier}! Tracking: ${trackNum}`,
      }).catch(() => {}))
    }
    await Promise.all(jobs)
  })().catch(() => {})
  if (waitUntil) waitUntil(task)
}

function notifyDelivered(env, order, waitUntil) {
  const task = (async () => {
    let isEs = false
    if (order.user_id) {
      const u = await env.DB.prepare('SELECT lang FROM users WHERE id = ?').bind(order.user_id).first()
      isEs = u?.lang === 'es'
    }
    const items     = safeParse(order.items_json, [])
    const total     = Number(order.order_total || order.subtotal || 0)
    const firstName = (order.customer_name || '').split(' ')[0]
    const phone     = safeParse(order.shipping_json, {})?.phone?.trim()

    const jobs = []
    if (order.customer_email) {
      jobs.push(sendEmail(env, {
        to:      order.customer_email,
        subject: isEs ? `📬 Pedido Entregado — ${order.order_number}` : `📬 Order Delivered — ${order.order_number}`,
        html:    isEs
          ? deliveredNotificationHtmlEs({ order_number: order.order_number, customer_name: order.customer_name, items, total })
          : deliveredNotificationHtml({ order_number: order.order_number, customer_name: order.customer_name, items, total }),
      }).catch(() => {}))
    }
    if (phone) {
      jobs.push(sendSMS(env, {
        to:      phone,
        message: isEs
          ? `📬 ${firstName}, ¡tu pedido de Pryme Labs ${order.order_number} ha sido entregado! Gracias por tu compra. 🙌`
          : `📬 ${firstName}, your Pryme Labs order ${order.order_number} has been delivered! Thanks for your purchase. 🙌`,
      }).catch(() => {}))
    }
    await Promise.all(jobs)
  })().catch(() => {})
  if (waitUntil) waitUntil(task)
}
