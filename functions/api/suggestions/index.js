import { verifyJWT } from '../../_utils/jwt.js'
import { corsHeaders, json } from '../../_utils/cors.js'

export async function onRequestPost({ request, env }) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const payload = await verifyJWT(authHeader.slice(7), env)
  if (!payload) return json({ error: 'Invalid or expired token' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const message = (body.message || '').trim()
  if (!message) return json({ error: 'Message is required' }, 400)
  if (message.length > 2000) return json({ error: 'Message is too long (max 2000 characters)' }, 400)

  const customerName = payload.name || payload.username || 'Customer'

  await env.DB.prepare(
    'INSERT INTO suggestions (user_id, customer_name, message) VALUES (?, ?, ?)'
  ).bind(payload.sub, customerName, message).run()

  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
