import { json, corsHeaders } from '../../_utils/cors.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { ensureAdminUsersTable } from '../../_utils/adminPermissions.js'

async function getColumns(env, table) {
  try {
    const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all()
    return (results || []).map(r => r.name)
  } catch {
    return []
  }
}

async function getIndexes(env, table) {
  try {
    const { results } = await env.DB.prepare(`PRAGMA index_list(${table})`).all()
    return (results || []).map(r => r.name)
  } catch {
    return []
  }
}

async function tableCount(env, table) {
  try {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()
    return Number(row?.count || 0)
  } catch {
    return null
  }
}

async function duplicatePhoneGroups(env) {
  try {
    const row = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM (
        SELECT phone_norm
        FROM users
        WHERE phone_norm IS NOT NULL AND phone_norm != ''
        GROUP BY phone_norm
        HAVING COUNT(*) > 1
      )
    `).first()
    return Number(row?.count || 0)
  } catch {
    return null
  }
}

function check(ok, label, detail, severity = 'ok') {
  return { ok, label, detail, severity: ok ? 'ok' : severity }
}

export async function onRequestGet({ request, env }) {
  const auth = await verifyAdminToken(request, env)
  if (!auth.valid) return json({ error: auth.error || 'Unauthorized' }, auth.status || 401)

  await ensureAdminUsersTable(env)

  const adminCols = await getColumns(env, 'admin_users')
  const resetCols = await getColumns(env, 'admin_password_resets')
  const auditCols = await getColumns(env, 'admin_audit_log')
  const userCols = await getColumns(env, 'users')
  const userIndexes = await getIndexes(env, 'users')
  const adminUsers = await tableCount(env, 'admin_users')
  const auditEvents = await tableCount(env, 'admin_audit_log')
  const duplicatePhones = await duplicatePhoneGroups(env)
  const highRiskWithout2fa = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM admin_users
    WHERE is_active = 1
      AND totp_enabled != 1
      AND (
        permissions_json LIKE '%"orders"%'
        OR permissions_json LIKE '%"inventory"%'
        OR permissions_json LIKE '%"settings"%'
        OR permissions_json LIKE '%"admin_users"%'
      )
  `).first().then(r => Number(r?.count || 0)).catch(() => null)

  const owner2fa = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_2fa_enabled'")
    .first()
    .then(r => String(r?.value || '') === '1')
    .catch(() => null)

  const checks = [
    check(adminCols.includes('token_version') && adminCols.includes('totp_secret') && adminCols.includes('totp_enabled'),
      'Admin 2FA/session columns', 'Admin users can require 2FA and old staff sessions can be revoked.', 'critical'),
    check(resetCols.includes('token_hash') && resetCols.includes('expires_at') && resetCols.includes('used'),
      'Admin password reset table', 'Admin password reset links can be tracked and expired.', 'critical'),
    check(auditCols.includes('action') && auditCols.includes('created_at'),
      'Admin audit log table', 'Sensitive admin changes are being recorded.', 'warning'),
    check(userCols.includes('phone_norm') && userCols.includes('phone_verified'),
      'Customer phone security columns', 'Customer phone numbers can be normalized and prepared for verification.', 'warning'),
    check(userIndexes.includes('idx_users_phone_norm_unique'),
      'Duplicate phone lock', 'The database blocks multiple customer accounts from sharing the same normalized phone number.', 'warning'),
    check(duplicatePhones === 0 || duplicatePhones === null,
      'Existing duplicate phones', duplicatePhones === null ? 'Could not check duplicates yet.' : `${duplicatePhones} duplicate phone group(s) found.`, 'warning'),
    check(highRiskWithout2fa === 0 || highRiskWithout2fa === null,
      'Staff 2FA coverage', highRiskWithout2fa === null ? 'Could not check staff 2FA coverage.' : `${highRiskWithout2fa} high-access staff account(s) still need 2FA.`, 'warning'),
    check(owner2fa === true,
      'Owner 2FA', owner2fa === null ? 'Owner 2FA setting could not be checked.' : 'Owner-level 2FA is enabled.', 'warning'),
    check(Boolean(env.JWT_SECRET), 'Admin token secret', 'JWT secret is configured server-side.', 'critical'),
    check(Boolean(env.BREVO_API_KEY), 'Email sender', 'Email service is configured for invites and password resets.', 'warning'),
    check(Boolean(env.OWNER_EMAIL), 'Owner alert email', 'Owner email is configured for security/admin alerts.', 'warning'),
    check(Boolean(env.OWNER_PHONE), 'Owner SMS number', 'Owner phone is configured for SMS alerts.', 'info'),
  ]

  const criticalOpen = checks.filter(c => !c.ok && c.severity === 'critical').length
  const warningsOpen = checks.filter(c => !c.ok && c.severity === 'warning').length

  return json({
    ok: criticalOpen === 0,
    summary: { criticalOpen, warningsOpen, adminUsers, auditEvents },
    checks,
    generated_at: Math.floor(Date.now() / 1000),
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
