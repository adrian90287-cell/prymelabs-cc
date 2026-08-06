import { verifyJWT } from '../../_utils/jwt.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import { sendSMS } from '../../_utils/email.js'
import { pushToAll } from '../../_utils/webpush.js'

// Customer signals they've sent payment for a pending order. Flags the order
// (payment_claimed_at) so the admin sees it, and pings the owner (push + SMS)
// to verify quickly. Does NOT mark the order paid — the owner still confirms.
export async function onRequestPost({ request, env, waitUntil }) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const payload = await verifyJWT(auth.slice(7), env)
  if (!payload) return json({ error: 'Invalid token' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const orderId = Number(body.order_id)
  if (!orderId) return json({ error: 'order_id required' }, 400)

  const order = await env.DB.prepare(
    'SELECT * FROM orders WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
  ).bind(orderId, payload.sub).first()
  if (!order) return json({ error: 'Order not found' }, 404)
  if (order.status !== 'pending') return json({ error: 'This order is no longer awaiting payment.' }, 400)

  const now = Math.floor(Date.now() / 1000)
  await env.DB.prepare('UPDATE orders SET payment_claimed_at = ? WHERE id = ?').bind(now, orderId).run()

  const total = Number(order.order_total || order.subtotal || 0)
  waitUntil(pushToAll(env, {
    title: `💸 Payment sent — ${order.order_number}`,
    body: `${order.customer_name} marked $${total.toFixed(2)} (${order.payment_method}) as paid. Verify it.`,
    url: '/admin',
  }).catch(() => {}))
  waitUntil(sendSMS(env, {
    message: `💸 ${order.customer_name} says they paid order ${order.order_number} — $${total.toFixed(2)} via ${order.payment_method}. Verify: prymelabs.cc/admin`,
  }).catch(() => {}))

  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
