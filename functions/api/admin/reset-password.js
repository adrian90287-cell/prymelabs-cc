import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { sha256Hex, hashPassword } from '../../_utils/crypto.js'
import { ensureAdminUsersTable } from '../../_utils/adminPermissions.js'

export async function onRequestPost({ request, env }) {
  const rl = await checkRateLimit(env, rateLimitKey(request, 'admin-reset'))
  if (rl.blocked) return json({ error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const token = String(body.token || '').trim()
  const password = body.password
  if (!token) return json({ error: 'Reset token is required' }, 400)
  if (!password || password.length < 10 || password.length > 256) {
    return json({ error: 'Password must be 10–256 characters' }, 400)
  }

  await ensureAdminUsersTable(env)
  const tokenHash = await sha256Hex(token)
  const now = Math.floor(Date.now() / 1000)
  const reset = await env.DB.prepare(
    'SELECT id, admin_user_id, expires_at, used FROM admin_password_resets WHERE token_hash = ?'
  ).bind(tokenHash).first()

  if (!reset || reset.used || reset.expires_at < now || (!reset.admin_user_id && reset.owner !== 1)) {
    return json({ error: 'This reset link is invalid or has expired. Please request a new one.' }, 400)
  }

  const { hash, salt } = await hashPassword(password)
  if (reset.owner === 1) {
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_owner_password_hash', ?)").bind(hash),
      env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_owner_password_salt', ?)").bind(salt),
      env.DB.prepare('UPDATE admin_password_resets SET used = 1 WHERE owner = 1'),
    ])
  } else {
    await env.DB.prepare('UPDATE admin_users SET password_hash = ?, salt = ?, updated_at = ?, token_version = token_version + 1 WHERE id = ?')
      .bind(hash, salt, now, reset.admin_user_id).run()
    await env.DB.prepare('UPDATE admin_password_resets SET used = 1 WHERE admin_user_id = ?').bind(reset.admin_user_id).run()
  }
  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
