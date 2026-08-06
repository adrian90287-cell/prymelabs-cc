import { ensureAdminUsersTable } from './adminPermissions.js'

function safeMeta(value) {
  try { return JSON.stringify(value || {}) } catch { return '{}' }
}

export async function logAdminAudit(env, request, actor, action, { target_type = null, target_id = null, metadata = {} } = {}) {
  try {
    await ensureAdminUsersTable(env)
    const ip = request?.headers?.get('CF-Connecting-IP') || request?.headers?.get('x-forwarded-for') || ''
    const ua = request?.headers?.get('User-Agent') || ''
    await env.DB.prepare(
      `INSERT INTO admin_audit_log
        (actor_role, actor_admin_user_id, actor_username, action, target_type, target_id, metadata_json, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      actor?.role || (actor?.owner ? 'owner' : null),
      actor?.admin_user_id || null,
      actor?.username || actor?.name || null,
      action,
      target_type,
      target_id == null ? null : String(target_id),
      safeMeta(metadata),
      String(ip).slice(0, 128),
      String(ua).slice(0, 300)
    ).run()
  } catch {}
}
