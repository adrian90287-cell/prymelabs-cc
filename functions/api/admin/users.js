import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'
import { generateToken, hashPassword, sha256Hex } from '../../_utils/crypto.js'
import { sendEmail, passwordResetHtml } from '../../_utils/email.js'
import { logAdminAudit } from '../../_utils/adminAudit.js'
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_LABELS,
  ensureAdminUsersTable,
  normalizePermissions,
  publicAdminUser,
} from '../../_utils/adminPermissions.js'

async function requireManager(request, env) {
  const rl = await checkAdminRateLimit(env, adminRateLimitKey(request, 'admin-users'))
  if (rl.blocked) return { error: json({ error: 'Rate limited' }, 429) }
  const auth = await verifyAdminToken(request, env)
  if (!auth.valid) return { error: json({ error: auth.error || 'Unauthorized' }, auth.status || 401) }
  return { auth }
}

function cleanUsername(value) {
  return String(value || '').trim().toLowerCase()
}

function cleanEmail(value) {
  const s = String(value || '').trim().toLowerCase()
  return s || null
}

function validateUserInput({ name, username, email, password, requirePassword }) {
  const cleanName = String(name || '').trim()
  const cleanUser = cleanUsername(username)
  const cleanMail = cleanEmail(email)

  if (!cleanName) return 'Name is required'
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(cleanUser)) return 'Username must be 3–32 letters, numbers, or underscores'
  if (cleanMail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanMail)) return 'Valid email required'
  if (requirePassword && (!password || password.length < 10)) return 'Password must be at least 10 characters'
  if (password && password.length > 256) return 'Password is too long'
  return null
}

export async function onRequestGet({ request, env }) {
  const gate = await requireManager(request, env)
  if (gate.error) return gate.error
  await ensureAdminUsersTable(env)

  const { results } = await env.DB.prepare(
    'SELECT id, name, username, email, permissions_json, is_active, totp_enabled, token_version, created_at, updated_at, last_login_at FROM admin_users ORDER BY name ASC'
  ).all()

  return json({
    permissions: ADMIN_PERMISSIONS,
    labels: ADMIN_PERMISSION_LABELS,
    users: (results || []).map(publicAdminUser),
  })
}

async function createInvite(env, request, user) {
  if (!user?.email) return
  const token = generateToken()
  const tokenHash = await sha256Hex(token)
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + 30 * 60
  await env.DB.prepare('UPDATE admin_password_resets SET used = 1 WHERE admin_user_id = ? AND used = 0').bind(user.id).run()
  await env.DB.prepare(
    'INSERT INTO admin_password_resets (admin_user_id, owner, token_hash, expires_at) VALUES (?, 0, ?, ?)'
  ).bind(user.id, tokenHash, expiresAt).run()
  const origin = new URL(request.url).origin
  const reset_url = `${origin}/reset-password?admin=1&token=${token}`
  await sendEmail(env, {
    to: user.email,
    subject: 'Set up your Pryme Labs admin password',
    html: passwordResetHtml({ customer_name: user.name || user.username, username: user.username, reset_url, expires_minutes: 30 }),
  }).catch(() => {})
}

export async function onRequestPost({ request, env, waitUntil }) {
  const gate = await requireManager(request, env)
  if (gate.error) return gate.error
  await ensureAdminUsersTable(env)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const sendInvite = body.send_invite === true
  const err = validateUserInput({ ...body, requirePassword: !sendInvite })
  if (err) return json({ error: err }, 400)
  if (sendInvite && !cleanEmail(body.email)) return json({ error: 'Email is required to send an invite' }, 400)

  const name = String(body.name).trim()
  const username = cleanUsername(body.username)
  const email = cleanEmail(body.email)
  const permissions = normalizePermissions(body.permissions)
  const { hash, salt } = await hashPassword(body.password || generateToken(24))
  const now = Math.floor(Date.now() / 1000)

  try {
    const result = await env.DB.prepare(
      `INSERT INTO admin_users (name, username, email, password_hash, salt, permissions_json, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(name, username, email, hash, salt, JSON.stringify(permissions), body.is_active === false ? 0 : 1, now, now).run()
    const user = { id: result.meta.last_row_id, name, username, email, permissions_json: JSON.stringify(permissions), is_active: body.is_active === false ? 0 : 1, created_at: now, updated_at: now }
    waitUntil?.(logAdminAudit(env, request, gate.auth.payload, 'admin_user.created', { target_type: 'admin_user', target_id: user.id, metadata: { username, permissions, invited: sendInvite } }))
    if (sendInvite) waitUntil?.(createInvite(env, request, { id: user.id, name, username, email }))
    return json({ ok: true, user: publicAdminUser(user) })
  } catch {
    return json({ error: 'Username or email already exists' }, 409)
  }
}

export async function onRequestPut({ request, env }) {
  const gate = await requireManager(request, env)
  if (gate.error) return gate.error
  await ensureAdminUsersTable(env)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const id = Number(body.id)
  if (!id) return json({ error: 'User id required' }, 400)

  const existing = await env.DB.prepare('SELECT * FROM admin_users WHERE id = ?').bind(id).first()
  if (!existing) return json({ error: 'User not found' }, 404)

  if (body.action === 'revoke_sessions') {
    const now = Math.floor(Date.now() / 1000)
    await env.DB.prepare(
      'UPDATE admin_users SET token_version = token_version + 1, updated_at = ? WHERE id = ?'
    ).bind(now, id).run()
    await logAdminAudit(env, request, gate.auth.payload, 'admin_user.sessions_revoked', {
      target_type: 'admin_user',
      target_id: id,
      metadata: { username: existing.username },
    })
    return json({ ok: true })
  }

  const err = validateUserInput({ ...body, password: body.password || '', requirePassword: false })
  if (err) return json({ error: err }, 400)

  const name = String(body.name).trim()
  const username = cleanUsername(body.username)
  const email = cleanEmail(body.email)
  const permissions = normalizePermissions(body.permissions)
  const now = Math.floor(Date.now() / 1000)

  try {
    if (body.password) {
      const { hash, salt } = await hashPassword(body.password)
      await env.DB.prepare(
        `UPDATE admin_users
           SET name = ?, username = ?, email = ?, password_hash = ?, salt = ?, permissions_json = ?, is_active = ?, updated_at = ?, token_version = token_version + 1
         WHERE id = ?`
      ).bind(name, username, email, hash, salt, JSON.stringify(permissions), body.is_active === false ? 0 : 1, now, id).run()
    } else {
      await env.DB.prepare(
        `UPDATE admin_users
           SET name = ?, username = ?, email = ?, permissions_json = ?, is_active = ?, updated_at = ?, token_version = token_version + 1
         WHERE id = ?`
      ).bind(name, username, email, JSON.stringify(permissions), body.is_active === false ? 0 : 1, now, id).run()
    }
    await logAdminAudit(env, request, gate.auth.payload, 'admin_user.updated', { target_type: 'admin_user', target_id: id, metadata: { username, permissions, active: body.is_active !== false } })
    return json({ ok: true })
  } catch {
    return json({ error: 'Username or email already exists' }, 409)
  }
}

export async function onRequestDelete({ request, env }) {
  const gate = await requireManager(request, env)
  if (gate.error) return gate.error
  await ensureAdminUsersTable(env)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const id = Number(body.id)
  if (!id) return json({ error: 'User id required' }, 400)
  await env.DB.prepare('DELETE FROM admin_users WHERE id = ?').bind(id).run()
  await logAdminAudit(env, request, gate.auth.payload, 'admin_user.deleted', { target_type: 'admin_user', target_id: id })
  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
