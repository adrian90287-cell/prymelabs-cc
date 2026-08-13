import { corsHeaders, json } from '../../_utils/cors.js'
import { hmacHex } from '../../_utils/crypto.js'
import { constantTimeCompare } from '../../_utils/constantTime.js'
import { sendEmail, sendSMS, paidConfirmationHtml, paidConfirmationHtmlEs } from '../../_utils/email.js'
import { pushToAll } from '../../_utils/webpush.js'

function parseStripeSignature(header) {
  const parts = String(header || '').split(',')
  const out = { signatures: [] }
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx)
    const value = part.slice(idx + 1)
    if (key === 't') out.timestamp = value
    if (key === 'v1') out.signatures.push(value)
  }
  return out
}

async function verifyStripeSignature(rawBody, header, secret) {
  if (!secret) return false
  const { timestamp, signatures } = parseStripeSignature(header)
  if (!timestamp || signatures.length === 0) return false

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false

  const expected = await hmacHex(`${timestamp}.${rawBody}`, secret)
  return signatures.some(sig => constantTimeCompare(sig, expected))
}

function hasPeptides(order) {
  try {
    const items = JSON.parse(order.items_json || '[]')
    return items.some(i => (i?.department || 'Peptides') === 'Peptides')
  } catch {
    return true
  }
}

async function markStripeOrderPaid({ env, waitUntil, order, session }) {
  const totalCents = Math.round(Number(order.order_total || order.subtotal || 0) * 100)
  if (Number(session.amount_total || 0) !== totalCents) {
    throw new Error(`Stripe amount mismatch for ${order.order_number}`)
  }
  if (hasPeptides(order)) {
    throw new Error(`Stripe payment attempted for peptide order ${order.order_number}`)
  }
  if (order.status === 'paid' || ['fulfilled', 'shipped', 'completed'].includes(order.status)) return false
  if (['cancelled', 'refunded'].includes(order.status)) return false

  const nowSec = Math.floor(Date.now() / 1000)
  const update = await env.DB.prepare(
    "UPDATE orders SET status = 'paid', paid_at = ?, notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || char(10) || ? END WHERE id = ? AND status = 'pending'"
  ).bind(nowSec, `Stripe paid: ${session.id}`, `Stripe paid: ${session.id}`, order.id).run()
  if (!update.meta.changes) return false

  const items = JSON.parse(order.items_json || '[]')
  const shipping = JSON.parse(order.shipping_json || '{}')
  const phone = shipping?.phone?.trim()
  const firstName = (order.customer_name || '').split(' ')[0]
  const total = Number(order.order_total || order.subtotal || 0)
  let lang = 'en'
  if (order.user_id) {
    const u = await env.DB.prepare('SELECT lang FROM users WHERE id = ?').bind(order.user_id).first()
    lang = u?.lang || 'en'
  }
  const isEs = lang === 'es'

  if (order.customer_email) {
    waitUntil(sendEmail(env, {
      to: order.customer_email,
      subject: isEs ? `✅ Pago Confirmado — ${order.order_number}` : `✅ Payment Confirmed — ${order.order_number}`,
      html: isEs
        ? paidConfirmationHtmlEs({ order_number: order.order_number, customer_name: order.customer_name, items, total, payment_method: 'stripe' })
        : paidConfirmationHtml({ order_number: order.order_number, customer_name: order.customer_name, items, total, payment_method: 'stripe' }),
    }).catch(() => {}))
  }
  if (phone) {
    waitUntil(sendSMS(env, {
      to: phone,
      message: isEs
        ? `✅ ¡Hola ${firstName}! Tu pago con tarjeta de $${total.toFixed(2)} para el pedido ${order.order_number} ha sido confirmado. ¡Estamos preparando tu pedido! 🙌`
        : `✅ Hi ${firstName}! Your card payment of $${total.toFixed(2)} for order ${order.order_number} has been confirmed. We're getting your order ready! 🙌`,
    }).catch(() => {}))
  }
  if (env.OWNER_EMAIL) {
    waitUntil(sendEmail(env, {
      to: env.OWNER_EMAIL,
      subject: `✅ Stripe Paid — ${order.order_number} — $${total.toFixed(2)}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;padding:20px"><h2>Stripe payment received</h2><p>Order <strong>${order.order_number}</strong> is now marked paid.</p><p>Customer: ${order.customer_name || ''}<br>Total: <strong>$${total.toFixed(2)}</strong></p><p><a href="https://prymelabs.net/admin">Open Admin</a></p></div>`,
    }).catch(() => {}))
  }
  waitUntil(pushToAll(env, {
    title: `✅ Stripe Paid ${order.order_number}`,
    body: `$${total.toFixed(2)} card payment confirmed`,
    url: '/admin',
  }).catch(() => {}))
  waitUntil(sendSMS(env, { message: `✅ Stripe paid ${order.order_number} — $${total.toFixed(2)}. Ready in admin: prymelabs.net/admin` }).catch(() => {}))
  return true
}

export async function onRequestPost({ request, env, waitUntil }) {
  const rawBody = await request.text()
  const valid = await verifyStripeSignature(rawBody, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET)
  if (!valid) return json({ error: 'Invalid Stripe signature' }, 400)

  let event
  try { event = JSON.parse(rawBody) } catch { return json({ error: 'Invalid payload' }, 400) }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object || {}
    if (session.payment_status !== 'paid') return json({ received: true, ignored: 'unpaid' })
    const orderId = session.metadata?.order_id
    if (!orderId) return json({ received: true, ignored: 'missing_order_id' })
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first()
    if (!order) return json({ received: true, ignored: 'order_not_found' })
    try {
      const changed = await markStripeOrderPaid({ env, waitUntil, order, session })
      return json({ received: true, changed })
    } catch (err) {
      const message = `⚠️ Stripe webhook review needed: ${err.message || 'unknown error'}`
      waitUntil(sendSMS(env, { message }).catch(() => {}))
      if (env.OWNER_EMAIL) {
        waitUntil(sendEmail(env, {
          to: env.OWNER_EMAIL,
          subject: '⚠️ Stripe Webhook Review Needed',
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;padding:20px"><h2>Stripe webhook review needed</h2><p>${message}</p><p>Session: ${session.id || 'unknown'}</p><p><a href="https://prymelabs.net/admin">Open Admin</a></p></div>`,
        }).catch(() => {}))
      }
      return json({ received: true, changed: false, review_required: true })
    }
  }

  return json({ received: true, ignored: event.type })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
