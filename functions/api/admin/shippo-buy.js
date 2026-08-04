import { corsHeaders, json } from '../../_utils/cors.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

export async function onRequestPost({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { rate_id } = body
  if (!rate_id) return json({ error: 'rate_id required' }, 400)

  const keyRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'shippo_api_key'").first()
  const apiKey = env.SHIPPO_API_KEY || keyRow?.value
  if (!apiKey) return json({ error: 'Shippo API key not configured' }, 400)

  const res = await fetch('https://api.goshippo.com/transactions/', {
    method:  'POST',
    headers: { Authorization: `ShippoToken ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ rate: rate_id, label_file_type: 'PDF', async: false }),
  })

  const data = await res.json()

  if (!res.ok || data.status === 'ERROR') {
    const msg = (data.messages || []).map(m => m.text).join(', ') || data.detail || 'Label purchase failed'
    return json({ error: msg }, res.ok ? 400 : res.status)
  }

  return json({
    tracking_number: data.tracking_number,
    tracking_url:    data.tracking_url_provider,
    label_url:       data.label_url,
    carrier:         data.rate?.provider       || '',
    service:         data.rate?.servicelevel?.name || '',
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
