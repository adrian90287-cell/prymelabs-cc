import { corsHeaders, json } from '../../_utils/cors.js'
import {
  sendEmail, sendSMS,
  paymentReminderHtml, paymentReminderHtmlEs,
  paymentExpiredHtml, paymentExpiredHtmlEs,
} from '../../_utils/email.js'
import { uploadToOneDrive } from '../../_utils/onedrive.js'
import { statusUpdateHtml, orderReceiptHtml } from '../../_utils/documents.js'
import { refreshOrderTracking } from '../../_utils/tracking.js'

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled maintenance for pending (unpaid) orders. Invoked on a timer by the
// companion cron Worker, which authenticates with the shared CRON_SECRET.
//   1. Reminder  — one friendly payment reminder once an order has been pending
//                  for `pending_reminder_hours` (default 24h).
//   2. Auto-cancel — after `pending_autocancel_hours` (default 72h) an unpaid
//                    order is cancelled, its stock released, and a courtesy
//                    cancellation notice sent to the customer.
// Both thresholds are configurable via the settings table.
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_LABEL = { zelle: 'Zelle', cashapp: 'Cash App', venmo: 'Venmo' }

function authed(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return !!env.CRON_SECRET && auth === `Bearer ${env.CRON_SECRET}`
}

function safeJson(s, def) { try { return JSON.parse(s || 'null') ?? def } catch { return def } }

async function getSetting(env, key, def) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first()
  const n = Number(row?.value)
  return (row?.value != null && row.value !== '' && Number.isFinite(n)) ? n : def
}

async function getEasyPostKey(env) {
  if (env.EASYPOST_API_KEY) return env.EASYPOST_API_KEY
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'easypost_api_key'").first()
  return row?.value || null
}

async function langFor(env, order) {
  if (!order.user_id) return 'en'
  const u = await env.DB.prepare('SELECT lang FROM users WHERE id = ?').bind(order.user_id).first()
  return u?.lang || 'en'
}

// ── Cancel one stale unpaid order: release stock + notify customer ────────────
async function autoCancel(env, order, waitUntil) {
  const items = safeJson(order.items_json, [])

  // Release reserved inventory (skip unlimited products — same guard as manual cancel)
  const restore = items
    .filter(i => i.product_id)
    .map(i => env.DB.prepare(
      'UPDATE products SET stock_qty = stock_qty + ?, in_stock = 1 WHERE id = ? AND (stock_qty > 0 OR in_stock = 0)'
    ).bind(i.qty, i.product_id))
  if (restore.length) await env.DB.batch(restore)

  // Flag the order cancelled
  await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").bind(order.id).run()

  // OneDrive backup — parity with the manual cancel path in update-order.js:
  // a status-log entry + the full receipt filed under Cancelled & Refunded.
  const d        = new Date()
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const dateStr  = d.toISOString().slice(0, 10)
  const safeNum  = (order.order_number || '').replace(/[^a-zA-Z0-9-]/g, '')
  const filename = `${safeNum} - Cancelled - ${dateStr}.html`
  waitUntil(uploadToOneDrive(env, {
    folderPath: `prymelabs-cc/Store Operations/13 Admin/Status Logs/${monthKey}`,
    filename,
    content:    statusUpdateHtml(order, 'cancelled', null),
  }).catch(() => {}))
  waitUntil(uploadToOneDrive(env, {
    folderPath: `prymelabs-cc/Store Operations/06 Cancelled & Refunded Orders/${monthKey}`,
    filename,
    content:    orderReceiptHtml({ ...order, status: 'cancelled' }),
  }).catch(() => {}))

  const isEs      = (await langFor(env, order)) === 'es'
  const total     = Number(order.order_total || order.subtotal || 0)
  const firstName = (order.customer_name || '').split(' ')[0]
  const phone     = safeJson(order.shipping_json, {})?.phone?.trim()

  if (order.customer_email) {
    waitUntil(sendEmail(env, {
      to: order.customer_email,
      subject: isEs ? `Pedido Cancelado — ${order.order_number}` : `Order Cancelled — ${order.order_number}`,
      html: isEs
        ? paymentExpiredHtmlEs({ order_number: order.order_number, customer_name: order.customer_name, items, total })
        : paymentExpiredHtml({ order_number: order.order_number, customer_name: order.customer_name, items, total }),
    }).catch(() => {}))
  }
  if (phone) {
    waitUntil(sendSMS(env, {
      to: phone,
      message: isEs
        ? `Hola ${firstName}, tu pedido de Pryme Labs ${order.order_number} fue cancelado porque no recibimos el pago. Sin cargos. Puedes volver a ordenar cuando quieras: prymelabs.cc/shop`
        : `Hi ${firstName}, your Pryme Labs order ${order.order_number} was cancelled since payment wasn't received. No charge — you're welcome to reorder anytime: prymelabs.cc/shop`,
    }).catch(() => {}))
  }
}

