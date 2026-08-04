import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, resetRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'

export async function onRequestGet({ request, env }) {
  // Rate limit admin API access
  const rlKey = adminRateLimitKey(request, 'dashboard');
  const rl = await checkAdminRateLimit(env, rlKey);
  if (rl.blocked) {
    return json(
      { error: `Rate limited. Try again in ${Math.ceil(rl.retryAfter)} second(s).` },
      429
    );
  }

  const authResult = await verifyAdminToken(request, env)
  const authed = authResult.valid

  if (!authed) {
    // Count failed attempts per IP — blocks after 10 wrong passwords in 15 minutes
    const rlKey = rateLimitKey(request, 'admin')
    const rl = await checkRateLimit(env, rlKey)
    if (rl.blocked) {
      return json(
        { error: `Too many failed attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` },
        429
      )
    }
    return json({ error: 'Unauthorized' }, 401)
  }

  // Successful auth — clear any accumulated failure count for this IP
  resetRateLimit(env, rateLimitKey(request, 'admin')).catch(() => {})

  const [orders, products] = await Promise.all([
    env.DB.prepare('SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC').all(),
    env.DB.prepare('SELECT code, name, size, price, in_stock FROM products ORDER BY display_order ASC').all(),
  ])

  const rows = orders.results || []

  const stats = {
    pending: rows.filter(o => o.status === 'pending').length,
    paid: rows.filter(o => o.status === 'paid').length,
    fulfilled: rows.filter(o => o.status === 'fulfilled').length,
    shipped: rows.filter(o => o.status === 'shipped').length,
    completed: rows.filter(o => o.status === 'completed').length,
    total_orders: rows.length,
    total_revenue: rows.filter(o => !['cancelled','refunded'].includes(o.status)).reduce((s, o) => s + Number(o.order_total || o.subtotal || 0), 0),
    monthly_revenue: rows
      .filter(o => !['cancelled','refunded'].includes(o.status) && o.created_at > Math.floor(Date.now() / 1000) - 2592000)
      .reduce((s, o) => s + Number(o.order_total || o.subtotal || 0), 0),
  }

  const ordersWithParsed = rows.map(o => ({
    ...o,
    items: safeJson(o.items_json, []),
    shipping: safeJson(o.shipping_json, {}),
    tracking: safeJson(o.tracking_json, {}),
  }))

  return json({ stats, orders: ordersWithParsed, products: products.results || [] })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

function safeJson(s, def) {
  try { return JSON.parse(s || 'null') || def } catch { return def }
}
