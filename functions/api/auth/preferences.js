import { verifyJWT } from '../../_utils/jwt.js'
import { corsHeaders, json } from '../../_utils/cors.js'

export async function onRequestPut({ request, env }) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const payload = await verifyJWT(authHeader.slice(7), env)
  if (!payload) return json({ error: 'Invalid or expired token' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { lang } = body
  if (!lang || !['en', 'es'].includes(lang)) {
    return json({ error: 'lang must be "en" or "es"' }, 400)
  }

  await env.DB.prepare('UPDATE users SET lang = ? WHERE id = ?')
    .bind(lang, payload.sub)
    .run()

  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
