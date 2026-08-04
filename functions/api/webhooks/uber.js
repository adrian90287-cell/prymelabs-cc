import { json } from '../../_utils/cors.js'
import { sendEmail, sendSMS } from '../../_utils/email.js'

// Uber Direct webhook — receives delivery status updates
// Uber sends POST requests with delivery event payloads
// No auth header needed; we verify via delivery_id matching an order in our DB

export async function onRequestPost({ request, env, waitUntil }) {
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  // Uber webhook payload shape:
  // { kind: 'eats.delivery_status', data: { id, status, tracking_url, courier: { name, phone, ... }, ... } }
  const kind     = body.kind || body.event_type || ''
  const delivery = body.data || body.delivery || body

  const deliveryId = delivery?.id
  const status     = (delivery?.status || '').toLowerCase()

  if (!deliveryId) return json({ ok: true }) // ignore malformed events

  // Find order by uber_delivery_id stored in tracking_json
  // D1 can't query JSON fields natively, so we search recent shipped orders
  const { results: candidates } = await env.DB.prepare(
    `SELECT * FROM orders WHERE tracking_json IS NOT NULL AND status IN ('shipped','fulfilled') ORDER BY created_at DESC LIMIT 200`
  ).all()

  const order = (candidates || []).find(o => {
    try {
      const t = JSON.parse(o.tracking_json || '{}')
      return t.uber_delivery_id === deliveryId
    } catch { return false }
  })

  if (!order) return json({ ok: true }) // not our order

  const tracking = JSON.parse(order.tracking_json || '{}')
  const now      = Math.floor(Date.now() / 1000)

  // Map Uber statuses
  // pending → assigned → en_route_to_pickup → arrived_at_pickup → en_route_to_dropoff → arrived_at_dropoff → delivered | cancelled | returned
  if (['delivered'].includes(status)) {
    await env.DB.prepare(
      `UPDATE orders SET status = 'completed', delivered_at = ?, tracking_json = ? WHERE id = ?`
    ).bind(now, JSON.stringify({ ...tracking, uber_status: status }), order.id).run()

    const shipping  = JSON.parse(order.shipping_json || '{}')
    const firstName = (order.customer_name || '').split(' ')[0]
    const custPhone = shipping?.phone?.trim()
    let isEs = false
    if (order.user_id) {
      const u = await env.DB.prepare('SELECT lang FROM users WHERE id = ?').bind(order.user_id).first()
      isEs = u?.lang === 'es'
    }

    if (order.customer_email) {
      waitUntil(sendEmail(env, {
        to:      order.customer_email,
        subject: isEs
          ? `✅ Tu Pedido Fue Entregado — ${order.order_number}`
          : `✅ Your Order Has Been Delivered — ${order.order_number}`,
        html: isEs
          ? `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#09090b;font-family:Inter,Arial,sans-serif;color:#e4e4e7"><div style="max-width:520px;margin:0 auto"><h2 style="color:#fff;font-size:20px;margin:0 0 8px">✅ ¡Tu pedido fue entregado, ${firstName}!</h2><p style="color:#71717a;margin:0 0 16px">Tu pedido <strong style="color:#fff">${order.order_number}</strong> ha sido entregado exitosamente. Gracias por tu compra en Pryme Labs.</p></div></body></html>`
          : `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#09090b;font-family:Inter,Arial,sans-serif;color:#e4e4e7"><div style="max-width:520px;margin:0 auto"><h2 style="color:#fff;font-size:20px;margin:0 0 8px">✅ Your order was delivered, ${firstName}!</h2><p style="color:#71717a;margin:0 0 16px">Your Pryme Labs order <strong style="color:#fff">${order.order_number}</strong> has been successfully delivered. Thank you for your purchase!</p></div></body></html>`,
      }).catch(() => {}))
    }

    if (custPhone) {
      waitUntil(sendSMS(env, {
        to: custPhone,
        message: isEs
          ? `✅ ${firstName}, tu pedido de Pryme Labs ${order.order_number} fue entregado. ¡Gracias!`
          : `✅ ${firstName}, your Pryme Labs order ${order.order_number} has been delivered. Thank you!`,
      }).catch(() => {}))
    }

  } else if (['cancelled', 'returned'].includes(status)) {
    // Dispatch failed — revert to fulfilled so admin can re-dispatch or ship manually
    await env.DB.prepare(
      `UPDATE orders SET status = 'fulfilled', tracking_json = ? WHERE id = ?`
    ).bind(JSON.stringify({ ...tracking, uber_status: status }), order.id).run()

    // Notify admin
    if (env.OWNER_EMAIL) {
      waitUntil(sendEmail(env, {
        to:      env.OWNER_EMAIL,
        subject: `⚠️ Uber Delivery ${status} — Order ${order.order_number}`,
        html:    `<p>The Uber Direct delivery for order <strong>${order.order_number}</strong> (${order.customer_name}) was <strong>${status}</strong>. The order has been reverted to Fulfilled. Please re-dispatch or arrange alternate shipping.</p><p>Delivery ID: ${deliveryId}</p>`,
      }).catch(() => {}))
    }

  } else {
    // In-progress statuses — update uber_status in tracking_json
    const courierInfo = delivery?.courier || null
    const updatedTracking = {
      ...tracking,
      uber_status:  status,
      uber_courier: courierInfo ? {
        name:  courierInfo.name  || '',
        phone: courierInfo.phone || '',
        img:   courierInfo.picture_url || null,
      } : tracking.uber_courier || null,
      uber_tracking_url: delivery?.tracking_url || tracking.uber_tracking_url || null,
    }
    await env.DB.prepare(
      `UPDATE orders SET tracking_json = ? WHERE id = ?`
    ).bind(JSON.stringify(updatedTracking), order.id).run()
  }

  return json({ ok: true })
}

export async function onRequestGet() {
  // Uber may send a GET to verify the endpoint
  return new Response('OK', { status: 200 })
}
