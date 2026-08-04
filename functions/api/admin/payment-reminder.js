import { corsHeaders, json } from '../../_utils/cors.js'
import { sendEmail, sendSMS, paymentReminderHtml, paymentReminderHtmlEs } from '../../_utils/email.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

const PAYMENT_LABEL = { zelle: 'Zelle', cashapp: 'Cash App', venmo: 'Venmo' }

export async function onRequestPost({ request, env, waitUntil }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { order_id } = body
  if (!order_id) return json({ error: 'order_id required' }, 400)

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order_id).first()
  if (!order) return json({ error: 'Order not found' }, 404)

  // Reminders only make sense while the order is still awaiting payment
  if (order.status !== 'pending') {
    return json({ error: `Order is "${order.status}", not awaiting payment — no reminder sent.` }, 400)
  }
  if (!order.customer_email) return json({ error: 'Order has no customer email on file.' }, 400)

  const items    = JSON.parse(order.items_json || '[]')
  const shipping = JSON.parse(order.shipping_json || '{}')
  const total    = Number(order.order_total || order.subtotal || 0)
  const firstName = (order.customer_name || '').split(' ')[0] || 'there'

  const handles = {
    zelle:   env.ZELLE_HANDLE   ?? 'Contact us for payment info',
    cashapp: env.CASHAPP_HANDLE ?? 'Contact us for payment info',
    venmo:   env.VENMO_HANDLE   ?? 'Contact us for payment info',
  }
  const paymentHandle = handles[order.payment_method] || 'Contact us for payment info'
  const method = PAYMENT_LABEL[order.payment_method] || order.payment_method

  // Customer language preference
  let userLang = 'en'
  if (order.user_id) {
    const userRow = await env.DB.prepare('SELECT lang FROM users WHERE id = ?').bind(order.user_id).first()
    userLang = userRow?.lang || 'en'
  }
  const isEs = userLang === 'es'

  const emailArgs = {
    order_number:      order.order_number,
    customer_name:     order.customer_name,
    items,
    subtotal:          Number(order.subtotal || 0),
    total,
    promo_code:        order.promo_code,
    discount_amount:   Number(order.discount_amount || 0),
    shipping_cost:     Number(order.shipping_cost || 0),
    shipping_rate_name: order.shipping_rate_name,
    tax_rate:          Number(order.tax_rate || 0),
    tax_amount:        Number(order.tax_amount || 0),
    payment_method:    order.payment_method,
    payment_handle:    paymentHandle,
    shipping,
  }

  const emailResult = await sendEmail(env, {
    to: order.customer_email,
    subject: isEs
      ? `🔔 Recordatorio: Completa tu pago — ${order.order_number}`
      : `🔔 Reminder: Complete your payment — ${order.order_number}`,
    html: isEs ? paymentReminderHtmlEs(emailArgs) : paymentReminderHtml(emailArgs),
  })

  // Optional SMS if the customer left a phone number
  const phone = shipping?.phone?.trim()
  if (phone) {
    waitUntil(sendSMS(env, {
      to: phone,
      message: isEs
        ? `Hola ${firstName}, un recordatorio amistoso: tu pedido de Pryme Labs ${order.order_number} ($${total.toFixed(2)}) aún espera el pago vía ${method}. Paga a: ${paymentHandle} (memo: ${order.order_number}). ¡Gracias!`
        : `Hi ${firstName}, friendly reminder: your Pryme Labs order ${order.order_number} ($${total.toFixed(2)}) is still awaiting payment via ${method}. Pay to: ${paymentHandle} (memo: ${order.order_number}). Thank you!`,
    }).catch(() => {}))
  }

  if (emailResult?.error) return json({ error: 'Email failed to send', detail: emailResult.error }, 502)

  return json({ ok: true, emailed: !emailResult?.skipped, sms: !!phone })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
