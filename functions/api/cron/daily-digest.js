import { corsHeaders, json } from '../../_utils/cors.js'
import { sendEmail, ownerDigestHtml, reviewRequestHtml, reviewRequestHtmlEs } from '../../_utils/email.js'

// Daily job (fired by the cron Worker). Two parts:
//   1. Email the owner a summary of the last 24h + things needing attention.
//   2. Send a one-time thank-you/review request for orders delivered a few
//      days ago (configurable via review_request_delay_days, default 3).

function authed(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return !!env.CRON_SECRET && auth === `Bearer ${env.CRON_SECRET}`
}

function safeJson(s, def) { try { return JSON.parse(s || 'null') ?? def } catch { return def } }

async function getSetting(env, key, def) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first()
  return row?.value != null && row.value !== '' ? row.value : def
}

async function langForEmail(env, email, userId) {
  if (userId) {
    const u = await env.DB.prepare('SELECT lang FROM users WHERE id = ?').bind(userId).first()
    if (u?.lang) return u.lang
  }
  if (email) {
    const u = await env.DB.prepare('SELECT lang FROM users WHERE email = ?').bind(email).first()
    return u?.lang || 'en'
  }
  return 'en'
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!authed(request, env)) return json({ error: 'Unauthorized' }, 401)

  const now   = Math.floor(Date.now() / 1000)
  const dayAgo = now - 86400

  // Current calendar quarter start (UTC)
  const dnow = new Date(now * 1000)
  const quarterIdx = Math.floor(dnow.getUTCMonth() / 3)
  const quarterStart = Math.floor(Date.UTC(dnow.getUTCFullYear(), quarterIdx * 3, 1) / 1000)
  const quarterLabel = `Q${quarterIdx + 1} ${dnow.getUTCFullYear()}`

  // ── 1. Owner digest ────────────────────────────────────────────────────────
  const num = (row, k = 'n') => Number(row?.[k] || 0)
  // Realized revenue = payment verified or beyond. Pending (unpaid) is tracked
  // separately so the headline numbers reflect money actually received.
  const REALIZED = "deleted_at IS NULL AND status IN ('paid','fulfilled','shipped','completed')"
  const PLACED   = "deleted_at IS NULL AND status NOT IN ('cancelled','refunded')"

  const [revRow, cntRow, pendRow, fulfRow, shipRow, delivRow, qRevRow, allRevRow] = await Promise.all([
    env.DB.prepare(`SELECT COALESCE(SUM(COALESCE(order_total, subtotal)),0) AS n FROM orders WHERE ${REALIZED} AND created_at >= ?`).bind(dayAgo).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM orders WHERE ${PLACED} AND created_at >= ?`).bind(dayAgo).first(),
    env.DB.prepare("SELECT COALESCE(SUM(COALESCE(order_total, subtotal)),0) AS rev, COUNT(*) AS n FROM orders WHERE deleted_at IS NULL AND status = 'pending'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE deleted_at IS NULL AND status = 'paid'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE deleted_at IS NULL AND status = 'shipped'").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE deleted_at IS NULL AND delivered_at >= ?").bind(dayAgo).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(COALESCE(order_total, subtotal)),0) AS n FROM orders WHERE ${REALIZED} AND created_at >= ?`).bind(quarterStart).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(COALESCE(order_total, subtotal)),0) AS n FROM orders WHERE ${REALIZED}`).first(),
  ])

  const lowStock = (await env.DB.prepare(
    'SELECT name, stock_qty FROM products WHERE stock_qty > 0 AND low_stock_threshold > 0 AND stock_qty <= low_stock_threshold ORDER BY stock_qty ASC LIMIT 15'
  ).all()).results || []

  // Products in the catalog that are currently out of stock (in_stock = 0)
  const outOfStock = (await env.DB.prepare(
    'SELECT name FROM products WHERE in_stock = 0 ORDER BY name ASC LIMIT 30'
  ).all()).results || []

  let digestSent = false
  if (env.OWNER_EMAIL) {
    const dateLabel = new Date(now * 1000).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/Chicago' })
    waitUntil(sendEmail(env, {
      to: env.OWNER_EMAIL,
      subject: `📊 Pryme Labs Daily Summary — ${dateLabel}`,
      html: ownerDigestHtml({
        dateLabel,
        revenue: num(revRow), orderCount: num(cntRow),
        awaitingPayment: num(pendRow, 'n'), pendingRevenue: num(pendRow, 'rev'),
        toFulfill: num(fulfRow),
        shippedActive: num(shipRow), deliveredYesterday: num(delivRow),
        lowStock, outOfStock,
        quarterLabel, quarterRevenue: num(qRevRow), allTimeRevenue: num(allRevRow),
      }),
    }).catch(() => {}))
    digestSent = true
  }

  // ── 2. Post-delivery review requests ───────────────────────────────────────
  const delayDays  = Math.max(0, Number(await getSetting(env, 'review_request_delay_days', '3')) || 3)
  const promoCode  = (await getSetting(env, 'review_promo_code', '')) || null
  const reviewCutoff = now - delayDays * 86400

  const { results: toReview } = await env.DB.prepare(
    `SELECT id, order_number, customer_name, customer_email, user_id
     FROM orders
     WHERE deleted_at IS NULL AND status = 'completed' AND review_request_sent_at IS NULL
       AND COALESCE(delivered_at, shipped_at, created_at) <= ?
     ORDER BY created_at ASC LIMIT 100`
  ).bind(reviewCutoff).all()

  let reviewed = 0
  for (const order of toReview || []) {
    // Stamp first so a retry can't double-send
    await env.DB.prepare('UPDATE orders SET review_request_sent_at = ? WHERE id = ?').bind(now, order.id).run()
    if (!order.customer_email) continue
    const isEs = (await langForEmail(env, order.customer_email, order.user_id)) === 'es'
    waitUntil(sendEmail(env, {
      to: order.customer_email,
      subject: isEs ? `¡Gracias por tu pedido! — ${order.order_number}` : `Thanks for your order! — ${order.order_number}`,
      html: isEs
        ? reviewRequestHtmlEs({ customer_name: order.customer_name, order_number: order.order_number, promo_code: promoCode })
        : reviewRequestHtml({ customer_name: order.customer_name, order_number: order.order_number, promo_code: promoCode }),
    }).catch(() => {}))
    reviewed++
  }

  return json({ ok: true, digestSent, reviewRequests: reviewed, lowStockCount: lowStock.length, outOfStockCount: outOfStock.length })
}

export async function onRequestGet(ctx) { return onRequestPost(ctx) }

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
