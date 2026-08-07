import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'


export async function onRequestGet({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  const { results } = await env.DB.prepare(`
    SELECT
      u.id,
      u.name,
      u.username,
      u.email,
      u.phone,
      u.phone_verified,
      u.lang,
      u.created_at,
      u.email_unsubscribed,
      u.sms_unsubscribed,
      COUNT(CASE WHEN o.status NOT IN ('cancelled','refunded') THEN 1 END) AS order_count,
      SUM(CASE WHEN o.status NOT IN ('cancelled','refunded')
               THEN COALESCE(o.order_total, o.subtotal, 0)
               ELSE 0 END) AS total_spent,
      MAX(o.created_at) AS last_order_at
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC, u.id DESC
  `).all()

  return json({ subscribers: results || [] })
}

export async function onRequestPut({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { id, name, phone, lang, email_unsubscribed } = body
  if (!id) return json({ error: 'User id required' }, 400)

  const cleanName = name?.trim()
  if (cleanName !== undefined && cleanName.length === 0) return json({ error: 'Name cannot be empty' }, 400)
  if (cleanName && cleanName.length > 128) return json({ error: 'Name too long' }, 400)
  if (phone !== undefined && phone?.trim().length > 20) return json({ error: 'Phone too long' }, 400)
  if (lang !== undefined && !['en', 'es'].includes(lang)) return json({ error: 'Invalid language' }, 400)

  const cols = [], params = []
  if (cleanName)                   { cols.push('name = ?');                params.push(cleanName) }
  if (phone !== undefined)         { cols.push('phone = ?');               params.push(phone?.trim() || null) }
  if (lang !== undefined)          { cols.push('lang = ?');                params.push(lang) }
  if (email_unsubscribed !== undefined) { cols.push('email_unsubscribed = ?'); params.push(email_unsubscribed ? 1 : 0) }

  if (cols.length === 0) return json({ error: 'Nothing to update' }, 400)
  params.push(id)

  await env.DB.prepare(`UPDATE users SET ${cols.join(', ')} WHERE id = ?`).bind(...params).run()
  return json({ ok: true })
}

export async function onRequestDelete({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { id } = body
  if (!id) return json({ error: 'User id required' }, 400)

  // Nullify user_id on orders so order history is preserved for records
  await env.DB.prepare('UPDATE orders SET user_id = NULL WHERE user_id = ?').bind(id).run()
  // Remove push subscriptions
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(id).run()
  // Delete the user account
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()

  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
