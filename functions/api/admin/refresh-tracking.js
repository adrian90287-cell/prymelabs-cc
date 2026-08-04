import { corsHeaders, json } from '../../_utils/cors.js'
import { refreshOrderTracking } from '../../_utils/tracking.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

async function getEasyPostKey(env) {
  // Prefer environment variable, fall back to DB setting
  if (env.EASYPOST_API_KEY) return env.EASYPOST_API_KEY
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'easypost_api_key'").first()
  return row?.value || null
}

// POST { order_id?: number, force?: boolean }
export async function onRequestPost({ request, env, waitUntil }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { body = {} }
  const { order_id, force } = body

  // Fetch EasyPost key once — used for all tracking calls
  const easypostKey = await getEasyPostKey(env)

  if (order_id) {
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL').bind(order_id).first()
    if (!order) return json({ error: 'Order not found' }, 404)
    const result = await refreshOrderTracking(env, order, { force: force !== false, waitUntil, easypostKey })
    if (!result) return json({ error: 'Order has no tracking number' }, 400)
    return json({ ok: true, results: [result] })
  }

  // Batch refresh active shipments. Includes 'fulfilled' so that orders whose
  // label was printed but not yet marked shipped get auto-promoted to 'shipped'
  // once the carrier scans them (refreshOrderTracking handles the promotion).
  const { results: rows } = await env.DB.prepare(
    `SELECT * FROM orders
     WHERE status IN ('fulfilled', 'shipped') AND deleted_at IS NULL AND tracking_json LIKE '%"number"%'
     ORDER BY COALESCE(shipped_at, fulfilled_at, created_at) DESC LIMIT 50`
  ).all()

  const results = []
  for (const order of rows || []) {
    const r = await refreshOrderTracking(env, order, { force: !!force, waitUntil, easypostKey }).catch(() => null)
    if (r) results.push(r)
  }

  return json({ ok: true, results })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
