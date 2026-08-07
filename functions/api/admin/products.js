import { corsHeaders, json } from '../../_utils/cors.js'
import { sendEmail, backInStockHtml, backInStockHtmlEs } from '../../_utils/email.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'
import { ensureProductLaunchColumns, releaseAtFromInput } from '../../_utils/productLaunch.js'

// Top-level storefront departments (home-page tabs). Everything defaults to
// 'Peptides' — see migrate_v22.sql.
const DEPARTMENTS = ['Health & Wellness', 'Beauty & Grooming', 'Apparel & Gear', 'Peptides']

// Normalize a client-provided collections value to a clean JSON-array string.
function normalizeCollections(value) {
  let arr = value
  if (typeof value === 'string') { try { arr = JSON.parse(value) } catch { arr = [] } }
  if (!Array.isArray(arr)) arr = []
  const clean = [...new Set(arr.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean))].slice(0, 40)
  return JSON.stringify(clean)
}

// Normalize product photos to a clean JSON-array string (max 10 images).
function normalizePhotos(value, fallbackUrl) {
  let arr = value
  if (typeof value === 'string' && value.trim().startsWith('[')) { try { arr = JSON.parse(value) } catch { arr = [] } }
  if (!Array.isArray(arr)) arr = fallbackUrl ? [fallbackUrl] : []
  const clean = arr.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).slice(0, 10)
  return JSON.stringify(clean)
}

// Email everyone on a product's back-in-stock waitlist, then mark them notified.
async function notifyRestockWaitlist(env, productId, productName) {
  const { results } = await env.DB.prepare(
    'SELECT id, email FROM stock_notifications WHERE product_id = ? AND notified_at IS NULL'
  ).bind(productId).all()
  if (!results || results.length === 0) return

  const productUrl = 'https://prymelabs.cc/shop'
  const now = Math.floor(Date.now() / 1000)
  for (const row of results) {
    // Spanish if this email belongs to a user who prefers ES
    const u = await env.DB.prepare('SELECT lang FROM users WHERE email = ?').bind(row.email).first()
    const isEs = u?.lang === 'es'
    await sendEmail(env, {
      to: row.email,
      subject: isEs ? `🎉 ¡${productName} está de nuevo disponible!` : `🎉 ${productName} is back in stock!`,
      html: isEs
        ? backInStockHtmlEs({ product_name: productName, product_url: productUrl })
        : backInStockHtml({ product_name: productName, product_url: productUrl }),
    }).catch(() => {})
  }
  await env.DB.prepare('UPDATE stock_notifications SET notified_at = ? WHERE product_id = ? AND notified_at IS NULL')
    .bind(now, productId).run()
}

// Translate description to Spanish using Workers AI
async function translateToSpanish(env, text) {
  if (!text || !env.AI) return null
  try {
    const resp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        {
          role: 'system',
          content: 'You are a professional Spanish translator for a scientific research supply company. Translate the text accurately to Spanish. Keep compound names, abbreviations (GLP-1, BPC, etc.) and scientific terms in their original form. Output only the translation — no explanations, no quotes, no extra text.',
        },
        { role: 'user', content: text },
      ],
      max_tokens: 400,
    })
    return resp?.response?.trim() || null
  } catch {
    return null
  }
}

export async function onRequestGet({ request, env }) {
  const rlKey = adminRateLimitKey(request, 'products:get');
  const rl = await checkAdminRateLimit(env, rlKey);
  if (rl.blocked) return json({ error: 'Rate limited' }, 429);

  const authResult = await verifyAdminToken(request, env)
  if (!authResult.valid) return json({ error: authResult.error }, 401)
  await ensureProductLaunchColumns(env)
  const { results } = await env.DB.prepare(
    'SELECT * FROM products ORDER BY display_order ASC, name ASC'
  ).all()
  return json({ products: results || [] })
}

