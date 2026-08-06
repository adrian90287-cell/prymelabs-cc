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
  const { results } = await env.DB.prepare(
    `SELECT id, actor_role, actor_admin_user_id, actor_username, action, target_type, target_id, metadata_json, ip, created_at
       FROM admin_audit_log
      ORDER BY id DESC
      LIMIT 250`
  ).all()
  return json({ events: (results || []).map(e => ({ ...e, metadata: safeJson(e.metadata_json, {}) })) })
}

function safeJson(s, def) {
  try { return JSON.parse(s || 'null') || def } catch { return def }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
