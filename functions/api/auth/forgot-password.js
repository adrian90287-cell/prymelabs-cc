import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { generateToken, sha256Hex } from '../../_utils/crypto.js'
import { sendEmail, passwordResetHtml, passwordResetHtmlEs } from '../../_utils/email.js'

const RESET_TTL_MINUTES = 30

export async function onRequestPost({ request, env, waitUntil }) {
  // Rate-limit by IP so this can't be used to spam inboxes or probe accounts
  const rl = await checkRateLimit(env, rateLimitKey(request, 'forgot'))
  if (rl.blocked) {
    return json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)
  }

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const email = String(body.email || '').trim().toLowerCase()
  // Always respond the same way whether or not the account exists — this
  // prevents using the endpoint to discover which emails have accounts.
  const genericOk = json({ ok: true })

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return genericOk
  }

  const user = await env.DB.prepare(
    'SELECT id, name, username, email, lang FROM users WHERE email = ?'
  ).bind(email).first()

  if (!user) return genericOk

  // Issue a single-use, time-limited token. Store only its hash.
  const token = generateToken()
  const tokenHash = await sha256Hex(token)
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + RESET_TTL_MINUTES * 60

  // Invalidate any earlier outstanding resets for this user, then insert the new one
  await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').bind(user.id).run()
  await env.DB.prepare(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).bind(user.id, tokenHash, expiresAt).run()

  const origin = new URL(request.url).origin
  const reset_url = `${origin}/reset-password?token=${token}`
  const isEs = user.lang === 'es'
  const html = (isEs ? passwordResetHtmlEs : passwordResetHtml)({
    customer_name: user.name || user.username,
    username: user.username,
    reset_url,
    expires_minutes: RESET_TTL_MINUTES,
  })

  waitUntil(sendEmail(env, {
    to: user.email,
    subject: isEs ? 'Restablece tu contraseña — Pryme Labs' : 'Reset your password — Pryme Labs',
    html,
  }).catch(() => {}))

  return genericOk
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