// ── Send one courtesy payment reminder ───────────────────────────────────────
async function remind(env, order, waitUntil) {
  if (!order.customer_email) {
    // Nothing to send, but still stamp so we don't re-scan it every run
    await env.DB.prepare('UPDATE orders SET reminder_sent_at = ? WHERE id = ?').bind(Math.floor(Date.now() / 1000), order.id).run()
    return
  }
  const isEs      = (await langFor(env, order)) === 'es'
  const items     = safeJson(order.items_json, [])
  const total     = Number(order.order_total || order.subtotal || 0)
  const firstName = (order.customer_name || '').split(' ')[0]
  const phone     = safeJson(order.shipping_json, {})?.phone?.trim()

  const handles = {
    zelle:   env.ZELLE_HANDLE   ?? 'Contact us for payment info',
    cashapp: env.CASHAPP_HANDLE ?? 'Contact us for payment info',
    venmo:   env.VENMO_HANDLE   ?? 'Contact us for payment info',
  }
  const paymentHandle = handles[order.payment_method] || 'Contact us for payment info'
  const method = PAYMENT_LABEL[order.payment_method] || order.payment_method

  const args = {
    order_number: order.order_number, customer_name: order.customer_name,
    items, subtotal: Number(order.subtotal || 0), total,
    promo_code: order.promo_code, discount_amount: Number(order.discount_amount || 0),
    shipping_cost: Number(order.shipping_cost || 0), shipping_rate_name: order.shipping_rate_name,
    tax_rate: Number(order.tax_rate || 0), tax_amount: Number(order.tax_amount || 0),
    payment_method: order.payment_method, payment_handle: paymentHandle,
    shipping: safeJson(order.shipping_json, {}),
  }

  // Stamp first so a slow email send can't cause a duplicate on the next run
  await env.DB.prepare('UPDATE orders SET reminder_sent_at = ? WHERE id = ?').bind(Math.floor(Date.now() / 1000), order.id).run()

  waitUntil(sendEmail(env, {
    to: order.customer_email,
    subject: isEs
      ? `🔔 Recordatorio: Completa tu pago — ${order.order_number}`
      : `🔔 Reminder: Complete your payment — ${order.order_number}`,
    html: isEs ? paymentReminderHtmlEs(args) : paymentReminderHtml(args),
  }).catch(() => {}))

  if (phone) {
    waitUntil(sendSMS(env, {
      to: phone,
      message: isEs
        ? `Hola ${firstName}, recordatorio: tu pedido ${order.order_number} ($${total.toFixed(2)}) espera el pago vía ${method}. Paga a: ${paymentHandle} (memo: ${order.order_number}).`
        : `Hi ${firstName}, reminder: your order ${order.order_number} ($${total.toFixed(2)}) is awaiting payment via ${method}. Pay to: ${paymentHandle} (memo: ${order.order_number}).`,
    }).catch(() => {}))
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!authed(request, env)) return json({ error: 'Unauthorized' }, 401)

  const now          = Math.floor(Date.now() / 1000)
  const reminderHours = await getSetting(env, 'pending_reminder_hours', 24)
  const cancelHours   = await getSetting(env, 'pending_autocancel_hours', 72)
  const cancelBefore  = now - cancelHours   * 3600
  const remindBefore  = now - reminderHours * 3600

  // 1. Auto-cancel orders pending longer than the cancel threshold
  const { results: stale } = await env.DB.prepare(
    `SELECT * FROM orders WHERE status = 'pending' AND deleted_at IS NULL AND created_at <= ?
     ORDER BY created_at ASC LIMIT 100`
  ).bind(cancelBefore).all()
  for (const order of stale || []) await autoCancel(env, order, waitUntil)

  // 2. Remind orders in the [reminder, cancel) window that haven't been reminded
  const { results: due } = await env.DB.prepare(
    `SELECT * FROM orders WHERE status = 'pending' AND deleted_at IS NULL
       AND reminder_sent_at IS NULL AND created_at <= ? AND created_at > ?
     ORDER BY created_at ASC LIMIT 100`
  ).bind(remindBefore, cancelBefore).all()
  for (const order of due || []) await remind(env, order, waitUntil)

  // 3. Safety-net tracking sweep. The EasyPost webhook handles auto-ship and
  // auto-complete in real time, but this hourly pass catches anything it
  // missed and covers manually-tracked (non-EasyPost) shipments: it
  // auto-ships on first carrier scan and auto-completes on delivery.
  // force:false respects the 30-min per-package throttle so it never
  // duplicates work the webhook already did.
  const easypostKey = await getEasyPostKey(env)
  let swept = 0, completed = 0, autoShipped = 0
  const { results: active } = await env.DB.prepare(
    `SELECT * FROM orders
       WHERE status IN ('fulfilled', 'shipped') AND deleted_at IS NULL AND tracking_json LIKE '%"number"%'
     ORDER BY COALESCE(shipped_at, fulfilled_at, created_at) DESC LIMIT 100`
  ).all()
  for (const order of active || []) {
    const r = await refreshOrderTracking(env, order, { force: false, waitUntil, easypostKey }).catch(() => null)
    if (!r) continue
    swept++
    if (r.order_status === 'completed') completed++
    if (r.auto_shipped) autoShipped++
  }

  return json({
    ok: true,
    cancelled: (stale || []).length,
    reminded:  (due || []).length,
    tracking:  { swept, completed, autoShipped },
    thresholds: { reminderHours, cancelHours },
  })
}

// Manual trigger / health check (same auth)
export async function onRequestGet(ctx) { return onRequestPost(ctx) }

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
