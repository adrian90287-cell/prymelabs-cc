import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'


// POST — store a push subscription
export async function onRequestPost({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { subscription } = body
  if (!subscription?.endpoint) return json({ error: 'Invalid subscription' }, 400)

  const subJson = JSON.stringify(subscription)
  await env.DB.prepare(`
    INSERT INTO push_subscriptions (endpoint, subscription_json)
    VALUES (?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET subscription_json = excluded.subscription_json
  `).bind(subscription.endpoint, subJson).run()

  return json({ ok: true })
}

// DELETE — remove a push subscription
export async function onRequestDelete({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const endpoint = body?.endpoint
  if (!endpoint) return json({ error: 'endpoint required' }, 400)

  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run()
  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
