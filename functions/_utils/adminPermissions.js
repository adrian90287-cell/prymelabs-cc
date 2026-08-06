export const ADMIN_PERMISSIONS = [
  'orders',
  'willcall',
  'inventory',
  'subscribers',
  'analytics',
  'promos',
  'reviews',
  'coa',
  'settings',
  'storefront',
  'tax',
  'announce',
  'suggestions',
  'trash',
  'admin_users',
]

export const ADMIN_PERMISSION_LABELS = {
  orders: 'Orders',
  willcall: 'Will Call',
  inventory: 'Products / Inventory',
  subscribers: 'Subscribers',
  analytics: 'Analytics',
  promos: 'Promos',
  reviews: 'Reviews',
  coa: 'Certificates / COAs',
  settings: 'Settings',
  storefront: 'Storefront Links',
  tax: 'Tax Records',
  announce: 'Announcements',
  suggestions: 'Suggestions',
  trash: 'Trash',
  admin_users: 'Admin Users & Permissions',
}

export const HIGH_RISK_ADMIN_PERMISSIONS = ['orders', 'inventory', 'settings', 'admin_users']

export function normalizePermissions(value) {
  let arr = value
  if (typeof value === 'string') {
    try { arr = JSON.parse(value) } catch { arr = value.split(',') }
  }
  if (!Array.isArray(arr)) arr = []
  return [...new Set(arr.filter(p => ADMIN_PERMISSIONS.includes(p)))]
}

export function requiresStrongAdmin2FA(permissions) {
  const perms = normalizePermissions(permissions)
  return perms.some(p => HIGH_RISK_ADMIN_PERMISSIONS.includes(p))
}

export function hasAdminPermission(payload, permission) {
  if (!permission) return true
  if (payload?.owner === true || payload?.role === 'owner') return true
  // Backward compatibility: older admin tokens were minted as { admin: true }
  // before per-user permissions existed. Treat them as owner/root until their
  // normal short session expires so deploying this cannot lock out the owner.
  if (payload?.admin === true && !payload.role && !payload.admin_user_id && payload.permissions == null) return true
  const perms = normalizePermissions(payload?.permissions)
  return perms.includes(permission)
}

export function inferAdminPermission(request) {
  try {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '')

    if (path === '/api/admin/session') return null
    if (path === '/api/admin/profile' || path === '/api/admin/totp' || path === '/api/admin/totp-disable') return null
    if (path === '/api/admin/audit-log') return 'admin_users'
    if (path === '/api/admin/users') return 'admin_users'
    if (path === '/api/admin/dashboard') return 'orders'
    if (path === '/api/admin/products' || path === '/api/admin/generate-description' || path === '/api/admin/translate-all') return 'inventory'
    if (path === '/api/admin/settings' || path === '/api/admin/onedrive-auth' || path === '/api/admin/shipping-rates' || path === '/api/admin/schedule-pickup') return 'settings'
    if (path === '/api/admin/promos') return 'promos'
    if (path === '/api/admin/reviews') return 'reviews'
    if (path === '/api/admin/coa') return 'coa'
    if (path === '/api/admin/subscribers' || path === '/api/admin/reset-user-password') return 'subscribers'
    if (path === '/api/admin/analytics') return 'analytics'
    if (path === '/api/admin/announce') return 'announce'
    if (path === '/api/admin/suggestions') return 'suggestions'
    if (path === '/api/admin/trash-orders') return 'trash'
    if (path === '/api/admin/will-call-order') return 'willcall'

    const orderOps = [
      '/api/admin/update-order',
      '/api/admin/edit-order',
      '/api/admin/delete-order',
      '/api/admin/payment-reminder',
      '/api/admin/easypost-rates',
      '/api/admin/easypost-buy',
      '/api/admin/shippo-rates',
      '/api/admin/shippo-buy',
      '/api/admin/uber-dispatch',
      '/api/admin/refresh-tracking',
      '/api/admin/backfill-labels',
      '/api/admin/push-subscribe',
    ]
    if (orderOps.includes(path)) return 'orders'
  } catch {}
  return null
}

export async function ensureAdminUsersTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      permissions_json TEXT NOT NULL DEFAULT '[]',
      totp_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      token_version INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER,
      last_login_at INTEGER
    )
  `).run()
  for (const stmt of [
    "ALTER TABLE admin_users ADD COLUMN totp_secret TEXT",
    "ALTER TABLE admin_users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE admin_users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0",
  ]) {
    try { await env.DB.prepare(stmt).run() } catch {}
  }
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id INTEGER,
      owner INTEGER NOT NULL DEFAULT 0,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_role TEXT,
      actor_admin_user_id INTEGER,
      actor_username TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      metadata_json TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )
  `).run()
}

export function publicAdminUser(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email || '',
    permissions: normalizePermissions(row.permissions_json),
    is_active: row.is_active !== 0,
    totp_enabled: row.totp_enabled === 1,
    token_version: row.token_version || 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    last_login_at: row.last_login_at || null,
  }
}
