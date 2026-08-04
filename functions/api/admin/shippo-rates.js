import { corsHeaders, json } from '../../_utils/cors.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

export async function onRequestPost({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { order_id, parcel } = body
  if (!order_id || !parcel) return json({ error: 'order_id and parcel required' }, 400)

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order_id).first()
  if (!order) return json({ error: 'Order not found' }, 404)

  const { results: rows } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('shippo_api_key','ship_from_name','ship_from_street','ship_from_city','ship_from_state','ship_from_zip','ship_from_phone','ship_from_email')"
  ).all()
  const cfg = {}
  for (const r of (rows || [])) cfg[r.key] = r.value

  const apiKey = env.SHIPPO_API_KEY || cfg.shippo_api_key
  if (!apiKey) return json({ error: 'Shippo API key not configured. Add it in Settings → Shipping Labels.' }, 400)

  const shipping = JSON.parse(order.shipping_json || '{}')

  const shipment = {
    address_from: {
      name:    cfg.ship_from_name   || 'Pryme Labs',
      street1: cfg.ship_from_street || '7400 Moline St',
      city:    cfg.ship_from_city   || 'Houston',
      state:   cfg.ship_from_state  || 'TX',
      zip:     cfg.ship_from_zip    || '77087',
      country: 'US',
      phone:   cfg.ship_from_phone  || '',
      email:   env.OWNER_EMAIL      || cfg.ship_from_email || 'orders@prymelabs.cc',
    },
    address_to: {
      name:    shipping.name    || order.customer_name || '',
      street1: shipping.address || '',
      street2: shipping.address2 || '',
      city:    shipping.city    || '',
      state:   shipping.state   || '',
      zip:     shipping.zip     || '',
      country: 'US',
      // Recipient phone intentionally omitted so it isn't printed on the label
      // (kept on the order for SMS/records). Matches easypost-rates.js.
      email:   order.customer_email || '',
    },
    parcels: [{
      length:        String(parcel.length),
      width:         String(parcel.width),
      height:        String(parcel.height),
      distance_unit: 'in',
      weight:        String(parcel.weight),
      mass_unit:     'lb',
    }],
    carrier_accounts: [], // empty = use all connected accounts
    async: false,
  }

  const res = await fetch('https://api.goshippo.com/shipments/', {
    method:  'POST',
    headers: { Authorization: `ShippoToken ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(shipment),
  })

  const data = await res.json()
  if (!res.ok) return json({ error: data.detail || 'Shippo API error', detail: data }, res.status)

  // Collect any address or shipment-level messages
  const messages = (data.messages || []).map(m => m.text || m.code).filter(Boolean)
  const addrToMessages = (data.address_to?.validation_results?.messages || []).map(m => m.text).filter(Boolean)
  const addrFromMessages = (data.address_from?.validation_results?.messages || []).map(m => m.text).filter(Boolean)

  const allRates = data.rates || []

  // Noise carriers to suppress from error messages (international, unsupported for US domestic)
  const NOISE = ['canada_post','correos','colissimo','hermes','dpd','chronopost',
                 'deutsche_post','COURIERSPLEASE','from CA','DHL Express master']

  const isNoise = (msg) => NOISE.some(n => msg.includes(n))

  // Include ALL rates that have a price — warnings are fine, only skip true errors with $0
  const rates = allRates
    .filter(r => Number(r.amount) > 0)
    // Prefer USPS so it sorts to the top and is pre-selected; cheapest within group.
    .sort((a, b) => {
      const aUsps = /usps/i.test(a.provider) ? 0 : 1
      const bUsps = /usps/i.test(b.provider) ? 0 : 1
      if (aUsps !== bUsps) return aUsps - bUsps
      return Number(a.amount) - Number(b.amount)
    })
    .map(r => ({
      id:       r.object_id,
      carrier:  r.provider,
      service:  r.servicelevel?.name || '',
      price:    Number(r.amount),
      currency: r.currency,
      days:     r.estimated_days,
      arrives:  r.duration_terms || '',
      warnings: (r.messages || []).map(m => m.text).filter(t => t && !isNoise(t)),
    }))

  // For debug: only meaningful messages (suppress international carrier noise)
  const allMessages = [
    ...messages,
    ...addrFromMessages.map(m => `Ship-from address: ${m}`),
    ...addrToMessages.map(m => `Ship-to address: ${m}`),
    ...allRates.filter(r => !Number(r.amount)).flatMap(r =>
      (r.messages || []).map(m => m.text).filter(t => t && !isNoise(t))
    ),
  ].filter(Boolean)

  // Raw rate summary for debugging empty results
  const rawSummary = allRates.map(r =>
    `${r.provider} ${r.servicelevel?.name || ''}: $${r.amount} [${r.object_status}]`
  )

  return json({
    rates,
    shipment_id:        data.object_id,
    total_rates:        allRates.length,
    debug:              allMessages,
    raw_rates:          rawSummary,          // helps diagnose empty results
    address_to_valid:   data.address_to?.validation_results?.is_valid   ?? null,
    address_from_valid: data.address_from?.validation_results?.is_valid ?? null,
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
