/**
 * Simple IP-based rate limiter backed by D1.
 * Requires the `rate_limits` table (see migrate_v3.sql).
 * Fails open gracefully if the table doesn't exist yet.
 */

const MAX_ATTEMPTS = 10      // max failures per window
const WINDOW_SECONDS = 900  // 15-minute sliding window

/**
 * Check and increment the attempt counter for a given key.
 * Returns { blocked: true, retryAfter: <seconds> } if limit exceeded,
 * or { blocked: false } if the request should proceed.
 */
export async function checkRateLimit(env, key) {
  try {
    const now = Math.floor(Date.now() / 1000)
    const row = await env.DB.prepare(
      'SELECT attempts, window_start FROM rate_limits WHERE key = ?'
    ).bind(key).first()

    if (row) {
      const windowExpired = now - row.window_start > WINDOW_SECONDS
      if (windowExpired) {
        // Old window — reset counter
        await env.DB.prepare(
          'UPDATE rate_limits SET attempts = 1, window_start = ? WHERE key = ?'
        ).bind(now, key).run()
      } else if (row.attempts >= MAX_ATTEMPTS) {
        const retryAfter = WINDOW_SECONDS - (now - row.window_start)
        return { blocked: true, retryAfter }
      } else {
        await env.DB.prepare(
          'UPDATE rate_limits SET attempts = attempts + 1 WHERE key = ?'
        ).bind(key).run()
      }
    } else {
      await env.DB.prepare(
        'INSERT INTO rate_limits (key, attempts, window_start) VALUES (?, 1, ?)'
      ).bind(key, now).run()
    }
    return { blocked: false }
  } catch {
    // Table doesn't exist yet or DB error — fail open to avoid lockout
    return { blocked: false }
  }
}

/**
 * Reset the attempt counter after a successful login.
 */
export async function resetRateLimit(env, key) {
  try {
    await env.DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run()
  } catch {}
}

/**
 * Build a rate-limit key from the incoming request.
 * Uses CF-Connecting-IP (set by Cloudflare) as the primary identifier.
 */
export function rateLimitKey(request, prefix) {
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0].trim()
    || 'unknown'
  return `${prefix}:${ip}`
}
