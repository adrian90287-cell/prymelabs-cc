import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'

// ─────────────────────────────────────────────────────────────────────────────
// Schedule a USPS package pickup via EasyPost (free "NextDay" service).
// EasyPost requires a pickup to attach to an existing shipment, so we reference
// the most recent USPS label that has a stored shipment_id. USPS then collects
// ALL outgoing packages at the fulfillment address (pickups are address-based).
//   POST → create + buy the pickup, returns the confirmation number
//   GET  → return the last scheduled pickup (for display)
// Docs: https://docs.easypost.com/docs/pickups
// ─────────────────────────────────────────────────────────────────────────────


function authHeader(apiKey) {
  return { Authorization: `Basic ${btoa(`${apiKey}:`)}` }
}

async function getKey(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'easypost_api_key'").first()
  return env.EASYPOST_API_KEY || row?.value || null
}

export async function onRequestGet({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_pickup_json'").first()
  let pickup = null
  try { pickup = JSON.parse(row?.value || 'null') } catch {}
  return json({ pickup })
}

export async function onRequestPost({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { date, start_time, end_time, instructions, package_count } = body
  if (!date || !start_time || !end_time) {
    return json({ error: 'date, start_time and end_time are required' }, 400)
  }

  const apiKey = await getKey(env)
  if (!apiKey) return json({ error: 'EasyPost API key not configured. Add it in Settings → Shipping Labels.' }, 400)

  // Ship-from = the pickup location
  const { results: cfgRows } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('ship_from_name','ship_from_street','ship_from_city','ship_from_state','ship_from_zip','ship_from_phone')"
  ).all()
  const cfg = {}
  for (const r of (cfgRows || [])) cfg[r.key] = r.value

  // A pickup must attach to a shipment — use the most recent USPS label that has
  // a stored EasyPost shipment_id (saved when the label was purchased).
  const { results: orderRows } = await env.DB.prepare(
    "SELECT tracking_json FROM orders WHERE deleted_at IS NULL AND tracking_json LIKE '%shipment_id%' ORDER BY id DESC LIMIT 50"
  ).all()
  let shipmentId = null
  for (const r of (orderRows || [])) {
    try {
      const t = JSON.parse(r.tracking_json || '{}')
      if (t.shipment_id && /usps/i.test(t.carrier || '')) { shipmentId = t.shipment_id; break }
    } catch {}
  }
  if (!shipmentId) {
    return json({ error: 'No USPS shipment to attach the pickup to yet. Buy a USPS label first, then schedule the pickup.' }, 400)
  }

  const min_datetime = `${date} ${start_time}:00`
  const max_datetime = `${date} ${end_time}:00`

  const address = {
    name:    cfg.ship_from_name   || 'Pryme Labs',
    street1: cfg.ship_from_street || '7400 Moline St',
    city:    cfg.ship_from_city   || 'Houston',
    state:   cfg.ship_from_state  || 'TX',
    zip:     cfg.ship_from_zip    || '77087',
    country: 'US',
    phone:   cfg.ship_from_phone  || '',
  }

  const instr = [instructions, package_count ? `${package_count} package(s)` : '']
    .filter(Boolean).join(' — ') || 'Package pickup'

  // 1. Create the pickup
  const createRes = await fetch('https://api.easypost.com/v2/pickups', {
    method:  'POST',
    headers: { ...authHeader(apiKey), 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      pickup: {
        reference:          `pickup-${Date.now()}`,
        min_datetime,
        max_datetime,
        instructions:       instr,
        is_account_address: false,
        address,
        shipment:           shipmentId,
      },
    }),
  })
  const pickup = await createRes.json()
  if (!createRes.ok) {
    const msg = pickup?.error?.message || (pickup?.error?.errors || []).map(e => e.message).join(', ') || 'Pickup creation failed'
    return json({ error: msg }, createRes.status)
  }

  // 2. Find the USPS pickup rate (free) and buy it
  const rates = pickup.pickup_rates || []
  const uspsRate = rates.find(r => /usps/i.test(r.carrier))
  if (!uspsRate) {
    return json({ error: 'USPS returned no pickup rate for that window — try a different date or time.', detail: rates.map(r => `${r.carrier} ${r.service}`) }, 400)
  }

  const buyRes = await fetch(`https://api.easypost.com/v2/pickups/${pickup.id}/buy`, {
    method:  'POST',
    headers: { ...authHeader(apiKey), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ carrier: uspsRate.carrier, service: uspsRate.service }),
  })
  const bought = await buyRes.json()
  if (!buyRes.ok) {
    const msg = bought?.error?.message || (bought?.error?.errors || []).map(e => e.message).join(', ') || 'Pickup purchase failed'
    return json({ error: msg }, buyRes.status)
  }

  const result = {
    pickup_id:    bought.id || pickup.id,
    confirmation: bought.confirmation || null,
    status:       bought.status || 'scheduled',
    carrier:      uspsRate.carrier,
    service:      uspsRate.service,
    rate:         Number(uspsRate.rate) || 0,
    min_datetime,
    max_datetime,
    instructions: instr,
    scheduled_at: Math.floor(Date.now() / 1000),
  }

  // Remember the latest pickup so the admin panel can show it
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('last_pickup_json', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(JSON.stringify(result)).run()

  return json({ ok: true, ...result })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
