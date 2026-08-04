import { verifyJWT } from '../../_utils/jwt.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'

export async function onRequestPost({ request, env }) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const payload = await verifyJWT(authHeader.slice(7), env.JWT_SECRET)
  if (!payload) return json({ error: 'Invalid or expired token' }, 401)

  // Rate-limit promo lookups to prevent brute-forcing codes
  const rl = await checkRateLimit(env, rateLimitKey(request, 'promo'))
  if (rl.blocked) return json({ error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { code, subtotal } = body
  if (!code) return json({ error: 'Code required' }, 400)

  const promo = await env.DB.prepare(
    'SELECT * FROM promo_codes WHERE code = ? AND is_active = 1'
  ).bind(code.toUpperCase().trim()).first()

  if (!promo) return json({ error: 'Invalid or inactive promo code' }, 404)

  const now = Math.floor(Date.now() / 1000)
  if (promo.expires_at && promo.expires_at < now) return json({ error: 'This code has expired' }, 400)
  if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) {
    return json({ error: 'This code has reached its usage limit' }, 400)
  }
  if (promo.min_order_amount > 0 && Number(subtotal) < promo.min_order_amount) {
    return json({ error: `Minimum order of $${Number(promo.min_order_amount).toFixed(2)} required` }, 400)
  }

  // One-time-per-user enforcement
  if (promo.one_use_per_user) {
    const prior = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM orders WHERE user_id = ? AND promo_code = ?'
    ).bind(payload.sub, promo.code).first()
    if (prior?.cnt > 0) {
      return json({ error: 'This code has already been used on your account' }, 400)
    }
  }

  const sub = Number(subtotal) || 0
  const discount_amount = promo.discount_type === 'percent'
    ? Number((sub * promo.discount_value / 100).toFixed(2))
    : Number(Math.min(sub, promo.discount_value).toFixed(2))

  return json({
    valid: true,
    code: promo.code,
    type: promo.type,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    discount_amount,
    no_tax: promo.no_tax === 1,
    free_shipping: promo.free_shipping === 1,
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
