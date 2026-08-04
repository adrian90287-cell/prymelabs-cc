import { corsHeaders, json } from '../../_utils/cors.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

export async function onRequestGet({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  const { results } = await env.DB.prepare(
    'SELECT * FROM shipping_rates ORDER BY display_order ASC, id ASC'
  ).all()
  return json({ rates: results || [] })
}

export async function onRequestPost({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { name, price, min_days, max_days, display_order } = body
  if (!name || price === undefined) return json({ error: 'Name and price required' }, 400)

  const r = await env.DB.prepare(
    'INSERT INTO shipping_rates (name, price, min_days, max_days, display_order) VALUES (?, ?, ?, ?, ?)'
  ).bind(name.trim(), Number(price), min_days || null, max_days || null, Number(display_order) || 999).run()
  return json({ success: true, id: r.meta?.last_row_id })
}

export async function onRequestPut({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { id, name, price, min_days, max_days, is_active, display_order } = body
  if (!id) return json({ error: 'ID required' }, 400)

  await env.DB.prepare(
    'UPDATE shipping_rates SET name=?, price=?, min_days=?, max_days=?, is_active=?, display_order=? WHERE id=?'
  ).bind(name.trim(), Number(price), min_days || null, max_days || null, is_active ? 1 : 0, Number(display_order) || 999, id).run()
  return json({ success: true })
}

export async function onRequestDelete({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.id) return json({ error: 'ID required' }, 400)
  await env.DB.prepare('DELETE FROM shipping_rates WHERE id = ?').bind(body.id).run()
  return json({ success: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
