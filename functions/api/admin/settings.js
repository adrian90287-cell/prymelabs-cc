import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'

export async function onRequestGet({ request, env }) {
  const rlKey = adminRateLimitKey(request, 'settings:get');
  const rl = await checkAdminRateLimit(env, rlKey);
  if (rl.blocked) return json({ error: 'Rate limited' }, 429);

  const authResult = await verifyAdminToken(request, env)
  if (!authResult.valid) return json({ error: 'Unauthorized' }, 401)
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all()
  const settings = {}
  for (const r of (results || [])) {
    if (r.key === 'onedrive_refresh_token') continue // never expose token
    settings[r.key] = r.value
  }
  // Expose connection status as boolean
  const tokenRow = (results || []).find(r => r.key === 'onedrive_refresh_token')
  settings.onedrive_connected = !!(tokenRow?.value)
  return json({ settings })
}

export async function onRequestPut({ request, env }) {
  const rlKey = adminRateLimitKey(request, 'settings:put');
  const rl = await checkAdminRateLimit(env, rlKey);
  if (rl.blocked) return json({ error: 'Rate limited' }, 429);

  const authResult = await verifyAdminToken(request, env)
  if (!authResult.valid) return json({ error: 'Unauthorized' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { updates } = body
  if (!updates || typeof updates !== 'object') return json({ error: 'updates object required' }, 400)

  const stmts = Object.entries(updates).map(([k, v]) =>
    env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, String(v))
  )
  if (stmts.length > 0) await env.DB.batch(stmts)
  return json({ success: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
