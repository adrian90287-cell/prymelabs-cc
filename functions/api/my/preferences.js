import { verifyJWT } from '../../_utils/jwt.js'
import { corsHeaders, json } from '../../_utils/cors.js'

export async function onRequestGet({ request, env }) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const payload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET)
  if (!payload) return json({ error: 'Invalid token' }, 401)

  const user = await env.DB.prepare(
    'SELECT email_unsubscribed FROM users WHERE id = ?'
  ).bind(payload.sub).first()

  return json({ email_unsubscribed: !!(user?.email_unsubscribed) })
}

export async function onRequestPost({ request, env }) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const payload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET)
  if (!payload) return json({ error: 'Invalid token' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { email_unsubscribed } = body
  await env.DB.prepare(
    'UPDATE users SET email_unsubscribed = ? WHERE id = ?'
  ).bind(email_unsubscribed ? 1 : 0, payload.sub).run()

  return json({ success: true, email_unsubscribed: !!email_unsubscribed })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
