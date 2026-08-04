import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'


function safeJson(s, def) {
  try { return JSON.parse(s || 'null') || def } catch { return def }
}

export async function onRequestGet({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  const { results } = await env.DB.prepare(
    'SELECT * FROM orders WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
  ).all()

  const orders = (results || []).map(o => ({
    ...o,
    items: safeJson(o.items_json, []),
    shipping: safeJson(o.shipping_json, {}),
    tracking: safeJson(o.tracking_json, {}),
  }))

  return json({ orders })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