export async function onRequestPost({ request, env }) {
  const rlKey = adminRateLimitKey(request, 'products:post');
  const rl = await checkAdminRateLimit(env, rlKey);
  if (rl.blocked) return json({ error: 'Rate limited' }, 429);

  const authResult = await verifyAdminToken(request, env)
  if (!authResult.valid) return json({ error: authResult.error }, 401)
  await ensureProductLaunchColumns(env)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { code, name, size, tagline, description, image_url, photos, category, department, collections, display_order, stock_qty, low_stock_threshold, compare_at_price, batch_number, weight_oz, is_draft, release_at } = body
  if (!name || !body.price) return json({ error: 'name and price are required' }, 400)

  const qty = Number(stock_qty) || 0
  const auto_in_stock = qty > 0 ? 1 : 0
  const slug = (code || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const cap = compare_at_price ? Number(compare_at_price) : null
  const dept = DEPARTMENTS.includes(department) ? department : 'Peptides'
  const cols = normalizeCollections(collections)
  const photosJson = normalizePhotos(photos, image_url)
  const primaryImage = (JSON.parse(photosJson)[0]) || image_url || null
  const releaseAt = releaseAtFromInput(release_at)

  // Auto-translate description to Spanish (best-effort, doesn't block save)
  const description_es = description ? await translateToSpanish(env, description) : null

  await env.DB.prepare(
    `INSERT INTO products
       (code, name, size, tagline, description, description_es, compare_at_price,
        image_url, photos_json, category, department, collections, in_stock, display_order, stock_qty, low_stock_threshold, price, batch_number, weight_oz, is_draft, release_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    slug, name, size || null, tagline || null,
    description || null, description_es,
    cap, primaryImage, photosJson,
    category || 'Research Supplies', dept, cols, auto_in_stock,
    display_order || 999, qty, Number(low_stock_threshold) ?? 5,
    Number(body.price), batch_number?.trim() || null, Number(weight_oz) || 0,
    is_draft ? 1 : 0, releaseAt
  ).run()

  return json({ ok: true })
}

export async function onRequestPut({ request, env, waitUntil }) {
  const rlKey = adminRateLimitKey(request, 'products:put');
  const rl = await checkAdminRateLimit(env, rlKey);
  if (rl.blocked) return json({ error: 'Rate limited' }, 429);

  const authResult = await verifyAdminToken(request, env)
  if (!authResult.valid) return json({ error: authResult.error }, 401)
  await ensureProductLaunchColumns(env)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { id, code, name, size, tagline, description, image_url, photos, category, department, collections, display_order, stock_qty, low_stock_threshold, compare_at_price, batch_number, weight_oz, is_draft, release_at } = body
  if (!id) return json({ error: 'id required' }, 400)

  const qty = Number(stock_qty) || 0
  const auto_in_stock = qty > 0 ? 1 : 0
  const cap = compare_at_price ? Number(compare_at_price) : null
  const dept = DEPARTMENTS.includes(department) ? department : 'Peptides'
  const cols = normalizeCollections(collections)
  const photosJson = normalizePhotos(photos, image_url)
  const primaryImage = (JSON.parse(photosJson)[0]) || image_url || null
  const releaseAt = releaseAtFromInput(release_at)

  // Was this product out of stock before the edit? (to detect a restock)
  const prev = await env.DB.prepare('SELECT in_stock FROM products WHERE id = ?').bind(id).first()
  const wasOutOfStock = prev && !prev.in_stock

  // Only re-translate if description has changed (detect by checking if description_es was explicitly provided)
  let description_es = body.description_es !== undefined ? body.description_es : undefined
  if (description && description_es === undefined) {
    description_es = await translateToSpanish(env, description)
  }

  await env.DB.prepare(
    `UPDATE products
     SET code=?, name=?, size=?, tagline=?, description=?, description_es=?,
         compare_at_price=?, image_url=?, photos_json=?, category=?, department=?, collections=?, in_stock=?,
         display_order=?, stock_qty=?, low_stock_threshold=?, price=?, batch_number=?, weight_oz=?, is_draft=?, release_at=?
     WHERE id=?`
  ).bind(
    code, name, size || null, tagline || null,
    description || null, description_es ?? null,
    cap, primaryImage, photosJson, category, dept, cols, auto_in_stock,
    display_order || 999, qty, Number(low_stock_threshold) ?? 5,
    Number(body.price), batch_number?.trim() || null, Number(weight_oz) || 0,
    is_draft ? 1 : 0, releaseAt, id
  ).run()

  // Restocked: out of stock → in stock. Notify the waitlist in the background.
  if (wasOutOfStock && auto_in_stock) {
    waitUntil(notifyRestockWaitlist(env, Number(id), name).catch(() => {}))
  }

  return json({ ok: true })
}

export async function onRequestDelete({ request, env }) {
  const rlKey = adminRateLimitKey(request, 'products:delete');
  const rl = await checkAdminRateLimit(env, rlKey);
  if (rl.blocked) return json({ error: 'Rate limited' }, 429);

  const authResult = await verifyAdminToken(request, env)
  if (!authResult.valid) return json({ error: authResult.error }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const { id } = body
  if (!id) return json({ error: 'id required' }, 400)
  await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
