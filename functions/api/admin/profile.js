import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { hashPassword, verifyPassword } from '../../_utils/crypto.js'
import { ensureAdminUsersTable, publicAdminUser } from '../../_utils/adminPermissions.js'
import { constantTimeCompare } from '../../_utils/constantTime.js'
import { logAdminAudit } from '../../_utils/adminAudit.js'

async function ownerProfile(env) {
  const username = (await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_owner_username'").first().catch(() => null))?.value || 'owner'
  const twoFA = (await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_2fa_enabled'").first().catch(() => null))?.value === '1'
  return { role: 'owner', owner: true, name: 'Owner', username, email: '', totp_enabled: twoFA, permissions: ['*'] }
}

async function verifyOwnerPassword(env, password) {
  const hashRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_owner_password_hash'").first().catch(() => null)
  const saltRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_owner_password_salt'").first().catch(() => null)
  if (hashRow?.value && saltRow?.value && await verifyPassword(password, hashRow.value, saltRow.value)) return true
  return !!env.ADMIN_PASSWORD && constantTimeCompare(String(password || ''), String(env.ADMIN_PASSWORD))
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAdminToken(request, env)
  if (!auth.valid) return json({ error: auth.error || 'Unauthorized' }, auth.status || 401)
  await ensureAdminUsersTable(env)
  if (auth.payload.owner || auth.payload.role === 'owner' || !auth.payload.role) return json({ admin: await ownerProfile(env) })

  const row = await env.DB.prepare('SELECT id, name, username, email, permissions_json, is_active, totp_enabled, created_at, updated_at, last_login_at FROM admin_users WHERE id = ?')
    .bind(auth.payload.admin_user_id).first()
  return json({ admin: publicAdminUser(row) })
}

export async function onRequestPut({ request, env }) {
  const auth = await verifyAdminToken(request, env)
  if (!auth.valid) return json({ error: auth.error || 'Unauthorized' }, auth.status || 401)
  await ensureAdminUsersTable(env)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const currentPassword = String(body.current_password || '')
  const newPassword = String(body.new_password || '')
  const username = String(body.username || '').trim().toLowerCase()
  const email = String(body.email || '').trim().toLowerCase()

  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) return json({ error: 'Username must be 3–32 letters, numbers, or underscores' }, 400)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Valid email required' }, 400)
  if (newPassword && (newPassword.length < 10 || newPassword.length > 256)) return json({ error: 'New password must be 10–256 characters' }, 400)

  const isOwner = auth.payload.owner || auth.payload.role === 'owner' || !auth.payload.role
  if (isOwner) {
    if (!await verifyOwnerPassword(env, currentPassword)) return json({ error: 'Current password is incorrect' }, 401)
    const stmts = [
      env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_owner_username', ?)").bind(username),
    ]
    if (newPassword) {
      const { hash, salt } = await hashPassword(newPassword)
      stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_owner_password_hash', ?)").bind(hash))
      stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_owner_password_salt', ?)").bind(salt))
    }
    await env.DB.batch(stmts)
    return json({ ok: true, admin: await ownerProfile(env) })
  }

  const row = await env.DB.prepare('SELECT * FROM admin_users WHERE id = ? AND is_active = 1').bind(auth.payload.admin_user_id).first()
  if (!row) return json({ error: 'User not found' }, 404)
  if (!await verifyPassword(currentPassword, row.password_hash, row.salt)) return json({ error: 'Current password is incorrect' }, 401)

  try {
    if (newPassword) {
      const { hash, salt } = await hashPassword(newPassword)
      await env.DB.prepare('UPDATE admin_users SET username = ?, email = ?, password_hash = ?, salt = ?, updated_at = ?, token_version = token_version + 1 WHERE id = ?')
        .bind(username, email || null, hash, salt, Math.floor(Date.now() / 1000), row.id).run()
    } else {
      await env.DB.prepare('UPDATE admin_users SET username = ?, email = ?, updated_at = ? WHERE id = ?')
        .bind(username, email || null, Math.floor(Date.now() / 1000), row.id).run()
    }
  } catch {
    return json({ error: 'Username or email already exists' }, 409)
  }
  await logAdminAudit(env, request, auth.payload, 'admin_profile.updated', { target_type: 'admin_user', target_id: row.id, metadata: { username, changed_password: !!newPassword } })
  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
