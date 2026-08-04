import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { sha256Hex, hashPassword } from '../../_utils/crypto.js'

export async function onRequestPost({ request, env }) {
  // Rate-limit by IP to stop token guessing
  const rl = await checkRateLimit(env, rateLimitKey(request, 'reset'))
  if (rl.blocked) {
    return json({ error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)
  }

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const token = String(body.token || '').trim()
  const password = body.password
  if (!token) return json({ error: 'Reset token is required' }, 400)
  if (!password || password.length < 8 || password.length > 256) {
    return json({ error: 'Password must be 8–256 characters' }, 400)
  }

  const tokenHash = await sha256Hex(token)
  const now = Math.floor(Date.now() / 1000)

  const reset = await env.DB.prepare(
    'SELECT id, user_id, expires_at, used FROM password_resets WHERE token_hash = ?'
  ).bind(tokenHash).first()

  if (!reset || reset.used || reset.expires_at < now) {
    return json({ error: 'This reset link is invalid or has expired. Please request a new one.' }, 400)
  }

  const { hash, salt } = await hashPassword(password)
  await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?')
    .bind(hash, salt, reset.user_id).run()

  // Burn this token and any other outstanding resets for the account
  await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ?').bind(reset.user_id).run()

  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
