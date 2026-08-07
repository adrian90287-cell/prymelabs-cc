import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyJWT, signJWT } from '../../_utils/jwt.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { normalizePhone } from '../../_utils/phoneVerification.js'

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email || '',
    phone: row.phone || null,
    lang: ['en', 'es'].includes(row.lang) ? row.lang : 'en',
    phone_verified: row.phone_verified === 1,
  }
}

async function tokenFor(row, env) {
  return signJWT({
    sub: row.id,
    username: row.username,
    name: row.name,
    email: row.email || '',
    phone: row.phone || null,
    lang: ['en', 'es'].includes(row.lang) ? row.lang : 'en',
    phone_verified: row.phone_verified === 1,
    tv: row.token_version || 0,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  }, env.JWT_SECRET)
}

async function ensurePhoneColumns(env) {
  for (const stmt of [
    'ALTER TABLE users ADD COLUMN phone_norm TEXT',
    'ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0',
  ]) {
    try { await env.DB.prepare(stmt).run() } catch {}
  }
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('Authorization') || ''
  const payload = auth.startsWith('Bearer ') ? await verifyJWT(auth.slice(7), env) : null
  if (!payload) return json({ error: 'Unauthorized' }, 401)

  const rl = await checkRateLimit(env, rateLimitKey(request, `update-phone:${payload.sub}`))
  if (rl.blocked) return json({ error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const phoneNorm = normalizePhone(body.phone)
  if (!phoneNorm || phoneNorm.length < 10 || phoneNorm.length > 15) return json({ error: 'Enter a valid phone number' }, 400)

  await ensurePhoneColumns(env)
  const existing = await env.DB.prepare(
    `SELECT id FROM users
      WHERE id != ? AND (
        phone_norm = ?
        OR phone = ?
        OR replace(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+1', '') = ?
        OR replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?
      )
      LIMIT 1`
  ).bind(payload.sub, phoneNorm, phoneNorm, phoneNorm, `1${phoneNorm}`).first()
  if (existing) return json({ error: 'That phone number is already used by another account' }, 409)

  await env.DB.prepare('UPDATE users SET phone = ?, phone_norm = ?, phone_verified = 0 WHERE id = ?')
    .bind(phoneNorm, phoneNorm, payload.sub).run()

  const user = await env.DB.prepare('SELECT id, name, username, email, phone, phone_verified, lang, token_version FROM users WHERE id = ?')
    .bind(payload.sub).first()
  if (!user) return json({ error: 'User not found' }, 404)

  const token = await tokenFor(user, env)
  return json({ ok: true, token, user: publicUser(user) })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
