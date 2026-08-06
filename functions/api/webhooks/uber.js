import { json } from '../../_utils/cors.js'
import { sendEmail, sendSMS } from '../../_utils/email.js'

// Uber Direct webhook — receives delivery status updates.
// Uber signs each request with an HMAC-SHA256 of the raw body, hex-encoded,
// in the X-Uber-Signature header (Customer Notifications API, same shape as
// EasyPost's webhook — see webhooks/easypost.js). We verify it before trusting
// any status change, since an unverified endpoint would let anyone forge a
// "delivered" or "cancelled" event for a guessed/leaked delivery_id.

// Constant-time string comparison to avoid signature timing leaks
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifySignature(secret, rawBodyBytes, signatureHeader) {
  if (!secret || !signatureHeader) return false
  const keyData = new TextEncoder().encode(secret)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBuf = await crypto.subtle.sign('HMAC', key, rawBodyBytes)
  const hex = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(hex, signatureHeader)
}

export async function onRequestPost({ request, env, waitUntil }) {
  // Read raw bytes once — needed for both the signature check and JSON parse
  const rawBody = await request.arrayBuffer()

  // ── Verify the request genuinely came from Uber ──
  const secret = env.UBER_WEBHOOK_SECRET
  if (!secret) {
    // Secret not configured yet — refuse rather than process unverified events
    return json({ error: 'Webhook secret not configured' }, 503)
  }
  const signature = request.headers.get('X-Uber-Signature') || request.headers.get('x-uber-signature')
  const valid = await verifySignature(secret, rawBody, signature)
  if (!valid) return json({ error: 'Invalid signature' }, 401)

  let body
  try { body = JSON.parse(new TextDecoder().decode(rawBody)) } catch { return json({ error: 'Invalid JSON' }, 400) }

  // Uber webhook payload shape:
  // { kind: 'eats.delivery_status', data: { id, status, tracking_url, courier: { name, phone, ... }, ... } }
  const kind     = body.kind || body.event_type || ''
  const delivery = body.data || body.delivery || body

  const deliveryId = delivery?.id
  const status     = (delivery?.status || '').toLowerCase()

  if (!deliveryId) return json({ ok: true }) // ignore malformed events

  // Find the order by its indexed uber_delivery_id first (fast, exact). Falls
  // back to the old scan + JS exact-match for any order predating the
  // backfill (migrations/tracking_index.sql) — belt and suspenders so a
  // webhook can never silently miss an order either way.
  let order = await env.DB.prepare(
    `SELECT * FROM orders WHERE uber_delivery_id = ? LIMIT 1`
  ).bind(deliveryId).first()

  if (!order) {
    const { results: candidates } = await env.DB.prepare(
      `SELECT * FROM orders WHERE tracking_json IS NOT NULL AND status IN ('shipped','fulfilled') ORDER BY created_at DESC LIMIT 200`
    ).all()

    order = (candidates || []).find(o => {
      try {
        const t = JSON.parse(o.tracking_json || '{}')
        return t.uber_delivery_id === deliveryId
      } catch { return false }
    })
  }

  if (!order) return json({ ok: true }) // not our order

  const tracking = JSON.parse(order.tracking_json || '{}')
  const now      = Math.floor(Date.now() / 1000)

  // Map Uber statuses
  // pending → assigned → en_route_to_pickup → arrived_at_pickup → en_route_to_dropoff → arrived_at_dropoff → delivered | cancelled | returned
  if (['delivered'].includes(status)) {
    // Guard against replayed webhook deliveries re-sending the "delivered"
    // notification — only fire once, on the transition into completed.
    const res = await env.DB.prepare(
      `UPDATE orders SET status = 'completed', delivered_at = ?, tracking_json = ? WHERE id = ? AND status != 'completed'`
    ).bind(now, JSON.stringify({ ...tracking, uber_status: status }), order.id).run()
    if (!res.meta.changes) return json({ ok: true, ignored: 'already_completed' })

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
