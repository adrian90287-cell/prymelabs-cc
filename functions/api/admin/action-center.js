import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'
import { ensureAdminUsersTable } from '../../_utils/adminPermissions.js'
import { ensureDepartmentWaitlistTable } from '../../_utils/departmentWaitlist.js'
import { ensurePhoneVerificationTable } from '../../_utils/phoneVerification.js'

async function first(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).first().catch(() => null)
}

export async function onRequestGet({ request, env }) {
  const rl = await checkAdminRateLimit(env, adminRateLimitKey(request, 'action-center'))
  if (rl.blocked) return json({ error: 'Rate limited' }, 429)
  const auth = await verifyAdminToken(request, env)
  if (!auth.valid) return json({ error: auth.error || 'Unauthorized' }, auth.status || 401)

  await ensureAdminUsersTable(env)
  await ensureDepartmentWaitlistTable(env)
  await ensurePhoneVerificationTable(env)

  const sevenDays = Math.floor(Date.now() / 1000) - 7 * 86400
  const [
    unpaid, lowStock, unverified, newSubs, waitlist, audit, highRisk2fa,
  ] = await Promise.all([
    first(env, "SELECT COUNT(*) AS n FROM orders WHERE deleted_at IS NULL AND status = 'pending'"),
    first(env, "SELECT COUNT(*) AS n FROM products WHERE stock_qty > 0 AND low_stock_threshold > 0 AND stock_qty <= low_stock_threshold"),
    first(env, "SELECT COUNT(*) AS n FROM users WHERE COALESCE(username, '') != 'guest_checkout' AND COALESCE(email, '') != 'guest-checkout@prymelabs.local' AND phone IS NOT NULL AND COALESCE(phone_verified,0) != 1"),
    first(env, "SELECT COUNT(*) AS n FROM users WHERE COALESCE(username, '') != 'guest_checkout' AND COALESCE(email, '') != 'guest-checkout@prymelabs.local' AND created_at >= ?", sevenDays),
    first(env, 'SELECT COUNT(*) AS n FROM department_waitlist WHERE notified_at IS NULL'),
    first(env, 'SELECT COUNT(*) AS n FROM admin_audit_log WHERE created_at >= ?', sevenDays),
    first(env, `SELECT COUNT(*) AS n FROM admin_users WHERE is_active = 1 AND totp_enabled != 1 AND (
      permissions_json LIKE '%"orders"%' OR permissions_json LIKE '%"inventory"%' OR permissions_json LIKE '%"settings"%' OR permissions_json LIKE '%"admin_users"%'
    )`),
  ])

  const { results: lowStockProducts } = await env.DB.prepare(
    'SELECT id, name, stock_qty, low_stock_threshold FROM products WHERE stock_qty > 0 AND low_stock_threshold > 0 AND stock_qty <= low_stock_threshold ORDER BY stock_qty ASC LIMIT 8'
  ).all().catch(() => ({ results: [] }))
  const { results: unpaidOrders } = await env.DB.prepare(
    "SELECT id, order_number, customer_name, order_total, status, created_at FROM orders WHERE deleted_at IS NULL AND status = 'pending' ORDER BY created_at ASC LIMIT 8"
  ).all().catch(() => ({ results: [] }))

  return json({
    cards: {
      unpaid_orders: Number(unpaid?.n || 0),
      low_stock: Number(lowStock?.n || 0),
      unverified_customers: Number(unverified?.n || 0),
      new_subscribers_7d: Number(newSubs?.n || 0),
      department_waitlist: Number(waitlist?.n || 0),
      audit_events_7d: Number(audit?.n || 0),
      staff_2fa_warnings: Number(highRisk2fa?.n || 0),
    },
    low_stock_products: lowStockProducts || [],
    unpaid_orders: unpaidOrders || [],
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
