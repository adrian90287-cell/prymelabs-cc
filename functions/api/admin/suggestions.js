import { corsHeaders, json } from '../../_utils/cors.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

// GET — fetch all suggestions newest-first
export async function onRequestGet({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  const { results } = await env.DB.prepare(
    'SELECT id, user_id, customer_name, message, is_read, created_at FROM suggestions ORDER BY created_at DESC'
  ).all()

  return json({ suggestions: results || [] })
}

// PUT — toggle is_read on a suggestion
export async function onRequestPut({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { id, is_read } = body
  if (!id) return json({ error: 'id required' }, 400)

  await env.DB.prepare(
    'UPDATE suggestions SET is_read = ? WHERE id = ?'
  ).bind(is_read ? 1 : 0, id).run()

  return json({ ok: true })
}

// DELETE — remove a suggestion
export async function onRequestDelete({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { id } = body
  if (!id) return json({ error: 'id required' }, 400)

  await env.DB.prepare('DELETE FROM suggestions WHERE id = ?').bind(id).run()

  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
