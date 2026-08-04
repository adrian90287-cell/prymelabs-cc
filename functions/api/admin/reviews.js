import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'


// GET — all reviews with product names (newest first), for moderation
export async function onRequestGet({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.product_id, r.customer_name, r.rating, r.comment, r.status, r.created_at,
            p.name AS product_name
     FROM reviews r LEFT JOIN products p ON p.id = r.product_id
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC`
  ).all()
  return json({ reviews: results || [] })
}

// PUT { id, status } — approve / reject
export async function onRequestPut({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const { id, status } = body
  if (!id || !['pending', 'approved', 'rejected'].includes(status)) return json({ error: 'id and valid status required' }, 400)
  await env.DB.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind(status, id).run()
  return json({ ok: true })
}

// DELETE { id }
export async function onRequestDelete({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body.id) return json({ error: 'id required' }, 400)
  await env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(body.id).run()
  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
