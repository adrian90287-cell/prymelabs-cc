import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyJWT, signJWT } from '../../_utils/jwt.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { sha256Hex } from '../../_utils/crypto.js'
import { ensurePhoneVerificationTable, normalizePhone } from '../../_utils/phoneVerification.js'

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

function verificationEmail(user) {
  return String(user?.email || '').trim().toLowerCase()
}

function verificationKeys(user) {
  const keys = []
  const email = verificationEmail(user)
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) keys.push(email)
  const phoneNorm = user.phone_norm || normalizePhone(user.phone)
  if (phoneNorm && !keys.includes(phoneNorm)) keys.push(phoneNorm)
  return { keys, phoneNorm }
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('Authorization') || ''
  const payload = auth.startsWith('Bearer ') ? await verifyJWT(auth.slice(7), env) : null
  if (!payload) return json({ error: 'Unauthorized' }, 401)

  const rl = await checkRateLimit(env, rateLimitKey(request, `phone-code:${payload.sub}`))
  if (rl.blocked) return json({ error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const code = String(body.code || '').replace(/\D/g, '')
  if (!/^\d{6}$/.test(code)) return json({ error: 'Enter the 6-digit code' }, 400)

  await ensurePhoneVerificationTable(env)
  const user = await env.DB.prepare('SELECT id, name, username, email, phone, phone_norm, phone_verified, lang, token_version FROM users WHERE id = ?')
    .bind(payload.sub).first()
  if (!user) return json({ error: 'User not found' }, 404)
  if (user.phone_verified === 1) {
    const token = await tokenFor(user, env)
    return json({ ok: true, token, user: publicUser(user) })
  }

  const { keys, phoneNorm } = verificationKeys(user)
  if (!keys.length) return json({ error: 'No valid email address on this account' }, 400)
  const now = Math.floor(Date.now() / 1000)
  const row = await env.DB.prepare(
    'SELECT id, code_hash, attempts, expires_at FROM phone_verifications WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1'
  ).bind(user.id).first()
  if (!row || Number(row.expires_at) < now) return json({ error: 'This code has expired. Please request a new one.' }, 400)
  if (Number(row.attempts || 0) >= 5) return json({ error: 'Too many wrong codes. Please request a new one.' }, 429)

  const expectedHashes = await Promise.all(keys.map(key => sha256Hex(`${user.id}:${key}:${code}:${env.JWT_SECRET}`)))
  if (!expectedHashes.includes(row.code_hash)) {
    await env.DB.prepare('UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run()
    return json({ error: 'Invalid verification code' }, 400)
  }

  await env.DB.batch([
    env.DB.prepare('UPDATE users SET phone_verified = 1, phone_norm = COALESCE(?, phone_norm) WHERE id = ?').bind(phoneNorm || null, user.id),
    env.DB.prepare('UPDATE phone_verifications SET used = 1 WHERE user_id = ?').bind(user.id),
  ])
  const updated = { ...user, phone_norm: phoneNorm || user.phone_norm, phone_verified: 1 }
  const token = await tokenFor(updated, env)
  return json({ ok: true, token, user: publicUser(updated) })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
