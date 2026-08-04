import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'

// Public endpoint: a customer asks to be emailed when an out-of-stock product
// is restocked. Stored in stock_notifications; the admin product-update path
// fires the emails when stock returns.
export async function onRequestPost({ request, env }) {
  // Rate-limit by IP to prevent signup spam / product-ID enumeration
  const rl = await checkRateLimit(env, rateLimitKey(request, 'restock'))
  if (rl.blocked) return json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const product_id = Number(body.product_id)
  const email = String(body.email || '').trim().toLowerCase()
  if (!product_id) return json({ error: 'product_id required' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Valid email required' }, 400)

  const product = await env.DB.prepare('SELECT id, name, in_stock FROM products WHERE id = ?').bind(product_id).first()
  if (!product) return json({ error: 'Product not found' }, 404)
  if (product.in_stock) return json({ error: 'This product is already in stock.' }, 400)

  // Avoid duplicate pending signups for the same email + product
  const existing = await env.DB.prepare(
    'SELECT id FROM stock_notifications WHERE product_id = ? AND email = ? AND notified_at IS NULL'
  ).bind(product_id, email).first()
  if (!existing) {
    await env.DB.prepare(
      'INSERT INTO stock_notifications (product_id, email) VALUES (?, ?)'
    ).bind(product_id, email).run()
  }

  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
