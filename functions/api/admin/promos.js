import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'


export async function onRequestGet({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  const { results } = await env.DB.prepare(
    'SELECT * FROM promo_codes ORDER BY created_at DESC'
  ).all()
  return json({ codes: results || [] })
}

export async function onRequestPost({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { code, type, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active, no_tax, one_use_per_user, free_shipping } = body
  if (!code || discount_value === undefined) return json({ error: 'Code and discount_value required' }, 400)

  try {
    const r = await env.DB.prepare(
      'INSERT INTO promo_codes (code, type, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active, no_tax, one_use_per_user, free_shipping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      code.toUpperCase().trim(),
      type || 'promo',
      discount_type || 'percent',
      Number(discount_value),
      Number(min_order_amount) || 0,
      Number(max_uses) || 0,
      expires_at ? Math.floor(new Date(expires_at).getTime() / 1000) : null,
      is_active !== false ? 1 : 0,
      no_tax ? 1 : 0,
      one_use_per_user ? 1 : 0,
      free_shipping ? 1 : 0
    ).run()
    return json({ success: true, id: r.meta?.last_row_id })
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return json({ error: 'Code already exists' }, 409)
    return json({ error: e.message }, 500)
  }
}

export async function onRequestPut({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { id, code, type, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active, no_tax, one_use_per_user, free_shipping } = body
  if (!id) return json({ error: 'ID required' }, 400)

  try {
    await env.DB.prepare(
      'UPDATE promo_codes SET code=?, type=?, discount_type=?, discount_value=?, min_order_amount=?, max_uses=?, expires_at=?, is_active=?, no_tax=?, one_use_per_user=?, free_shipping=? WHERE id=?'
    ).bind(
      code.toUpperCase().trim(),
      type || 'promo',
      discount_type || 'percent',
      Number(discount_value),
      Number(min_order_amount) || 0,
      Number(max_uses) || 0,
      expires_at ? Math.floor(new Date(expires_at).getTime() / 1000) : null,
      is_active ? 1 : 0,
      no_tax ? 1 : 0,
      one_use_per_user ? 1 : 0,
      free_shipping ? 1 : 0,
      id
    ).run()
    return json({ success: true })
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return json({ error: 'Code already exists' }, 409)
    return json({ error: e.message }, 500)
  }
}

export async function onRequestDelete({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.id) return json({ error: 'ID required' }, 400)
  await env.DB.prepare('DELETE FROM promo_codes WHERE id = ?').bind(body.id).run()
  return json({ success: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
