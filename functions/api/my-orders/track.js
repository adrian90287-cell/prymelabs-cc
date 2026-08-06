import { verifyJWT } from '../../_utils/jwt.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import { refreshOrderTracking } from '../../_utils/tracking.js'

// GET → live tracking for the signed-in customer's shipments.
// Each package is refreshed from the carrier at most once per 30 min
// (the throttle lives in refreshOrderTracking), so customers can't
// hammer the carrier APIs by reloading.
export async function onRequestGet({ request, env, waitUntil }) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const payload = await verifyJWT(auth.slice(7), env)
  if (!payload) return json({ error: 'Invalid token' }, 401)

  const { results: rows } = await env.DB.prepare(
    `SELECT * FROM orders
     WHERE user_id = ? AND deleted_at IS NULL
       AND status IN ('shipped', 'completed')
       AND tracking_json LIKE '%"number"%'
     ORDER BY created_at DESC LIMIT 20`
  ).bind(payload.sub).all()

  const shipments = []
  for (const order of rows || []) {
    const r = await refreshOrderTracking(env, order, { waitUntil }).catch(() => null)
    if (r) shipments.push(r)
  }

  return json({ shipments })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
