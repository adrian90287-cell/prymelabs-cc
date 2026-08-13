import { verifyJWT } from '../../_utils/jwt.js'
import { hmacHex } from '../../_utils/crypto.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { resolveSaleConfig, saleAmountForDept } from '../../_utils/sale.js'
import {
  sendEmail,
  sendSMS,
  customerConfirmationHtml,
  customerConfirmationHtmlEs,
  ownerNotificationHtml,
} from '../../_utils/email.js'
// sendSMS is also used for low-stock owner alerts below
import { pushToAll } from '../../_utils/webpush.js'
import { uploadToOneDrive, downloadFromOneDrive } from '../../_utils/onedrive.js'
import { orderReceiptHtml, taxRecordHtml, orderCsvRow, buildCsv } from '../../_utils/documents.js'

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function stripeAmount(value) {
  return Math.round(Number(value || 0) * 100)
}

async function createStripeCheckoutSession(env, {
  origin,
  orderId,
  orderNumber,
  customerEmail,
  total,
}) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured yet. Add STRIPE_SECRET_KEY before testing card checkout.')
  }

  const params = new URLSearchParams()
  params.set('mode', 'payment')
  params.set('client_reference_id', orderNumber)
  params.set('customer_email', customerEmail)
  params.set('success_url', `${origin}/order-confirmation?stripe=success&order=${encodeURIComponent(orderNumber)}`)
  params.set('cancel_url', `${origin}/checkout?stripe=cancelled&order=${encodeURIComponent(orderNumber)}`)
  params.set('payment_method_types[]', 'card')
  params.set('metadata[order_id]', String(orderId))
  params.set('metadata[order_number]', orderNumber)
  params.set('line_items[0][quantity]', '1')
  params.set('line_items[0][price_data][currency]', 'usd')
  params.set('line_items[0][price_data][unit_amount]', String(stripeAmount(total)))
  params.set('line_items[0][price_data][product_data][name]', `Pryme Labs Order ${orderNumber}`)

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Stripe checkout could not be started.')
  }
  if (!data.url) throw new Error('Stripe did not return a checkout URL.')
  return data
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function loadLocalDeliverySettings(env) {
  const { results } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('local_delivery_enabled','local_delivery_radius_miles','local_delivery_hub_lat','local_delivery_hub_lng','local_delivery_flat_rate')"
  ).all()
  const cfg = {}
  for (const r of (results || [])) cfg[r.key] = r.value
  return cfg
}

