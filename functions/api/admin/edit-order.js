import { corsHeaders, json } from '../../_utils/cors.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

// Lightweight editor for mutable order fields — no status transitions, no
// customer notifications, no OneDrive backup. Used to correct the shipping
// address before a reship and to save internal (admin-only) notes.
export async function onRequestPost({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { order_id, shipping, internal_notes } = body
  if (!order_id) return json({ error: 'order_id required' }, 400)

  const order = await env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(order_id).first()
  if (!order) return json({ error: 'Order not found' }, 404)

  const sets = []
  const params = []

  if (shipping !== undefined) {
    if (typeof shipping !== 'object' || shipping === null) return json({ error: 'shipping must be an object' }, 400)
    sets.push('shipping_json = ?')
    params.push(JSON.stringify(shipping))
  }

  if (internal_notes !== undefined) {
    sets.push('internal_notes = ?')
    params.push(internal_notes == null ? null : String(internal_notes))
  }

  if (sets.length === 0) return json({ error: 'Nothing to update' }, 400)

  params.push(order_id)
  await env.DB.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()

  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
