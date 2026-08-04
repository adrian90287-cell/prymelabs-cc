import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import { hmacHex, hashPassword, generateToken } from '../../_utils/crypto.js'
import {
  sendEmail,
  sendSMS,
  willCallInvoiceHtml,
  willCallInvoiceHtmlEs,
  ownerNotificationHtml,
} from '../../_utils/email.js'
import { pushToAll } from '../../_utils/webpush.js'
import { uploadToOneDrive, downloadFromOneDrive } from '../../_utils/onedrive.js'
import { orderReceiptHtml, taxRecordHtml, orderCsvRow, buildCsv } from '../../_utils/documents.js'
import { resolveSaleConfig, saleAmountForDept } from '../../_utils/sale.js'


// Find the user account tied to this email, or create a lightweight, claimable
// one so the order (user_id is NOT NULL) is properly attributed. A created
// account has a random password the customer can reset later via forgot-password.
async function findOrCreateUser(env, { email, name, phone, lang }) {
  const clean = email.trim().toLowerCase()
  const existing = await env.DB.prepare('SELECT id, lang, phone FROM users WHERE email = ?').bind(clean).first()
  if (existing) {
    // Backfill a phone number if we now have one and the account lacked it
    if (phone && !existing.phone) {
      await env.DB.prepare('UPDATE users SET phone = ? WHERE id = ?').bind(phone, existing.id).run()
    }
    return { id: existing.id, lang: existing.lang || 'en' }
  }

  // Build a unique username from the email local part + random suffix
  const base = clean.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'customer'
  let username = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${base}_${generateToken(4)}`.slice(0, 32)
    const taken = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(candidate).first()
    if (!taken) { username = candidate; break }
  }
  if (!username) username = `wc_${generateToken(10)}`.slice(0, 32)

  const { hash, salt } = await hashPassword(generateToken(24))
  const res = await env.DB.prepare(
    'INSERT INTO users (name, username, email, password_hash, salt, phone, lang) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(name.trim().slice(0, 128), username, clean, hash, salt, phone || null, lang || 'en').run()
  return { id: res.meta.last_row_id, lang: lang || 'en' }
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const {
    customer_name,
    customer_email,
    customer_phone,
    items,
    payment_method,
    tax_exempt,
    notes,
    language,
    promo_code,
  } = body

  // ── Validate ────────────────────────────────────────────────────────────────
  if (!customer_name?.trim()) return json({ error: 'Customer name is required' }, 400)
  if (!customer_email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email.trim())) {
    return json({ error: 'A valid customer email is required' }, 400)
  }
  if (!Array.isArray(items) || items.length === 0) return json({ error: 'Add at least one item' }, 400)
  if (items.length > 50) return json({ error: 'Too many items' }, 400)
  if (!['zelle', 'cashapp', 'venmo'].includes(payment_method)) return json({ error: 'Invalid payment method' }, 400)

  const reqItems = []
  for (const item of items) {
    if (!item.product_id) return json({ error: 'Each item must reference a product' }, 400)
    const qty = Math.floor(Number(item.qty))
    if (!qty || qty < 1 || qty > 100) return json({ error: 'Invalid item quantity' }, 400)
    reqItems.push({ product_id: item.product_id, size: item.size, qty })
  }

  // ── Authoritative product lookup (never trust client prices) ────────────────
  const ids = [...new Set(reqItems.map(i => i.product_id))]
  const placeholders = ids.map(() => '?').join(',')
  const { results: prodRows } = await env.DB.prepare(
    `SELECT id, name, price, stock_qty, in_stock, weight_oz, bundle_of_product_id, bundle_qty, no_discount , department FROM products WHERE id IN (${placeholders})`
  ).bind(...ids).all()
  const prodMap = new Map((prodRows || []).map(p => [p.id, p]))

  // A case draws stock from its parent single — load parents too
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

  // ── Pricing knobs — mirror the storefront so charged price == displayed price
  const { results: priceCfgRows } = await env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('sale_config','sale_mode_enabled','sale_discount_amount','sale_departments','master_price_adjust')"
  ).all()
  const priceCfg = {}
  for (const r of (priceCfgRows || [])) priceCfg[r.key] = r.value
  const masterAdjust = Number(priceCfg.master_price_adjust) || 0
  const saleConfig = resolveSaleConfig(priceCfg)

  const effectivePrice = (rawPrice, noDiscount, department) => {
    if (noDiscount) return Math.max(0.01, Number(rawPrice))
    let price = Math.max(0.01, Number(rawPrice) + masterAdjust)
    const saleAmt = saleAmountForDept(saleConfig, department)
    if (saleAmt > 0) price = Math.max(0.01, price - saleAmt)
    return Number(price.toFixed(2))
  }

  const dbItems = []
  const reservationPlan = []
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
      name: product.name,
      size: String(item.size || '').slice(0, 100),
      price: effectivePrice(product.price, noDiscountFlag, product.department),
      qty: item.qty,
      weight_oz: Number(product.weight_oz) || 0,
      no_discount: noDiscountFlag,
      department: product.department || 'Peptides',
    })
    reservationPlan.push({ product_id: stockOwner.id, qty: unitsNeeded, name: product.name })
  }

  const subtotal = Number(dbItems.reduce((sum, i) => sum + i.price * i.qty, 0).toFixed(2))
  // Only non-case items are eligible for a promo discount (mirrors /api/orders)
  const discountableSubtotal = Number(dbItems.reduce((sum, i) => sum + (i.no_discount ? 0 : i.price * i.qty), 0).toFixed(2))

  const handles = {
    zelle: env.ZELLE_HANDLE ?? 'Contact us for payment info',
    cashapp: env.CASHAPP_HANDLE ?? 'Contact us for payment info',
    venmo: env.VENMO_HANDLE ?? 'Contact us for payment info',
  }
  const paymentHandle = handles[payment_method]

  const customerName = customer_name.trim().slice(0, 128)
  const customerEmail = customer_email.trim().toLowerCase()
  const customerPhone = (customer_phone || '').trim().slice(0, 20) || null
  const langPref = language === 'es' ? 'es' : 'en'

  // ── Resolve the customer account (needed for orders.user_id NOT NULL) ───────
  let user
  try {
    user = await findOrCreateUser(env, { email: customerEmail, name: customerName, phone: customerPhone, lang: langPref })
  } catch {
    return json({ error: 'Could not resolve customer account' }, 500)
  }
  const isSpanish = (language ? langPref : user.lang) === 'es'

  // ── Resolve promo code — authoritative server-side (mirrors /api/orders) ────
  // The admin form auto-fills the active advertised code and lets the admin type
  // one manually; either way we re-validate here and never trust a client price.
  const resolvePromo = async (code) => {
    if (!code || typeof code !== 'string') return null
    const promo = await env.DB.prepare(
      'SELECT * FROM promo_codes WHERE code = ? AND is_active = 1'
    ).bind(code.toUpperCase().trim().slice(0, 64)).first()
    if (!promo) return null
    const now = Math.floor(Date.now() / 1000)
    if (promo.expires_at && promo.expires_at < now) return null
    if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) return null
    if (promo.min_order_amount > 0 && discountableSubtotal < promo.min_order_amount) return null
    if (promo.one_use_per_user) {
      const prior = await env.DB.prepare(
        'SELECT COUNT(*) AS cnt FROM orders WHERE user_id = ? AND promo_code IS NOT NULL'
      ).bind(user.id).first()
      // Match the exact code among comma-separated applied codes on prior orders
      if (prior?.cnt > 0) {
        const { results } = await env.DB.prepare(
          'SELECT promo_code FROM orders WHERE user_id = ? AND promo_code IS NOT NULL'
        ).bind(user.id).all()
        const target = promo.code.toUpperCase()
        const used = (results || []).some(r =>
          String(r.promo_code || '').split(',').map(s => s.trim().toUpperCase()).includes(target))
        if (used) return null
      }
    }
    return promo
  }

  const resolvedPromo = await resolvePromo(promo_code)
  let discount_amount = 0
  let promo_no_tax = false
  let applied_promo_code = null
  if (resolvedPromo) {
    const d = resolvedPromo.discount_type === 'percent'
      ? Number((discountableSubtotal * resolvedPromo.discount_value / 100).toFixed(2))
      : Number(Math.min(discountableSubtotal, resolvedPromo.discount_value).toFixed(2))
    discount_amount = Math.max(0, Math.min(discountableSubtotal, d))
    if (resolvedPromo.no_tax) promo_no_tax = true
    applied_promo_code = resolvedPromo.code
  }

  // ── Tax — will-call has no shipping; tax the discounted subtotal unless the
  // order is marked exempt or the promo waives tax ───────────────────────────
  const taxRateRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'tax_rate'").first()
  const tax_rate = (tax_exempt || promo_no_tax) ? 0 : (Number(taxRateRow?.value) || 0)
  const taxable = Number((subtotal - discount_amount).toFixed(2))
  const tax_amount = Number((taxable * tax_rate).toFixed(2))
  const order_total = Number((taxable + tax_amount).toFixed(2))

  // ── Atomically reserve stock BEFORE creating the order ──────────────────────
  const reserved = []
  for (const i of reservationPlan) {
    const r = await env.DB.prepare(
      `UPDATE products
         SET stock_qty = stock_qty - ?,
             in_stock  = CASE WHEN stock_qty - ? <= 0 THEN 0 ELSE in_stock END
       WHERE id = ? AND stock_qty >= ?`
    ).bind(i.qty, i.qty, i.product_id, i.qty).run()

    if (r.meta.changes > 0) { reserved.push(i); continue }

    const p = await env.DB.prepare('SELECT name, stock_qty, in_stock FROM products WHERE id = ?').bind(i.product_id).first()
    const unlimited = p && p.stock_qty === 0 && p.in_stock === 1
    if (!unlimited) {
      for (const d of reserved) {
        await env.DB.prepare('UPDATE products SET stock_qty = stock_qty + ?, in_stock = 1 WHERE id = ?').bind(d.qty, d.product_id).run()
      }
      return json({ error: `${i.name || 'An item'} just sold out — adjust the order and try again.` }, 409)
    }
  }

  // ── Insert order — pickup, no shipping ──────────────────────────────────────
  const shippingDoc = { pickup: true, method: 'will_call', phone: customerPhone || undefined }
  const insertResult = await env.DB.prepare(
    `INSERT INTO orders (
      order_number, user_id, customer_name, customer_email,
      items_json, shipping_json, subtotal, payment_method,
      promo_code, discount_amount, shipping_rate_name, shipping_cost,
      tax_rate, tax_amount, order_total, local_delivery, notes
    ) VALUES ('TEMP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.id, customerName, customerEmail,
    JSON.stringify(dbItems), JSON.stringify(shippingDoc), subtotal, payment_method,
    applied_promo_code, discount_amount, 'Will Call — Pickup', 0,
    tax_rate, tax_amount, order_total, 0, (notes || '').slice(0, 1000)
  ).run()

  const orderId = insertResult.meta.last_row_id
  // Will Call orders carry a distinct "-WC-" identifier in the order number so
  // they're recognizable everywhere it appears — emails, admin, documents, CSV.
  const orderNumber = `PL-WC-${String(orderId).padStart(5, '0')}`
  await env.DB.prepare('UPDATE orders SET order_number = ? WHERE id = ?').bind(orderNumber, orderId).run()

  // Count the promo usage only after the order is committed
  if (resolvedPromo) {
    await env.DB.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').bind(resolvedPromo.id).run()
  }

  // ── Send the invoice email to the customer ──────────────────────────────────
  const emailItems = dbItems.map(i => ({ name: i.name, size: i.size, price: i.price, qty: i.qty, department: i.department }))
  const invoiceArgs = {
    order_number: orderNumber,
    customer_name: customerName,
    items: emailItems,
    subtotal,
    total: order_total,
    promo_code: applied_promo_code,
    discount_amount,
    tax_rate,
    tax_amount,
    payment_method,
    payment_handle: paymentHandle,
  }
  const emailResult = await sendEmail(env, {
    to: customerEmail,
    subject: isSpanish
      ? `Factura Will Call ${orderNumber} — Pryme Labs`
      : `Will Call Invoice ${orderNumber} — Pryme Labs`,
    html: isSpanish ? willCallInvoiceHtmlEs(invoiceArgs) : willCallInvoiceHtml(invoiceArgs),
  })

  // Signed one-tap "Confirm Payment" link for the owner (email + SMS)
  const origin = new URL(request.url).origin
  const confirmToken = await hmacHex(`confirm-payment:${orderId}`, env.JWT_SECRET)
  const confirmUrl = `${origin}/api/confirm-payment?order=${orderId}&token=${confirmToken}`

  // Owner notification email
  if (env.OWNER_EMAIL) {
    waitUntil(sendEmail(env, {
      to: env.OWNER_EMAIL,
      subject: `🏷️ New Will Call Order ${orderNumber} — $${order_total.toFixed(2)} via ${payment_method}`,
      html: ownerNotificationHtml({
        order_number: orderNumber, customer_name: customerName, customer_email: customerEmail,
        items: emailItems, payment_method, shipping: null, confirm_url: confirmUrl,
        subtotal, total: order_total, promo_code: applied_promo_code, discount_amount,
        shipping_cost: 0, shipping_rate_name: 'Will Call — Pickup', tax_rate, tax_amount,
      }),
    }).catch(() => {}))
  }

  // ── OneDrive backup — mirror the storefront order flow, but file Will Call
  // invoices and tax records into a dedicated "Will Call" subfolder so they're
  // organized separately. The monthly finance ledger stays unified (Will Call
  // rows are still identifiable by the PL-WC- order number).
  const now = new Date()
  const monthKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const orderFolder   = `prymelabs-cc/Store Operations/01 Active Orders/${monthKey}/Will Call`
  const financeFolder = `prymelabs-cc/Store Operations/08 Finance`
  const csvFilename   = `${monthKey} Ledger.csv`
  const safeName      = customerName.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 40)
  const invoiceFile   = `${orderNumber} - ${safeName}.html`

  const orderDoc = {
    id: orderId, order_number: orderNumber, customer_name: customerName,
    customer_email: customerEmail, items: dbItems, shipping: shippingDoc, payment_method,
    status: 'pending', subtotal, discount_amount, shipping_rate_name: 'Will Call — Pickup',
    shipping_cost: 0, tax_rate, tax_amount, order_total,
    promo_code: applied_promo_code, created_at: Math.floor(Date.now() / 1000),
  }
  const isTaxed = tax_amount > 0
  const taxFolder = `prymelabs-cc/Store Operations/12 Compliance/Tax Records/${isTaxed ? 'Taxed Orders' : 'Tax Exempt Orders'}/${monthKey}/Will Call`

  waitUntil((async () => {
    try {
      await uploadToOneDrive(env, { folderPath: orderFolder, filename: invoiceFile, content: orderReceiptHtml(orderDoc) })
      await uploadToOneDrive(env, { folderPath: taxFolder, filename: invoiceFile, content: taxRecordHtml(orderDoc) })
      const existing = await downloadFromOneDrive(env, { folderPath: financeFolder, filename: csvFilename })
      await uploadToOneDrive(env, {
        folderPath: financeFolder, filename: csvFilename,
        content: buildCsv(existing, orderCsvRow(orderDoc)),
        contentType: 'text/csv; charset=utf-8',
      })
    } catch {}
  })().catch(() => {}))

  // Push + owner SMS
  waitUntil(pushToAll(env, {
    title: `🏷️ New Will Call ${orderNumber}`,
    body: `$${order_total.toFixed(2)} via ${payment_method}`,
    url: '/admin',
  }).catch(() => {}))
  waitUntil(sendSMS(env, { message: `🏷️ New Will Call Order ${orderNumber} — $${order_total.toFixed(2)} via ${payment_method}.\nConfirm payment: ${confirmUrl}` }).catch(() => {}))

  return json({
    order_number: orderNumber,
    payment_handle: paymentHandle,
    payment_method,
    subtotal,
    promo_code: applied_promo_code,
    discount_amount,
    tax_amount,
    order_total,
    // Signal when a code was sent but didn't qualify, so the UI can warn
    promo_rejected: !!promo_code && !applied_promo_code,
    emailed: !emailResult?.skipped && !emailResult?.error,
    email_error: emailResult?.error || null,
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