export async function onRequestPost({ request, env, waitUntil }) {
  const authHeader = request.headers.get('Authorization')
  let payload = null
  if (authHeader?.startsWith('Bearer ')) {
    payload = await verifyJWT(authHeader.slice(7), env)
    if (!payload) return json({ error: 'Invalid or expired token' }, 401)
  }

  // Rate-limit order creation — 10 per 15 minutes per IP
  const rl = await checkRateLimit(env, rateLimitKey(request, 'order'))
  if (rl.blocked) return json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { items, payment_method, shipping, language, promo_code, partner_code, shipping_rate_id, local_delivery, customer_email } = body

  if (!Array.isArray(items) || items.length === 0) return json({ error: 'Cart is empty' }, 400)
  if (items.length > 50) return json({ error: 'Too many items in cart' }, 400)
  if (!['zelle', 'cashapp', 'venmo', 'stripe'].includes(payment_method)) return json({ error: 'Invalid payment method' }, 400)
  if (!shipping?.address || !shipping?.city || !shipping?.state || !shipping?.zip) {
    return json({ error: 'Complete shipping address required' }, 400)
  }
  const guestEmail = String(customer_email || '').trim().toLowerCase()
  if (!payload && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return json({ error: 'Valid email required for guest checkout' }, 400)
  }

  // ── Validate basic item shape, then fetch authoritative prices + stock ──────
  // SECURITY: we NEVER trust client-provided prices — always look up from DB
  const reqItems = []
  for (const item of items) {
    if (!item.product_id) return json({ error: 'Each item must reference a valid product' }, 400)
    const qty = Math.floor(Number(item.qty))
    if (!qty || qty < 1 || qty > 100) return json({ error: 'Invalid item quantity' }, 400)
    reqItems.push({ product_id: item.product_id, size: item.size, qty })
  }

  // Single batched lookup instead of one query per cart line
  const ids = [...new Set(reqItems.map(i => i.product_id))]
  const placeholders = ids.map(() => '?').join(',')
  const { results: prodRows } = await env.DB.prepare(
    `SELECT id, name, price, stock_qty, in_stock, weight_oz, bundle_of_product_id, bundle_qty, no_discount, department FROM products WHERE id IN (${placeholders})`
  ).bind(...ids).all()
  const prodMap = new Map((prodRows || []).map(p => [p.id, p]))

  // A case draws stock from its parent single — make sure the parent is loaded too
  const parentIds = [...new Set((prodRows || [])
    .filter(p => p.bundle_of_product_id != null)
    .map(p => p.bundle_of_product_id))].filter(id => !prodMap.has(id))
  if (parentIds.length) {
    const pph = parentIds.map(() => '?').join(',')
    const { results: parentRows } = await env.DB.prepare(
      `SELECT id, name, price, stock_qty, in_stock, weight_oz, bundle_of_product_id, bundle_qty, no_discount FROM products WHERE id IN (${pph})`
    ).bind(...parentIds).all()
    for (const pr of parentRows || []) prodMap.set(pr.id, pr)
  }

  // ── Pricing knobs — mirror /api/products so the CHARGED price equals the
  // DISPLAYED price. Without this the order bills the raw DB price and silently
  // skips the active global sale (customers see $169 but get charged $179).
  const { results: priceCfgRows } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('sale_config','sale_mode_enabled','sale_discount_amount','sale_departments','master_price_adjust')"
  ).all()
  const priceCfg = {}
  for (const r of (priceCfgRows || [])) priceCfg[r.key] = r.value
  const masterAdjust = Number(priceCfg.master_price_adjust) || 0
  const saleConfig = resolveSaleConfig(priceCfg)

  // Cases/bundles (no_discount) bill the raw wholesale price; everything else
  // gets the master adjust then the per-department sale — matches the storefront feed.
  const effectivePrice = (rawPrice, noDiscount, department) => {
    if (noDiscount) return Math.max(0.01, Number(rawPrice))
    let price = Math.max(0.01, Number(rawPrice) + masterAdjust)
    const saleAmt = saleAmountForDept(saleConfig, department)
    if (saleAmt > 0) price = Math.max(0.01, price - saleAmt)
    return Number(price.toFixed(2))
  }

  const dbItems = []
  const reservationPlan = []   // { product_id, qty } — the actual stock to draw down
  for (const item of reqItems) {
    const product = prodMap.get(item.product_id)
    if (!product) return json({ error: 'Product not found' }, 400)

    const isBundle   = product.bundle_of_product_id != null
    const per        = isBundle ? Math.max(1, Number(product.bundle_qty) || 1) : 1
    const stockOwner = isBundle ? prodMap.get(product.bundle_of_product_id) : product
    const unitsNeeded = item.qty * per

    if (!stockOwner || !stockOwner.in_stock) return json({ error: `${product.name} is out of stock` }, 400)
    if (stockOwner.stock_qty > 0 && stockOwner.stock_qty < unitsNeeded) {
      const avail = isBundle ? Math.floor(stockOwner.stock_qty / per) : stockOwner.stock_qty
      return json({ error: `Only ${avail} of ${product.name} available` }, 400)
    }

    const noDiscountFlag = (product.no_discount === 1 || isBundle) ? 1 : 0
    dbItems.push({
      product_id: item.product_id,
      name: product.name,              // always use DB name
      size: String(item.size || '').slice(0, 100),
      // Server-authoritative price with the same sale logic the storefront shows —
      // never trust the client, but do honor the active sale.
      price: effectivePrice(product.price, noDiscountFlag, product.department),
      qty: item.qty,
      weight_oz: Number(product.weight_oz) || 0,  // snapshot for label auto-weight
      no_discount: noDiscountFlag,
      department: product.department || 'Peptides',  // snapshot for slip/compliance
    })
    reservationPlan.push({ product_id: stockOwner.id, qty: unitsNeeded, name: product.name })
  }

  const subtotal = Number(dbItems.reduce((sum, i) => sum + i.price * i.qty, 0).toFixed(2))
  const hasPeptides = dbItems.some(i => (i.department || 'Peptides') === 'Peptides')
  const hasNonPeptides = dbItems.some(i => (i.department || 'Peptides') !== 'Peptides')
  if (hasPeptides && hasNonPeptides) {
    return json({ error: 'Peptide products must be checked out separately from other departments.' }, 400)
  }
  if (!payload && hasPeptides) {
    return json({ error: 'Login is required for Peptides checkout' }, 401)
  }
  if (payment_method === 'stripe' && hasPeptides) {
    return json({ error: 'Card checkout is not available for Peptides. Please check out peptide items separately.' }, 400)
  }
  // Only non-case items are eligible for promo discounts
  const discountableSubtotal = Number(dbItems.reduce((sum, i) => sum + (i.no_discount ? 0 : i.price * i.qty), 0).toFixed(2))

  // ── Resolve promo + affiliate partner codes (one of each may stack) ─────────
  // Has this user already redeemed this code on a past order? Past orders store
  // applied codes comma-separated, so split + match each token precisely.
  const usedByUserBefore = async (code) => {
    if (!payload) return false
    const { results } = await env.DB.prepare(
      'SELECT promo_code FROM orders WHERE user_id = ? AND promo_code IS NOT NULL'
    ).bind(payload.sub).all()
    const target = code.toUpperCase()
    return (results || []).some(r =>
      String(r.promo_code || '').split(',').map(s => s.trim().toUpperCase()).includes(target)
    )
  }

  const resolveCode = async (code) => {
    if (!code || typeof code !== 'string') return null
    const promo = await env.DB.prepare(
      'SELECT * FROM promo_codes WHERE code = ? AND is_active = 1'
    ).bind(code.toUpperCase().trim().slice(0, 64)).first()
    if (!promo) return null
    const now = Math.floor(Date.now() / 1000)
    if (promo.expires_at && promo.expires_at < now) return null
    if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) return null
    if (promo.min_order_amount > 0 && discountableSubtotal < promo.min_order_amount) return null
    // One-use-per-customer enforcement is tied to verified accounts.
    // Guest checkouts cannot redeem account-limited codes.
    if (promo.one_use_per_user && (!payload || await usedByUserBefore(promo.code))) return null
    return promo
  }

  const resolvedPromo   = await resolveCode(promo_code)
  const resolvedPartner = await resolveCode(partner_code)

  let discount_amount = 0
  let promo_no_tax = false
  const appliedCodes = []

  // Promo applies to the discountable (non-case) subtotal first
  if (resolvedPromo) {
    const d = resolvedPromo.discount_type === 'percent'
      ? Number((discountableSubtotal * resolvedPromo.discount_value / 100).toFixed(2))
      : Number(Math.min(discountableSubtotal, resolvedPromo.discount_value).toFixed(2))
    discount_amount = Number((discount_amount + d).toFixed(2))
    if (resolvedPromo.no_tax) promo_no_tax = true
    appliedCodes.push(resolvedPromo.code)
  }

  // Affiliate partner discount stacks on the remaining discountable amount
  if (resolvedPartner) {
    const base = Math.max(0, discountableSubtotal - discount_amount)
    const d = resolvedPartner.discount_type === 'percent'
      ? Number((base * resolvedPartner.discount_value / 100).toFixed(2))
      : Number(Math.min(base, resolvedPartner.discount_value).toFixed(2))
    discount_amount = Number((discount_amount + d).toFixed(2))
    if (resolvedPartner.no_tax) promo_no_tax = true
    appliedCodes.push(resolvedPartner.code)
  }

  const applied_promo_code = appliedCodes.length > 0 ? appliedCodes.join(', ') : null

  // A free-shipping code (promo or partner) waives the carrier shipping cost.
  const codeFreeShipping = resolvedPromo?.free_shipping === 1 || resolvedPartner?.free_shipping === 1

  // ── Resolve shipping ───────────────────────────────────────────────────────
  // Local (same-day Uber Direct) delivery is a flat rate and is never eligible
  // for free-shipping thresholds or codes. Otherwise resolve the chosen carrier rate.
  let shipping_cost = 0
  let shipping_rate_name = null
  const isLocalDelivery = !!local_delivery
  if (isLocalDelivery) {
    const ld = await loadLocalDeliverySettings(env)
    if (ld.local_delivery_enabled !== '1') {
      return json({ error: 'Same-day local delivery is not currently available.' }, 400)
    }

    const hubLat = toNumber(ld.local_delivery_hub_lat) ?? 29.7065
    const hubLng = toNumber(ld.local_delivery_hub_lng) ?? -95.3127
    const dropoffLat = toNumber(shipping.lat)
    const dropoffLng = toNumber(shipping.lng)
    const radiusMiles = Number(ld.local_delivery_radius_miles) || 15

    if (dropoffLat == null || dropoffLng == null) {
      return json({ error: 'Select your address from the suggestions to use same-day local delivery.' }, 400)
    }

    const distanceMiles = haversineMiles(hubLat, hubLng, dropoffLat, dropoffLng)
    if (distanceMiles > radiusMiles) {
      return json({ error: `Same-day local delivery is only available within ${radiusMiles} miles of our Houston hub.` }, 400)
    }

    shipping.local_delivery_distance_miles = Number(distanceMiles.toFixed(2))
    shipping.local_delivery_verified_at = Math.floor(Date.now() / 1000)
    shipping_cost = Number(ld.local_delivery_flat_rate) || 50
    shipping_rate_name = 'Same-Day Local Delivery'
  } else if (shipping_rate_id) {
    const rate = await env.DB.prepare(
      'SELECT * FROM shipping_rates WHERE id = ? AND is_active = 1'
    ).bind(shipping_rate_id).first()
    if (rate) {
      const { results: fsRows } = await env.DB.prepare(
        "SELECT key, value FROM settings WHERE key IN ('free_shipping_threshold','free_shipping_all')"
      ).all()
      const fs = {}; for (const r of (fsRows || [])) fs[r.key] = r.value
      const freeAt = Number(fs.free_shipping_threshold) || 0
      const freeByThreshold = freeAt > 0 && (subtotal - discount_amount) >= freeAt
      const freeAllOrders = fs.free_shipping_all === '1'
      shipping_cost = (codeFreeShipping || freeByThreshold || freeAllOrders) ? 0 : rate.price
      shipping_rate_name = rate.name
    }
  }

  // ── Tax ────────────────────────────────────────────────────────────────────
  // Only the product subtotal (after discounts) is taxed — shipping is NOT taxed
  const taxRateRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'tax_rate'").first()
  const tax_rate = Number(taxRateRow?.value) || 0
  const taxable = subtotal - discount_amount
  const tax_amount = promo_no_tax ? 0 : Number((taxable * tax_rate).toFixed(2))
  const order_total = Number((taxable + shipping_cost + tax_amount).toFixed(2))

  const handles = {
    zelle: env.ZELLE_HANDLE ?? 'Contact us for payment info',
    cashapp: env.CASHAPP_HANDLE ?? 'Contact us for payment info',
    venmo: env.VENMO_HANDLE ?? 'Contact us for payment info',
  }

  const customerEmail = payload?.email || guestEmail
  const customerName = payload?.name || String(shipping?.name || '').trim()

  // ── Atomically reserve stock BEFORE creating the order ─────────────────────
  // A conditional decrement (stock_qty >= qty) only applies when enough stock
  // still exists, closing the check-then-decrement race that could oversell
  // under concurrent orders. Unlimited products (stock_qty = 0, in_stock = 1)
  // are untracked and skipped. On a genuine shortfall we roll back and abort.
  // Reserve against the reservation plan — for a case this targets its parent
  // single and draws bundle_qty × qty vials from the shared pool.
  const reserved = []
  for (const i of reservationPlan) {
    const r = await env.DB.prepare(
      `UPDATE products
         SET stock_qty = stock_qty - ?,
             in_stock  = CASE WHEN stock_qty - ? <= 0 THEN 0 ELSE in_stock END
       WHERE id = ? AND stock_qty >= ?`
    ).bind(i.qty, i.qty, i.product_id, i.qty).run()

    if (r.meta.changes > 0) { reserved.push(i); continue }

    // No row changed — either an unlimited product (fine) or a real shortfall
    const p = await env.DB.prepare('SELECT name, stock_qty, in_stock FROM products WHERE id = ?').bind(i.product_id).first()
    const unlimited = p && p.stock_qty === 0 && p.in_stock === 1
    if (!unlimited) {
      for (const d of reserved) {
        await env.DB.prepare('UPDATE products SET stock_qty = stock_qty + ?, in_stock = 1 WHERE id = ?').bind(d.qty, d.product_id).run()
      }
      return json({ error: `${i.name || 'An item'} just sold out — please adjust your cart and try again.` }, 409)
    }
  }

  // ── Insert order — derive collision-safe order number from auto-increment ID
  const insertResult = await env.DB.prepare(
    `INSERT INTO orders (
      order_number, user_id, customer_name, customer_email,
      items_json, shipping_json, subtotal, payment_method,
      promo_code, discount_amount, shipping_rate_name, shipping_cost,
      tax_rate, tax_amount, order_total, local_delivery
    ) VALUES ('TEMP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    payload?.sub || null, customerName, customerEmail,
    JSON.stringify(dbItems), JSON.stringify(shipping), subtotal, payment_method,
    applied_promo_code, discount_amount, shipping_rate_name, shipping_cost,
    tax_rate, tax_amount, order_total, isLocalDelivery ? 1 : 0
  ).run()

  const orderId = insertResult.meta.last_row_id
  const orderNumber = `PL-${String(orderId).padStart(5, '0')}`
  await env.DB.prepare('UPDATE orders SET order_number = ? WHERE id = ?').bind(orderNumber, orderId).run()

  // ── Increment promo usage counts (only after order is confirmed in DB) ─────
  if (resolvedPromo) {
    await env.DB.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').bind(resolvedPromo.id).run()
  }
  if (resolvedPartner) {
    await env.DB.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').bind(resolvedPartner.id).run()
  }

  if (payment_method === 'stripe') {
    try {
      const origin = new URL(request.url).origin
      const session = await createStripeCheckoutSession(env, {
        origin,
        orderId,
        orderNumber,
        customerEmail,
        total: order_total,
      })
      return json({
        order_number: orderNumber,
        payment_method,
        subtotal,
        discount_amount,
        shipping_cost,
        shipping_rate_name,
        tax_amount,
        order_total,
        stripe_checkout_url: session.url,
        stripe_session_id: session.id,
      })
    } catch (err) {
      for (const d of reserved) {
        await env.DB.prepare('UPDATE products SET stock_qty = stock_qty + ?, in_stock = 1 WHERE id = ?').bind(d.qty, d.product_id).run()
      }
      if (resolvedPromo) {
        await env.DB.prepare('UPDATE promo_codes SET used_count = MAX(0, used_count - 1) WHERE id = ?').bind(resolvedPromo.id).run()
      }
      if (resolvedPartner) {
        await env.DB.prepare('UPDATE promo_codes SET used_count = MAX(0, used_count - 1) WHERE id = ?').bind(resolvedPartner.id).run()
      }
      await env.DB.prepare("UPDATE orders SET status = 'cancelled', notes = ? WHERE id = ?")
        .bind(`Stripe checkout start failed: ${err.message}`, orderId).run()
      return json({ error: err.message || 'Stripe checkout could not be started.' }, 502)
    }
  }

  // ── Low-stock alert (stock was already reserved above) ─────────────────────
  // Dedupe by the actual stock-owning product (a case + singles share a parent)
  const stockItems = [...new Map(reservationPlan.map(i => [i.product_id, i])).values()]
  if (stockItems.length > 0) {
    if (env.OWNER_EMAIL) {
      const alertProducts = []
      for (const item of stockItems) {
        const p = await env.DB.prepare(
          'SELECT name, stock_qty, low_stock_threshold FROM products WHERE id = ?'
        ).bind(item.product_id).first()
        if (p && p.stock_qty > 0 && p.low_stock_threshold > 0 && p.stock_qty <= p.low_stock_threshold) {
          alertProducts.push({ name: p.name, qty: p.stock_qty, threshold: p.low_stock_threshold })
        }
      }
      if (alertProducts.length > 0) {
        const alertRows = alertProducts.map(p =>
          `<tr><td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;color:#e4e4e7">${p.name}</td><td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;color:#f59e0b;font-weight:700;text-align:center">${p.qty}</td><td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;color:#71717a;text-align:center">${p.threshold}</td></tr>`
        ).join('')
        if (env.OWNER_EMAIL) {
          waitUntil(sendEmail(env, {
            to: env.OWNER_EMAIL,
            subject: `⚠️ Low Stock Alert — ${alertProducts.length} product${alertProducts.length > 1 ? 's' : ''} need restocking`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#09090b;font-family:Inter,Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td style="background:#12121f;border-radius:16px 16px 0 0;padding:24px 32px;border-bottom:1px solid #1e1e2e"><img src="https://prymelabs.net/logo-mark.png" alt="" width="17" height="18" style="vertical-align:middle;margin-right:6px" /><span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.12em;vertical-align:middle">PRYME<span style="color:#3b82f6">LABS</span></span></td></tr><tr><td style="background:#12121f;padding:32px"><p style="color:#f59e0b;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;margin:0 0 8px">Low Stock Alert</p><h2 style="color:#fff;font-size:20px;margin:0 0 20px">Products running low after order ${orderNumber}</h2><table width="100%" cellpadding="0" cellspacing="0"><thead><tr><th style="padding:8px 12px;background:#1a1a2e;color:#71717a;font-size:11px;text-transform:uppercase;text-align:left">Product</th><th style="padding:8px 12px;background:#1a1a2e;color:#71717a;font-size:11px;text-transform:uppercase;text-align:center">Current Qty</th><th style="padding:8px 12px;background:#1a1a2e;color:#71717a;font-size:11px;text-transform:uppercase;text-align:center">Alert Threshold</th></tr></thead><tbody>${alertRows}</tbody></table></td></tr></table></td></tr></table></body></html>`,
          }).catch(() => {}))
        }
        // SMS low stock alert to owner
        waitUntil(sendSMS(env, {
          message: `⚠️ Low Stock after order ${orderNumber}:\n${alertProducts.map(p => `• ${p.name}: ${p.qty} left (alert at ${p.threshold})`).join('\n')}\nRestock soon: https://prymelabs.net/admin`,
        }).catch(() => {}))
      }
    }
  }

  // ── Send emails ────────────────────────────────────────────────────────────
  const paymentHandle = handles[payment_method]
  const emailItems = dbItems.map(i => ({ name: i.name, size: i.size, price: i.price, qty: i.qty, department: i.department }))
  const isSpanish = language === 'es'
  const emailJobs = []

  const emailPricing = {
    subtotal,
    total: order_total,
    promo_code: applied_promo_code,
    discount_amount,
    shipping_cost,
    shipping_rate_name,
    tax_rate,
    tax_amount,
  }

  if (customerEmail) {
    const confirmHtml = isSpanish
      ? customerConfirmationHtmlEs({ order_number: orderNumber, customer_name: customerName, customer_email: customerEmail, items: emailItems, payment_method, payment_handle: paymentHandle, shipping, ...emailPricing })
      : customerConfirmationHtml({ order_number: orderNumber, customer_name: customerName, customer_email: customerEmail, items: emailItems, payment_method, payment_handle: paymentHandle, shipping, ...emailPricing })
    emailJobs.push(sendEmail(env, {
      to: customerEmail,
      subject: isSpanish
        ? `Confirmación de Pedido ${orderNumber} — Pryme Labs`
        : `Order Confirmation ${orderNumber} — Pryme Labs`,
      html: confirmHtml,
    }))
  }

  // Signed one-tap "Confirm Payment" link for the owner (email + SMS)
  const origin = new URL(request.url).origin
  const confirmToken = await hmacHex(`confirm-payment:${orderId}`, env.JWT_SECRET)
  const confirmUrl = `${origin}/api/confirm-payment?order=${orderId}&token=${confirmToken}`

  if (env.OWNER_EMAIL) {
    emailJobs.push(sendEmail(env, {
      to: env.OWNER_EMAIL,
      subject: `🔔 New Order ${orderNumber} — $${order_total.toFixed(2)} via ${payment_method}`,
      html: ownerNotificationHtml({ order_number: orderNumber, customer_name: customerName, customer_email: customerEmail, items: emailItems, payment_method, shipping, confirm_url: confirmUrl, ...emailPricing }),
    }))
  }

  await Promise.allSettled(emailJobs)

  // ── OneDrive backup ────────────────────────────────────────────────────────
  const now = new Date()
  const monthKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` // "2026-06"
  // Numbered folder paths — match physical OneDrive structure
  const orderFolder   = `prymelabs-cc/Store Operations/01 Active Orders/${monthKey}`
  const financeFolder = `prymelabs-cc/Store Operations/08 Finance`
  const csvFilename   = `${monthKey} Ledger.csv`
  const safeName      = customerName.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 40)
  const invoiceFile   = `${orderNumber} - ${safeName}.html`

  const orderDoc = {
    id: orderId, order_number: orderNumber, customer_name: customerName,
    customer_email: customerEmail, items: dbItems, shipping, payment_method,
    status: 'pending', subtotal, discount_amount, shipping_rate_name,
    shipping_cost, tax_rate, tax_amount, order_total,
    promo_code: applied_promo_code, created_at: Math.floor(Date.now() / 1000),
  }

  const isTaxed = tax_amount > 0
  const taxFolder = `prymelabs-cc/Store Operations/12 Compliance/Tax Records/${isTaxed ? 'Taxed Orders' : 'Tax Exempt Orders'}/${monthKey}`

  waitUntil((async () => {
    try {
      // 1. Professional HTML invoice → 01 Active Orders
      await uploadToOneDrive(env, {
        folderPath: orderFolder,
        filename: invoiceFile,
        content: orderReceiptHtml(orderDoc),
      })
      // 2. Tax record → 12 Compliance/Tax Records
      await uploadToOneDrive(env, {
        folderPath: taxFolder,
        filename: invoiceFile,
        content: taxRecordHtml(orderDoc),
      })
      // 3. Append row to monthly CSV ledger → 08 Finance
      const existing = await downloadFromOneDrive(env, { folderPath: financeFolder, filename: csvFilename })
      await uploadToOneDrive(env, {
        folderPath: financeFolder,
        filename: csvFilename,
        content: buildCsv(existing, orderCsvRow(orderDoc)),
        contentType: 'text/csv; charset=utf-8',
      })
    } catch {}
  })().catch(() => {}))

  // Push + SMS — use waitUntil so Cloudflare keeps the Worker alive until these finish
  waitUntil(pushToAll(env, {
    title: `🛒 New Order ${orderNumber}`,
    body: `$${order_total.toFixed(2)} via ${payment_method}`,
    url: '/admin',
  }).catch(() => {}))

  // Owner SMS alert — includes the one-tap confirm link
  waitUntil(sendSMS(env, { message: `🛒 New Order ${orderNumber} — $${order_total.toFixed(2)} via ${payment_method}.\nConfirm payment: ${confirmUrl}` }).catch(() => {}))

  // Customer confirmation SMS (only if they provided a phone number)
  const customerPhone = shipping?.phone?.trim()
  if (customerPhone) {
    const firstName = customerName.split(' ')[0]
    waitUntil(sendSMS(env, {
      to: customerPhone,
      message: isSpanish
        ? `¡Hola ${firstName}! Tu pedido de Pryme Labs ${orderNumber} ha sido realizado ($${order_total.toFixed(2)}). ¡Te avisaremos cuando sea enviado!`
        : `Hi ${firstName}! Your Pryme Labs order ${orderNumber} has been placed ($${order_total.toFixed(2)}). We'll text you when it ships!`,
    }).catch(() => {}))
  }

  return json({
    order_number: orderNumber,
    payment_handle: paymentHandle,
    payment_method,
    subtotal,
    discount_amount,
    shipping_cost,
    shipping_rate_name,
    tax_amount,
    order_total,
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
