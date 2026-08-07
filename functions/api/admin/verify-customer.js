import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'
import { normalizePhone } from '../../_utils/phoneVerification.js'
import { logAdminAudit } from '../../_utils/adminAudit.js'

async function ensurePhoneSecurityColumns(env) {
  for (const stmt of [
    'ALTER TABLE users ADD COLUMN phone_norm TEXT',
    'ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0',
  ]) {
    try { await env.DB.prepare(stmt).run() } catch {}
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  const rl = await checkAdminRateLimit(env, adminRateLimitKey(request, 'verify-customer'))
  if (rl.blocked) return json({ error: 'Rate limited' }, 429)
  const auth = await verifyAdminToken(request, env)
  if (!auth.valid) return json({ error: auth.error || 'Unauthorized' }, auth.status || 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const id = Number(body.id || 0)
  const verified = body.verified === true || body.verified === 1
  if (!id) return json({ error: 'Customer id required' }, 400)

  await ensurePhoneSecurityColumns(env)
  const user = await env.DB.prepare('SELECT id, phone FROM users WHERE id = ?').bind(id).first()
  if (!user) return json({ error: 'Customer not found' }, 404)
  const phoneNorm = user.phone ? normalizePhone(user.phone) : null
  if (verified && !phoneNorm) return json({ error: 'Customer needs a valid phone before verification' }, 400)

  await env.DB.prepare('UPDATE users SET phone_verified = ?, phone_norm = ? WHERE id = ?')
    .bind(verified ? 1 : 0, verified ? phoneNorm : null, id).run()

  waitUntil(logAdminAudit(env, request, auth.payload, verified ? 'customer.phone_verified' : 'customer.phone_unverified', {
    target_type: 'user',
    target_id: id,
  }))

  return json({ ok: true, id, phone_verified: verified })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
