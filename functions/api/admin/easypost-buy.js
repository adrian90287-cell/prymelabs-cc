import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'


function authHeader(apiKey) {
  return { Authorization: `Basic ${btoa(`${apiKey}:`)}` }
}

export async function onRequestPost({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { shipment_id, rate_id } = body
  if (!shipment_id || !rate_id) return json({ error: 'shipment_id and rate_id required' }, 400)

  const keyRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'easypost_api_key'").first()
  const apiKey = env.EASYPOST_API_KEY || keyRow?.value
  if (!apiKey) return json({ error: 'EasyPost API key not configured' }, 400)

  const res = await fetch(`https://api.easypost.com/v2/shipments/${shipment_id}/buy`, {
    method:  'POST',
    headers: { ...authHeader(apiKey), 'Content-Type': 'application/json' },
    body:    JSON.stringify({ rate: { id: rate_id } }),
  })

  const data = await res.json()

  if (!res.ok) {
    const msg = data?.error?.message || (data?.error?.errors || []).map(e => e.message).join(', ') || 'Label purchase failed'
    return json({ error: msg }, res.status)
  }

  return json({
    tracking_number: data.tracking_code,
    tracking_url:    data.tracker?.public_url || null,
    label_url:       data.postage_label?.label_url || null,
    carrier:         cleanCarrier(data.selected_rate?.carrier),
    service:         cleanService(data.selected_rate?.service),
  })
}

// EasyPost's rate.carrier is the carrier_account nickname (e.g. "UPSDAP",
// "FedExDefault") — normalize to the real carrier name. Mirrors easypost-rates.js.
function cleanCarrier(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('fedex')) return 'FedEx'
  if (s.includes('ups'))   return 'UPS'
  if (s.includes('usps'))  return 'USPS'
  if (s.includes('dhl'))   return 'DHL'
  return raw || ''
}

// Service codes come back SCREAMING_SNAKE_CASE — make them readable.
function cleanService(raw) {
  return (raw || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
