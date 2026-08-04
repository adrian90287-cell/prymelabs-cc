import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'


function authHeader(apiKey) {
  return { Authorization: `Basic ${btoa(`${apiKey}:`)}` }
}

export async function onRequestPost({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { order_id, parcel } = body
  if (!order_id || !parcel) return json({ error: 'order_id and parcel required' }, 400)

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order_id).first()
  if (!order) return json({ error: 'Order not found' }, 404)

  const { results: rows } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('easypost_api_key','ship_from_name','ship_from_street','ship_from_city','ship_from_state','ship_from_zip','ship_from_phone','ship_from_email')"
  ).all()
  const cfg = {}
  for (const r of (rows || [])) cfg[r.key] = r.value

  const apiKey = env.EASYPOST_API_KEY || cfg.easypost_api_key
  if (!apiKey) return json({ error: 'EasyPost API key not configured. Add it in Settings → Shipping Labels.' }, 400)

  const shipping = JSON.parse(order.shipping_json || '{}')

  const shipment = {
    from_address: {
      name:    cfg.ship_from_name   || 'Pryme Labs',
      street1: cfg.ship_from_street || '7400 Moline St',
      city:    cfg.ship_from_city   || 'Houston',
      state:   cfg.ship_from_state  || 'TX',
      zip:     cfg.ship_from_zip    || '77087',
      country: 'US',
      phone:   cfg.ship_from_phone  || '',
      email:   env.OWNER_EMAIL      || cfg.ship_from_email || 'orders@prymelabs.cc',
    },
    to_address: {
      name:    shipping.name    || order.customer_name || '',
      street1: shipping.address || '',
      street2: shipping.address2 || '',
      city:    shipping.city    || '',
      state:   shipping.state   || '',
      zip:     shipping.zip     || '',
      country: 'US',
      // Recipient phone intentionally omitted — it's optional for shipping and we
      // don't want the customer's phone number printed on the label (some carriers,
      // e.g. UPS, render it). The phone stays on the order for SMS/records.
      email:   order.customer_email || '',
    },
    parcel: {
      length: Number(parcel.length),
      width:  Number(parcel.width),
      height: Number(parcel.height),
      weight: Number(parcel.weight), // ounces
    },
  }

  const res = await fetch('https://api.easypost.com/v2/shipments', {
    method:  'POST',
    headers: { ...authHeader(apiKey), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ shipment }),
  })

  const data = await res.json()
  if (!res.ok) {
    const msg = data?.error?.message || (data?.error?.errors || []).map(e => e.message).join(', ') || 'EasyPost API error'
    return json({ error: msg, detail: data }, res.status)
  }

  const allRates = data.rates || []

  // EasyPost's r.carrier is the carrier_account nickname (e.g. "FedExDefault", "UPSDAP"),
  // not a clean display name — normalize to the actual carrier.
  function cleanCarrier(raw) {
    const s = (raw || '').toLowerCase()
    if (s.includes('fedex')) return 'FedEx'
    if (s.includes('ups'))   return 'UPS'
    if (s.includes('usps'))  return 'USPS'
    if (s.includes('dhl'))   return 'DHL'
    return raw
  }

  // Service codes come back SCREAMING_SNAKE_CASE — make them readable.
  function cleanService(raw) {
    return (raw || '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase())
  }

  const rates = allRates
    .filter(r => Number(r.rate) > 0)
    // Prefer USPS (accurate ounce-based weight, cheaper for light parcels, cleaner
    // 4x6 label) so it lands at the top and is pre-selected. Within each carrier
    // group, cheapest first.
    .sort((a, b) => {
      const aUsps = /usps/i.test(a.carrier) ? 0 : 1
      const bUsps = /usps/i.test(b.carrier) ? 0 : 1
      if (aUsps !== bUsps) return aUsps - bUsps
      return Number(a.rate) - Number(b.rate)
    })
    .map(r => ({
      id:       r.id,
      carrier:  cleanCarrier(r.carrier),
      service:  cleanService(r.service),
      price:    Number(r.rate),
      currency: r.currency,
      days:     r.delivery_days,
      arrives:  r.delivery_date_guaranteed ? 'Guaranteed' : '',
      warnings: [],
    }))

  const messages = (data.messages || []).map(m => m.message || m.text).filter(Boolean)

  return json({
    rates,
    shipment_id:        data.id,
    total_rates:        allRates.length,
    debug:              messages,
    raw_rates:          allRates.map(r => `${r.carrier} ${r.service}: $${r.rate}`),
    address_to_valid:   null,
    address_from_valid: null,
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
