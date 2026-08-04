import { verifyJWT } from '../../_utils/jwt.js'
import { corsHeaders, json } from '../../_utils/cors.js'

export async function onRequestGet({ request, env }) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const payload = await verifyJWT(auth.slice(7), env.JWT_SECRET)
  if (!payload) return json({ error: 'Invalid token' }, 401)

  const { results } = await env.DB.prepare(
    `SELECT
       id, order_number, items_json, shipping_json,
       subtotal, promo_code, discount_amount,
       shipping_rate_name, shipping_cost,
       tax_rate, tax_amount, order_total,
       payment_method, status, tracking_json,
       created_at, paid_at, shipped_at, payment_claimed_at
     FROM orders
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC`
  ).bind(payload.sub).all()

  const orders = (results || []).map(o => ({
    ...o,
    items:    JSON.parse(o.items_json    || '[]'),
    shipping: JSON.parse(o.shipping_json || '{}'),
    tracking: JSON.parse(o.tracking_json || '{}'),
  }))

  return json({ orders })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
