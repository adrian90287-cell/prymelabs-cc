import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { ensureAdminUsersTable } from '../../_utils/adminPermissions.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'

export async function onRequestGet({ request, env }) {
  const rl = await checkAdminRateLimit(env, adminRateLimitKey(request, 'audit-log'))
  if (rl.blocked) return json({ error: 'Rate limited' }, 429)
  const auth = await verifyAdminToken(request, env)
  if (!auth.valid) return json({ error: auth.error || 'Unauthorized' }, auth.status || 401)
  await ensureAdminUsersTable(env)
  const url = new URL(request.url)
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase()
  const action = String(url.searchParams.get('action') || '').trim()
  const actor = String(url.searchParams.get('actor') || '').trim().toLowerCase()
  const days = Math.min(365, Math.max(0, Number(url.searchParams.get('days') || 0)))
  const limit = Math.min(500, Math.max(25, Number(url.searchParams.get('limit') || 250)))
  const where = []
  const params = []
  if (q) {
    where.push(`(lower(action) LIKE ? OR lower(actor_username) LIKE ? OR lower(target_type) LIKE ? OR lower(target_id) LIKE ?)`)
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
  }
  if (action) { where.push('action = ?'); params.push(action) }
  if (actor) { where.push('lower(actor_username) LIKE ?'); params.push(`%${actor}%`) }
  if (days) { where.push('created_at >= ?'); params.push(Math.floor(Date.now() / 1000) - days * 86400) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT id, actor_role, actor_admin_user_id, actor_username, action, target_type, target_id, metadata_json, ip, created_at
       FROM admin_audit_log
      ${whereSql}
      ORDER BY id DESC
      LIMIT ?`
  ).bind(...params, limit).all()
  return json({ events: (results || []).map(e => ({ ...e, metadata: safeJson(e.metadata_json, {}) })) })
}

function safeJson(s, def) {
  try { return JSON.parse(s || 'null') || def } catch { return def }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
