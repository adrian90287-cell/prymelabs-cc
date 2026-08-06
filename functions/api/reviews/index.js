import { verifyJWT } from '../../_utils/jwt.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import { isContentAuthed } from '../../_utils/contentAuth.js'

// GET /api/reviews?product_id=123 — approved reviews + aggregate (gated)
export async function onRequestGet({ request, env }) {
  if (!(await isContentAuthed(request, env))) return json({ error: 'Unauthorized' }, 401)
  const url = new URL(request.url)
  const productId = Number(url.searchParams.get('product_id'))
  if (!productId) return json({ error: 'product_id required' }, 400)

  const { results } = await env.DB.prepare(
    "SELECT customer_name, rating, comment, created_at FROM reviews WHERE product_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 50"
  ).bind(productId).all()

  const reviews = results || []
  const count = reviews.length
  const avg = count ? Number((reviews.reduce((s, r) => s + r.rating, 0) / count).toFixed(1)) : 0
  return json({ reviews, count, average: avg })
}

// POST /api/reviews — submit a review (must have purchased the product)
export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const payload = await verifyJWT(auth.slice(7), env)
  if (!payload) return json({ error: 'Invalid token' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const productId = Number(body.product_id)
  const rating = Math.round(Number(body.rating))
  const comment = String(body.comment || '').trim().slice(0, 1000)
  if (!productId) return json({ error: 'product_id required' }, 400)
  if (!(rating >= 1 && rating <= 5)) return json({ error: 'Rating must be 1–5' }, 400)

  // Must have a delivered/completed order containing this product
  const { results: orders } = await env.DB.prepare(
    "SELECT id, items_json FROM orders WHERE user_id = ? AND deleted_at IS NULL AND status IN ('shipped','completed')"
  ).bind(payload.sub).all()
  let purchasedOrderId = null
  for (const o of orders || []) {
    try {
      if (JSON.parse(o.items_json || '[]').some(i => Number(i.product_id) === productId)) { purchasedOrderId = o.id; break }
    } catch { /* ignore */ }
  }
  if (!purchasedOrderId) return json({ error: 'You can only review products from a delivered order.' }, 403)

  // One review per product per customer
  const existing = await env.DB.prepare('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?').bind(productId, payload.sub).first()
  if (existing) {
    await env.DB.prepare("UPDATE reviews SET rating = ?, comment = ?, status = 'pending', created_at = unixepoch() WHERE id = ?")
      .bind(rating, comment, existing.id).run()
    return json({ ok: true, updated: true })
  }

  await env.DB.prepare(
    "INSERT INTO reviews (product_id, order_id, user_id, customer_name, rating, comment, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')"
  ).bind(productId, purchasedOrderId, payload.sub, payload.name || 'Customer', rating, comment).run()

  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
