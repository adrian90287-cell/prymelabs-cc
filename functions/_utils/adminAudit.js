import { ensureAdminUsersTable } from './adminPermissions.js'
import { sendEmail } from './email.js'

function safeMeta(value) {
  try { return JSON.stringify(value || {}) } catch { return '{}' }
}

const ALERT_ACTIONS = new Set([
  'admin_user.created',
  'admin_user.updated',
  'admin_user.deleted',
  'admin_user.sessions_revoked',
  'admin_2fa.enabled',
  'admin_2fa.disabled',
  'admin_profile.updated',
  'admin_profile.password_changed',
  'admin_password_reset.requested',
  'admin_password_reset.completed',
])

async function sendAdminSecurityAlert(env, request, actor, action, target_type, target_id, metadata) {
  if (!ALERT_ACTIONS.has(action)) return
  if (!env.OWNER_EMAIL || !env.BREVO_API_KEY || env.ADMIN_SECURITY_ALERTS_OFF === '1') return
  const origin = request ? new URL(request.url).origin : 'https://prymelabs.cc'
  const actorName = actor?.username || actor?.name || actor?.role || (actor?.owner ? 'owner' : 'unknown admin')
  const ip = request?.headers?.get('CF-Connecting-IP') || request?.headers?.get('x-forwarded-for') || ''
  const when = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
  const meta = safeMeta(metadata)
  await sendEmail(env, {
    to: env.OWNER_EMAIL,
    subject: `Pryme Labs admin security alert: ${action}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px">Admin security alert</h2>
        <p>A sensitive admin action was recorded.</p>
        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
          <tr><td><b>Action</b></td><td>${action}</td></tr>
          <tr><td><b>Actor</b></td><td>${actorName}</td></tr>
          <tr><td><b>Target</b></td><td>${target_type || 'system'}${target_id ? ` #${target_id}` : ''}</td></tr>
          <tr><td><b>IP</b></td><td>${ip || 'unknown'}</td></tr>
          <tr><td><b>Time</b></td><td>${when} CT</td></tr>
        </table>
        <p style="font-size:12px;color:#555">Metadata: ${meta}</p>
        <p><a href="${origin}/admin" style="color:#2563eb">Open admin panel</a></p>
      </div>
    `,
  }).catch(() => {})
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
    await sendAdminSecurityAlert(env, request, actor, action, target_type, target_id, metadata)
  } catch {}
}
