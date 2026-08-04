import { corsHeaders, json } from '../../_utils/cors.js'
import { generateToken, sha256Hex } from '../../_utils/crypto.js'
import { sendEmail, passwordResetHtml, passwordResetHtmlEs } from '../../_utils/email.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

const RESET_TTL_MINUTES = 60 // admin-generated links last a bit longer

// Admin-initiated password reset. Generates a one-time reset link for a user and
// returns it (so the owner can read/copy it to a customer whose email is dead),
// and also emails it to the customer when they have an address on file.
export async function onRequestPost({ request, env, waitUntil }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const id = body.id
  if (!id) return json({ error: 'User id required' }, 400)

  const user = await env.DB.prepare(
    'SELECT id, name, username, email, lang FROM users WHERE id = ?'
  ).bind(id).first()
  if (!user) return json({ error: 'User not found' }, 404)

  const token = generateToken()
  const tokenHash = await sha256Hex(token)
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + RESET_TTL_MINUTES * 60

  await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').bind(user.id).run()
  await env.DB.prepare(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).bind(user.id, tokenHash, expiresAt).run()

  const origin = new URL(request.url).origin
  const reset_url = `${origin}/reset-password?token=${token}`

  let emailed = false
  if (user.email) {
    const isEs = user.lang === 'es'
    const html = (isEs ? passwordResetHtmlEs : passwordResetHtml)({
      customer_name: user.name || user.username,
      username: user.username,
      reset_url,
      expires_minutes: RESET_TTL_MINUTES,
    })
    emailed = true
    waitUntil(sendEmail(env, {
      to: user.email,
      subject: isEs ? 'Restablece tu contraseña — Pryme Labs' : 'Reset your password — Pryme Labs',
      html,
    }).catch(() => {}))
  }

  return json({ ok: true, reset_url, username: user.username, emailed, expires_minutes: RESET_TTL_MINUTES })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
