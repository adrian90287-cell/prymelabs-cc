import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'
import { ensureDepartmentWaitlistTable } from '../../_utils/departmentWaitlist.js'
import { ensureProductLaunchColumns } from '../../_utils/productLaunch.js'

function csvCell(value) {
  const s = value == null ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

function csv(rows, headers) {
  return '\ufeff' + [
    headers.map(h => csvCell(h.label)).join(','),
    ...rows.map(row => headers.map(h => csvCell(row[h.key])).join(',')),
  ].join('\r\n')
}

function download(body, filename) {
  return new Response(body, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function onRequestGet({ request, env }) {
  const rl = await checkAdminRateLimit(env, adminRateLimitKey(request, 'admin-export'))
  if (rl.blocked) return json({ error: 'Rate limited' }, 429)
  const auth = await verifyAdminToken(request, env)
  if (!auth.valid) return json({ error: auth.error || 'Unauthorized' }, auth.status || 401)

  const url = new URL(request.url)
  const type = String(url.searchParams.get('type') || '').toLowerCase()
  const today = new Date().toISOString().slice(0, 10)

  if (type === 'orders') {
    const { results } = await env.DB.prepare(`
      SELECT id, order_number, customer_name, customer_email, status, payment_method, subtotal, shipping_cost, tax_amount, order_total, created_at, paid_at, shipped_at, fulfilled_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 10000
    `).all()
    return download(csv(results || [], [
      { key: 'id', label: 'ID' }, { key: 'order_number', label: 'Order Number' },
      { key: 'customer_name', label: 'Customer' }, { key: 'customer_email', label: 'Email' },
      { key: 'status', label: 'Status' }, { key: 'payment_method', label: 'Payment' },
      { key: 'subtotal', label: 'Subtotal' }, { key: 'shipping_cost', label: 'Shipping' },
      { key: 'tax_amount', label: 'Tax' }, { key: 'order_total', label: 'Total' },
      { key: 'created_at', label: 'Created' }, { key: 'paid_at', label: 'Paid' },
      { key: 'shipped_at', label: 'Shipped' }, { key: 'fulfilled_at', label: 'Fulfilled' },
    ]), `pryme-orders-${today}.csv`)
  }

  if (type === 'subscribers') {
    const { results } = await env.DB.prepare(`
      SELECT id, name, username, email, phone, phone_verified, lang, email_unsubscribed, sms_unsubscribed, created_at
      FROM users
      ORDER BY created_at DESC, id DESC
      LIMIT 10000
    `).all()
    return download(csv(results || [], [
      { key: 'id', label: 'ID' }, { key: 'name', label: 'Name' },
      { key: 'username', label: 'Username' }, { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' }, { key: 'phone_verified', label: 'Phone Verified' },
      { key: 'lang', label: 'Language' }, { key: 'email_unsubscribed', label: 'Email Unsubscribed' },
      { key: 'sms_unsubscribed', label: 'SMS Unsubscribed' }, { key: 'created_at', label: 'Created' },
    ]), `pryme-subscribers-${today}.csv`)
  }

  if (type === 'products') {
    await ensureProductLaunchColumns(env)
    const { results } = await env.DB.prepare(`
      SELECT id, code, name, size, department, category, price, compare_at_price, stock_qty, in_stock, batch_number, is_draft, release_at, display_order
      FROM products
      ORDER BY display_order ASC, name ASC
      LIMIT 10000
    `).all()
    return download(csv(results || [], [
      { key: 'id', label: 'ID' }, { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' }, { key: 'size', label: 'Size' },
      { key: 'department', label: 'Department' }, { key: 'category', label: 'Category' },
      { key: 'price', label: 'Price' }, { key: 'compare_at_price', label: 'Compare At' },
      { key: 'stock_qty', label: 'Stock Qty' }, { key: 'in_stock', label: 'In Stock' },
      { key: 'batch_number', label: 'Batch' }, { key: 'is_draft', label: 'Draft' },
      { key: 'release_at', label: 'Release At' }, { key: 'display_order', label: 'Display Order' },
    ]), `pryme-products-${today}.csv`)
  }

  if (type === 'department-waitlist') {
    await ensureDepartmentWaitlistTable(env)
    const { results } = await env.DB.prepare(`
      SELECT id, department, email, created_at, notified_at
      FROM department_waitlist
      ORDER BY created_at DESC, id DESC
      LIMIT 10000
    `).all()
    return download(csv(results || [], [
      { key: 'id', label: 'ID' }, { key: 'department', label: 'Department' },
      { key: 'email', label: 'Email' }, { key: 'created_at', label: 'Created' },
      { key: 'notified_at', label: 'Notified' },
    ]), `pryme-department-waitlist-${today}.csv`)
  }

  if (type === 'audit') {
    const { results } = await env.DB.prepare(`
      SELECT id, actor_role, actor_username, action, target_type, target_id, ip, created_at
      FROM admin_audit_log
      ORDER BY created_at DESC, id DESC
      LIMIT 10000
    `).all()
    return download(csv(results || [], [
      { key: 'id', label: 'ID' }, { key: 'actor_role', label: 'Actor Role' },
      { key: 'actor_username', label: 'Actor' }, { key: 'action', label: 'Action' },
      { key: 'target_type', label: 'Target Type' }, { key: 'target_id', label: 'Target ID' },
      { key: 'ip', label: 'IP' }, { key: 'created_at', label: 'Created' },
    ]), `pryme-audit-${today}.csv`)
  }

  return json({ error: 'Invalid export type' }, 400)
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
