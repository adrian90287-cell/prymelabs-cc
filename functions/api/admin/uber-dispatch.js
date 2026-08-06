import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import { sendEmail, sendSMS } from '../../_utils/email.js'


async function getUberToken(clientId, clientSecret) {
  const res = await fetch('https://auth.uber.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret,
      scope:         'eats.deliveries',
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Uber auth failed ${res.status}: ${body.slice(0, 300)}`)
  }
  const d = await res.json()
  return d.access_token
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { order_id } = body
  if (!order_id) return json({ error: 'order_id required' }, 400)

  // Load order
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL').bind(order_id).first()
  if (!order) return json({ error: 'Order not found' }, 404)
  if (!order.local_delivery) return json({ error: 'Not a local delivery order' }, 400)

  // Load Uber + hub settings
  const { results: rows } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('uber_client_id','uber_client_secret','uber_customer_id','uber_pickup_name','uber_pickup_address','uber_pickup_phone','local_delivery_hub_lat','local_delivery_hub_lng')"
  ).all()
  const cfg = {}
  for (const r of (rows || [])) cfg[r.key] = r.value

  const clientId     = env.UBER_CLIENT_ID     || cfg.uber_client_id
  const clientSecret = env.UBER_CLIENT_SECRET  || cfg.uber_client_secret
  const customerId   = env.UBER_CUSTOMER_ID   || cfg.uber_customer_id

  if (!clientId || !clientSecret || !customerId) {
    return json({ error: 'Uber Direct credentials not configured. Add them in Settings → Local Delivery.' }, 400)
  }

  const shipping = JSON.parse(order.shipping_json || '{}')
  const dropoffAddress = [
    shipping.address,
    shipping.address2,
    shipping.city,
    shipping.state,
    shipping.zip,
  ].filter(Boolean).join(', ')

  // Get Uber OAuth token
  let token
  try { token = await getUberToken(clientId, clientSecret) }
  catch (err) { return json({ error: `Uber authentication failed: ${err.message}` }, 502) }

  // Create Uber Direct delivery
  const delivery = {
    pickup: {
      name:         cfg.uber_pickup_name    || 'Pryme Labs',
      address:      cfg.uber_pickup_address || '7400 Moline St, Houston, TX 77087',
      phone_number: cfg.uber_pickup_phone   || '',
      notes:        `Order ${order.order_number} — ready for pickup`,
    },
    dropoff: {
      name:         shipping.name    || order.customer_name || '',
      address:      dropoffAddress,
      phone_number: shipping.phone  || '',
      notes:        'Research order — handle with care. Leave at door if no answer.',
    },
    manifest_items: [{
      name:     `Pryme Labs Order ${order.order_number}`,
      quantity: 1,
      size:     'small',
      price:    Math.round(Number(order.order_total || order.subtotal || 0) * 100), // cents
    }],
    external_id: String(order.order_number),
  }

  const uberRes = await fetch(`https://api.uber.com/v1/customers/${customerId}/deliveries`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(delivery),
  })

  const uberData = await uberRes.json()

  if (!uberRes.ok) {
    const msg = uberData?.message || uberData?.code || 'Uber dispatch failed'
    return json({ error: msg, detail: uberData }, uberRes.status)
  }

  // Save delivery info to order
  const now         = Math.floor(Date.now() / 1000)
  const trackingObj = {
    carrier:            'Uber Direct',
    number:             uberData.id,
    uber_delivery_id:   uberData.id,
    uber_tracking_url:  uberData.tracking_url || null,
    uber_status:        uberData.status || 'pending',
  }

  await env.DB.prepare(
    `UPDATE orders SET status = 'shipped', shipped_at = ?, tracking_json = ?, tracking_status = 'in_transit', tracking_number = ?, uber_delivery_id = ? WHERE id = ?`
  ).bind(now, JSON.stringify(trackingObj), trackingObj.number, trackingObj.uber_delivery_id, order.id).run()

  // Notify customer
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
        ? `🚗 Tu Pedido Está en Camino — ${order.order_number}`
        : `🚗 Your Order Is on Its Way — ${order.order_number}`,
      html: isEs
        ? `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#09090b;font-family:Inter,Arial,sans-serif;color:#e4e4e7"><div style="max-width:520px;margin:0 auto"><h2 style="color:#fff;font-size:20px;margin:0 0 8px">🚗 ¡Tu pedido está en camino, ${firstName}!</h2><p style="color:#71717a;margin:0 0 16px">Un conductor de Pryme Labs está en camino a entregar tu pedido <strong style="color:#fff">${order.order_number}</strong>.</p>${uberData.tracking_url ? `<a href="${uberData.tracking_url}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">Rastrear Mi Entrega →</a>` : ''}</div></body></html>`
        : `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#09090b;font-family:Inter,Arial,sans-serif;color:#e4e4e7"><div style="max-width:520px;margin:0 auto"><h2 style="color:#fff;font-size:20px;margin:0 0 8px">🚗 Your order is on its way, ${firstName}!</h2><p style="color:#71717a;margin:0 0 16px">A Pryme Labs driver is heading to you with order <strong style="color:#fff">${order.order_number}</strong>.</p>${uberData.tracking_url ? `<a href="${uberData.tracking_url}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">Track My Delivery →</a>` : ''}</div></body></html>`,
    }).catch(() => {}))
  }

  if (custPhone) {
    waitUntil(sendSMS(env, {
      to: custPhone,
      message: isEs
        ? `🚗 ${firstName}, ¡tu pedido de Pryme Labs ${order.order_number} está en camino! ${uberData.tracking_url ? `Rastrea tu entrega: ${uberData.tracking_url}` : ''}`
        : `🚗 ${firstName}, your Pryme Labs order ${order.order_number} is on its way!${uberData.tracking_url ? ` Track your delivery: ${uberData.tracking_url}` : ''}`,
    }).catch(() => {}))
  }

  return json({
    ok:           true,
    delivery_id:  uberData.id,
    status:       uberData.status,
    tracking_url: uberData.tracking_url || null,
    courier:      uberData.courier || null,
    pickup_eta:   uberData.pickup?.eta || null,
    dropoff_eta:  uberData.dropoff?.eta || null,
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
