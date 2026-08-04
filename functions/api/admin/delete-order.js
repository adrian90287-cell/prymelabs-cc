import { corsHeaders, json } from '../../_utils/cors.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

export async function onRequestPost({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { order_id, action } = body
  if (!order_id || !action) return json({ error: 'order_id and action required' }, 400)

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order_id).first()
  if (!order) return json({ error: 'Order not found' }, 404)

  if (action === 'trash') {
    // Soft delete — restore stock if order was active
    const wasActive = !['cancelled', 'refunded'].includes(order.status)
    if (wasActive && !order.deleted_at) {
      const items = JSON.parse(order.items_json || '[]')
      const restores = items
        .filter(i => i.product_id)
        .map(i => env.DB.prepare(
          'UPDATE products SET stock_qty = stock_qty + ?, in_stock = CASE WHEN stock_qty + ? > 0 THEN 1 ELSE in_stock END WHERE id = ?'
        ).bind(i.qty, i.qty, i.product_id))
      if (restores.length > 0) await env.DB.batch(restores)
    }
    await env.DB.prepare(
      'UPDATE orders SET deleted_at = ? WHERE id = ?'
    ).bind(Math.floor(Date.now() / 1000), order_id).run()
    return json({ ok: true })
  }

  if (action === 'restore') {
    await env.DB.prepare('UPDATE orders SET deleted_at = NULL WHERE id = ?').bind(order_id).run()
    return json({ ok: true })
  }

  if (action === 'permanent') {
    await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(order_id).run()
    return json({ ok: true })
  }

  return json({ error: 'Invalid action. Use trash, restore, or permanent.' }, 400)
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
