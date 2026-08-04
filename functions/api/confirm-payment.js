import { corsHeaders } from '../_utils/cors.js'
import { hmacHex } from '../_utils/crypto.js'
import { sendEmail, sendSMS, paidConfirmationHtml, paidConfirmationHtmlEs } from '../_utils/email.js'

// One-tap "Confirm Payment" for the owner. The link travels in the new-order
// email + SMS, signed with an HMAC token so it can't be forged. A GET only
// RENDERS a confirmation page (so email link-scanners can't accidentally mark an
// order paid); the actual state change happens on the POST from that page.

const ok = (html, status = 200) =>
  new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } })

async function tokenFor(orderId, env) {
  return hmacHex(`confirm-payment:${orderId}`, env.JWT_SECRET)
}

function page({ title, heading, message, accent = '#002b63', button }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#111111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;"><tr><td align="center" style="padding:40px 16px;">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #d9dde5;border-radius:6px;overflow:hidden;">
      <tr><td style="padding:28px 32px 14px;">
        <div style="font-size:26px;font-weight:800;letter-spacing:2px;color:#111111;">PRYME<span style="color:#4f7fd9;">LABS</span></div>
        <div style="border-top:3px solid ${accent};width:60px;margin-top:12px;"></div>
      </td></tr>
      <tr><td style="padding:8px 32px 32px;">
        <h1 style="font-size:22px;color:${accent};margin:0 0 12px;">${heading}</h1>
        <div style="font-size:15px;line-height:1.6;color:#444;">${message}</div>
        ${button || ''}
      </td></tr>
      <tr><td align="center" style="background:#002b63;color:#fff;padding:12px;font-size:12px;font-weight:700;letter-spacing:4px;">RESEARCH &bull; QUALITY &bull; INTEGRITY</td></tr>
    </table>
  </td></tr></table>
</body></html>`
}

async function loadValid(request, env) {
  const url = new URL(request.url)
  const orderId = url.searchParams.get('order')
  const token = url.searchParams.get('token') || ''
  if (!orderId) return { error: 'Missing order.' }
  const expected = await tokenFor(orderId, env)
  if (token !== expected) return { error: 'This link is invalid.' }
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first()
  if (!order) return { error: 'Order not found.' }
  return { order }
}

// GET → render the confirmation page (no mutation)
export async function onRequestGet({ request, env }) {
  const { order, error } = await loadValid(request, env)
  if (error) return ok(page({ title: 'Pryme Labs', heading: 'Unable to confirm', message: error, accent: '#b42318' }), 400)

  const total = Number(order.order_total || order.subtotal || 0)
  if (order.status === 'paid' || ['fulfilled', 'shipped', 'completed'].includes(order.status)) {
    return ok(page({ title: 'Already Confirmed', heading: '✓ Already confirmed', accent: '#157347',
      message: `Order <strong>${order.order_number}</strong> is already marked paid. Nothing more to do.` }))
  }
  if (['cancelled', 'refunded'].includes(order.status)) {
    return ok(page({ title: 'Cannot confirm', heading: 'Cannot confirm', accent: '#b42318',
      message: `Order <strong>${order.order_number}</strong> is ${order.status} and can't be marked paid.` }))
  }

  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const button = `
    <form method="POST" action="/api/confirm-payment" style="margin-top:24px;">
      <input type="hidden" name="order" value="${order.id}">
      <input type="hidden" name="token" value="${token}">
      <button type="submit" style="display:inline-block;background:#157347;color:#fff;border:none;cursor:pointer;padding:16px 34px;border-radius:10px;font-size:17px;font-weight:800;font-family:Arial,Helvetica,sans-serif;">✓ Mark as Paid</button>
    </form>
    <p style="font-size:13px;color:#8a8f99;margin-top:14px;">This sends the customer their payment-confirmed email.</p>`
  return ok(page({
    title: 'Confirm Payment',
    heading: 'Confirm payment received?',
    message: `Order <strong>${order.order_number}</strong> &middot; <strong>${order.customer_name || ''}</strong><br>Amount: <strong style="color:#002b63;">$${total.toFixed(2)}</strong> via ${order.payment_method}<br><span style="color:#8a8f99;font-size:13px;">Only tap this once you've verified the payment landed in your account.</span>`,
    button,
  }))
}

