import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { generateToken, sha256Hex } from '../../_utils/crypto.js'
import { sendEmail, passwordResetHtml } from '../../_utils/email.js'
import { ensureAdminUsersTable } from '../../_utils/adminPermissions.js'

const RESET_TTL_MINUTES = 30

export async function onRequestPost({ request, env, waitUntil }) {
  const rl = await checkRateLimit(env, rateLimitKey(request, 'admin-forgot'))
  if (rl.blocked) return json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const identifier = String(body.identifier || '').trim().toLowerCase()
  const genericOk = json({ ok: true })
  if (!identifier || identifier.length > 254) return genericOk

  await ensureAdminUsersTable(env)
  const ownerUsername = (await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_owner_username'").first().catch(() => null))?.value || 'owner'
  if (env.OWNER_EMAIL && (identifier === ownerUsername.toLowerCase() || identifier === 'owner' || identifier === String(env.OWNER_EMAIL).toLowerCase())) {
    const token = generateToken()
    const tokenHash = await sha256Hex(token)
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = now + RESET_TTL_MINUTES * 60
    await env.DB.prepare('UPDATE admin_password_resets SET used = 1 WHERE owner = 1 AND used = 0').run()
    await env.DB.prepare(
      'INSERT INTO admin_password_resets (admin_user_id, owner, token_hash, expires_at) VALUES (NULL, 1, ?, ?)'
    ).bind(tokenHash, expiresAt).run()
    const origin = new URL(request.url).origin
    const reset_url = `${origin}/reset-password?admin=1&token=${token}`
    waitUntil(sendEmail(env, {
      to: env.OWNER_EMAIL,
      subject: 'Reset your owner admin password — Pryme Labs',
      html: passwordResetHtml({
        customer_name: 'Owner',
        username: ownerUsername,
        reset_url,
        expires_minutes: RESET_TTL_MINUTES,
      }),
    }).catch(() => {}))
    return genericOk
  }

  const user = await env.DB.prepare(
    'SELECT id, name, username, email FROM admin_users WHERE is_active = 1 AND (username = ? OR lower(email) = ?) LIMIT 1'
  ).bind(identifier, identifier).first()

  if (!user?.email) return genericOk

  const token = generateToken()
  const tokenHash = await sha256Hex(token)
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + RESET_TTL_MINUTES * 60

  await env.DB.prepare('UPDATE admin_password_resets SET used = 1 WHERE admin_user_id = ? AND used = 0').bind(user.id).run()
  await env.DB.prepare(
    'INSERT INTO admin_password_resets (admin_user_id, owner, token_hash, expires_at) VALUES (?, 0, ?, ?)'
  ).bind(user.id, tokenHash, expiresAt).run()

  const origin = new URL(request.url).origin
  const reset_url = `${origin}/reset-password?admin=1&token=${token}`
  waitUntil(sendEmail(env, {
    to: user.email,
    subject: 'Reset your admin password — Pryme Labs',
    html: passwordResetHtml({
      customer_name: user.name || user.username,
      username: user.username,
      reset_url,
      expires_minutes: RESET_TTL_MINUTES,
    }),
  }).catch(() => {}))

  return genericOk
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
