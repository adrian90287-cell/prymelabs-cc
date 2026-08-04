import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'


// Best-sellers + customer metrics, aggregated from active (non-cancelled) orders.
export async function onRequestGet({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  const { results } = await env.DB.prepare(
    "SELECT user_id, items_json, order_total, subtotal FROM orders WHERE deleted_at IS NULL AND status NOT IN ('cancelled','refunded')"
  ).all()

  const prodMap = new Map()      // "name (size)" -> { name, size, units, revenue }
  const userOrders = new Map()   // user_id -> order count
  let totalRevenue = 0

  for (const o of results || []) {
    totalRevenue += Number(o.order_total || o.subtotal || 0)
    if (o.user_id != null) userOrders.set(o.user_id, (userOrders.get(o.user_id) || 0) + 1)
    try {
      for (const i of JSON.parse(o.items_json || '[]')) {
        const key = `${i.name}${i.size ? ` (${i.size})` : ''}`
        const e = prodMap.get(key) || { name: i.name, size: i.size || '', units: 0, revenue: 0 }
        e.units += Number(i.qty) || 0
        e.revenue += (Number(i.price) || 0) * (Number(i.qty) || 0)
        prodMap.set(key, e)
      }
    } catch { /* skip malformed */ }
  }

  const products = [...prodMap.values()]
    .map(p => ({ ...p, revenue: Number(p.revenue.toFixed(2)) }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 25)

  const totalOrders = (results || []).length
  const totalCustomers = userOrders.size
  const repeatCustomers = [...userOrders.values()].filter(n => n > 1).length
  const repeatRate = totalCustomers ? Math.round((repeatCustomers / totalCustomers) * 100) : 0
  const aov = totalOrders ? Number((totalRevenue / totalOrders).toFixed(2)) : 0

  return json({
    products,
    totals: { orders: totalOrders, revenue: Number(totalRevenue.toFixed(2)), aov, customers: totalCustomers, repeatCustomers, repeatRate },
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