// POST → actually mark paid + notify the customer
export async function onRequestPost({ request, env, waitUntil }) {
  let orderId, token
  const ct = request.headers.get('Content-Type') || ''
  if (ct.includes('application/json')) {
    const b = await request.json().catch(() => ({}))
    orderId = b.order; token = b.token
  } else {
    const form = await request.formData().catch(() => null)
    orderId = form?.get('order'); token = form?.get('token')
  }
  if (!orderId) return ok(page({ title: 'Error', heading: 'Unable to confirm', message: 'Missing order.', accent: '#b42318' }), 400)
  const expected = await tokenFor(orderId, env)
  if (token !== expected) return ok(page({ title: 'Error', heading: 'Unable to confirm', message: 'This link is invalid.', accent: '#b42318' }), 400)

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first()
  if (!order) return ok(page({ title: 'Error', heading: 'Order not found', message: 'We could not find that order.', accent: '#b42318' }), 404)

  const total = Number(order.order_total || order.subtotal || 0)

  if (order.status === 'paid' || ['fulfilled', 'shipped', 'completed'].includes(order.status)) {
    return ok(page({ title: 'Already Confirmed', heading: '✓ Already confirmed', accent: '#157347',
      message: `Order <strong>${order.order_number}</strong> was already marked paid.` }))
  }
  if (['cancelled', 'refunded'].includes(order.status)) {
    return ok(page({ title: 'Cannot confirm', heading: 'Cannot confirm', accent: '#b42318',
      message: `Order <strong>${order.order_number}</strong> is ${order.status}.` }))
  }

  // Mark paid (guard on status so a double-tap can't double-fire emails)
  const nowSec = Math.floor(Date.now() / 1000)
  const res = await env.DB.prepare(
    "UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'"
  ).bind(nowSec, orderId).run()

  if (!res.meta.changes) {
    return ok(page({ title: 'Already Confirmed', heading: '✓ Already confirmed', accent: '#157347',
      message: `Order <strong>${order.order_number}</strong> was just confirmed.` }))
  }

  // Notify the customer (same as the admin "Verify Payment" path)
  if (order.customer_email) {
    const items = JSON.parse(order.items_json || '[]')
    const shipping = JSON.parse(order.shipping_json || '{}')
    const phone = shipping?.phone?.trim()
    const firstName = (order.customer_name || '').split(' ')[0]
    let lang = 'en'
    if (order.user_id) {
      const u = await env.DB.prepare('SELECT lang FROM users WHERE id = ?').bind(order.user_id).first()
      lang = u?.lang || 'en'
    }
    const isEs = lang === 'es'
    waitUntil(sendEmail(env, {
      to: order.customer_email,
      subject: isEs ? `✅ Pago Confirmado — ${order.order_number}` : `✅ Payment Confirmed — ${order.order_number}`,
      html: isEs
        ? paidConfirmationHtmlEs({ order_number: order.order_number, customer_name: order.customer_name, items, total, payment_method: order.payment_method })
        : paidConfirmationHtml({ order_number: order.order_number, customer_name: order.customer_name, items, total, payment_method: order.payment_method }),
    }).catch(() => {}))
    if (phone) {
      waitUntil(sendSMS(env, {
        to: phone,
        message: isEs
          ? `✅ ¡Hola ${firstName}! Tu pago de $${total.toFixed(2)} para el pedido ${order.order_number} ha sido confirmado. ¡Estamos preparando tu pedido! 🙌`
          : `✅ Hi ${firstName}! Your payment of $${total.toFixed(2)} for order ${order.order_number} has been confirmed. We're getting your order ready! 🙌`,
      }).catch(() => {}))
    }
  }

  return ok(page({
    title: 'Payment Confirmed', heading: '✓ Payment confirmed', accent: '#157347',
    message: `Order <strong>${order.order_number}</strong> is now marked paid and the customer has been notified. You can close this page.`,
  }))
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

// Exposed so the order-creation flow can build the signed link
export { tokenFor }
