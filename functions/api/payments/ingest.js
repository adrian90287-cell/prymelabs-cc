import { corsHeaders, json } from '../../_utils/cors.js'
import { sendEmail, sendSMS } from '../../_utils/email.js'
import { pushToAll } from '../../_utils/webpush.js'

// Receives a parsed payment-notification (from the email Worker), matches it to
// a pending order by order number, and — if the amount checks out — marks the
// order Paid by calling the existing admin update-order flow (which fires the
// customer's paid-confirmation email, timestamps, OneDrive backup, etc.).
// Anything it can't confidently auto-verify is logged and the owner is pinged.

function authed(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return !!env.PAYMENT_INGEST_SECRET && auth === `Bearer ${env.PAYMENT_INGEST_SECRET}`
}

async function pingOwner(env, waitUntil, { title, line }) {
  waitUntil(pushToAll(env, { title, body: line, url: '/admin' }).catch(() => {}))
  waitUntil(sendSMS(env, { message: `${title} — ${line} · prymelabs.cc/admin` }).catch(() => {}))
  if (env.OWNER_EMAIL) {
    waitUntil(sendEmail(env, {
      to: env.OWNER_EMAIL,
      subject: `⚠️ ${title}`,
      html: `<div style="font-family:Inter,Arial,sans-serif;padding:20px;color:#111"><h2 style="margin:0 0 8px">${title}</h2><p style="color:#444;font-size:14px">${line}</p><p style="margin-top:16px"><a href="https://prymelabs.cc/admin" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700">Review in Admin →</a></p></div>`,
    }).catch(() => {}))
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!authed(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const provider = String(body.provider || 'unknown')
  const orderNum = String(body.order_number || '').toUpperCase().trim()
  const amount   = body.amount != null ? Number(body.amount) : null
  const rawFrom  = String(body.from || '').slice(0, 200)
  const subject  = String(body.subject || '').slice(0, 300)

  let matched = false
  let note = ''
  let order = null

  if (orderNum) {
    order = await env.DB.prepare('SELECT * FROM orders WHERE order_number = ? AND deleted_at IS NULL').bind(orderNum).first()
  }

  if (!orderNum)            note = 'no_order_number_in_email'
  else if (!order)         note = 'order_not_found'
  else if (order.status !== 'pending') note = `already_${order.status}`
  else {
    const expected = Number(order.order_total || order.subtotal || 0)
    if (amount != null && Math.abs(amount - expected) > 0.5) {
      note = `amount_mismatch_expected_${expected.toFixed(2)}_got_${amount.toFixed(2)}`
    } else {
      // Confident match → mark Paid via the existing admin flow
      const origin = new URL(request.url).origin
      const r = await fetch(`${origin}/api/admin/update-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer admin:${env.ADMIN_PASSWORD}` },
        body: JSON.stringify({ order_id: order.id, status: 'paid' }),
      })
      matched = r.ok
      note = matched ? 'auto_verified' : 'update_order_failed'
    }
  }

  // Audit every event
  waitUntil(env.DB.prepare(
    'INSERT INTO payment_events (provider, order_number, amount, matched, note, raw_from, subject) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(provider, orderNum || null, amount, matched ? 1 : 0, note, rawFrom, subject).run().catch(() => {}))

  if (matched) {
    waitUntil(sendSMS(env, { message: `✅ Auto-verified payment for ${orderNum} ($${(amount ?? 0).toFixed(2)}, ${provider}). Order marked Paid.` }).catch(() => {}))
  } else {
    // Payment arrived but we couldn't safely auto-verify — owner reviews
    const amt = amount != null ? `$${amount.toFixed(2)}` : 'unknown amount'
    const reason = {
      no_order_number_in_email: 'no order number found in the email',
      order_not_found: `order ${orderNum} not found`,
      amount_mismatch_expected: 'amount did not match the order total',
    }[note?.split('_').slice(0, 3).join('_')] || note
    await pingOwner(env, waitUntil, {
      title: 'Payment received — needs manual verify',
      line: `${provider} payment ${amt}${orderNum ? ` for ${orderNum}` : ''} — ${reason}.`,
    })
  }

  return json({ ok: true, matched, note })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
