import { verifyPassword } from '../../_utils/crypto.js'
import { signJWT } from '../../_utils/jwt.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, resetRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'

export async function onRequestPost({ request, env }) {
  // Rate-limit by IP — 10 failed attempts per 15 minutes
  const rlKey = rateLimitKey(request, 'login')
  const rl = await checkRateLimit(env, rlKey)
  if (rl.blocked) {
    return json(
      { error: `Too many login attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` },
      429
    )
  }

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { username, password } = body
  if (!username?.trim() || !password) return json({ error: 'Username and password are required' }, 400)

  // Enforce reasonable input lengths to prevent oversized payloads
  if (username.length > 64 || password.length > 256) return json({ error: 'Invalid credentials' }, 400)

  const user = await env.DB.prepare(
    'SELECT id, name, username, email, phone, phone_verified, lang, password_hash, salt, token_version FROM users WHERE username = ?'
  ).bind(username.trim().toLowerCase()).first()

  if (!user) {
    // Increment counter even on unknown username to prevent user enumeration via timing
    return json({ error: 'Invalid username or password' }, 401)
  }

  const valid = await verifyPassword(password, user.password_hash, user.salt)
  if (!valid) {
    return json({ error: 'Invalid username or password' }, 401)
  }

  // Successful login — clear the failed-attempt counter
  await resetRateLimit(env, rlKey)

  const userLang = ['en', 'es'].includes(user.lang) ? user.lang : 'en'

  const token = await signJWT(
    { sub: user.id, username: user.username, name: user.name, email: user.email || '', phone: user.phone || null, lang: userLang, phone_verified: user.phone_verified === 1, tv: user.token_version || 0, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
    env.JWT_SECRET
  )

  return json({ token, user: { id: user.id, name: user.name, username: user.username, email: user.email || '', phone: user.phone || null, lang: userLang, phone_verified: user.phone_verified === 1 } })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
