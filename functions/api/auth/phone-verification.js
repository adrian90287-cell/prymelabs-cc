import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyJWT, signJWT } from '../../_utils/jwt.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { sha256Hex } from '../../_utils/crypto.js'
import { sendSMS } from '../../_utils/email.js'
import { ensurePhoneVerificationTable, normalizePhone, randomPhoneCode, smsPhone } from '../../_utils/phoneVerification.js'

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

export async function onRequestPost({ request, env, waitUntil }) {
  const auth = request.headers.get('Authorization') || ''
  const payload = auth.startsWith('Bearer ') ? await verifyJWT(auth.slice(7), env) : null
  if (!payload) return json({ error: 'Unauthorized' }, 401)

  const rl = await checkRateLimit(env, rateLimitKey(request, `phone-verify:${payload.sub}`))
  if (rl.blocked) return json({ error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)

  await ensurePhoneVerificationTable(env)
  const user = await env.DB.prepare('SELECT id, name, username, email, phone, phone_norm, phone_verified, lang, token_version FROM users WHERE id = ?')
    .bind(payload.sub).first()
  if (!user) return json({ error: 'User not found' }, 404)
  if (user.phone_verified === 1) {
    const token = await tokenFor(user, env)
    return json({ ok: true, already_verified: true, token, user: publicUser(user) })
  }

  const phoneNorm = user.phone_norm || normalizePhone(user.phone)
  const to = smsPhone(phoneNorm)
  if (!phoneNorm || !to) return json({ error: 'No valid phone number on this account' }, 400)
  if (!env.QUO_API_KEY || !env.QUO_PHONE_NUMBER) return json({ error: 'SMS verification is not configured yet' }, 503)

  const now = Math.floor(Date.now() / 1000)
  const recent = await env.DB.prepare(
    'SELECT sent_at FROM phone_verifications WHERE user_id = ? AND used = 0 ORDER BY sent_at DESC LIMIT 1'
  ).bind(user.id).first()
  if (recent?.sent_at && now - Number(recent.sent_at) < 45) {
    return json({ error: 'Please wait a moment before requesting another code' }, 429)
  }

  const code = randomPhoneCode()
  const codeHash = await sha256Hex(`${user.id}:${phoneNorm}:${code}:${env.JWT_SECRET}`)
  await env.DB.prepare('UPDATE phone_verifications SET used = 1 WHERE user_id = ? AND used = 0').bind(user.id).run()
  await env.DB.prepare(
    'INSERT INTO phone_verifications (user_id, phone_norm, code_hash, expires_at, sent_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.id, phoneNorm, codeHash, now + 10 * 60, now).run()

  waitUntil?.(sendSMS(env, {
    to,
    message: `Pryme Labs verification code: ${code}. It expires in 10 minutes.`,
  }).catch(() => {}))

  return json({ ok: true, expires_minutes: 10, phone_hint: phoneNorm.slice(-4) })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
