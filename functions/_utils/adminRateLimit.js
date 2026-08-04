// Admin operation rate limiting - stricter than public API

const ADMIN_MAX_ATTEMPTS = 50      // 50 requests per window
const ADMIN_WINDOW_SECONDS = 60    // 1-minute window (aggressive)

export async function checkAdminRateLimit(env, key) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare(
      'SELECT attempts, window_start FROM rate_limits WHERE key = ?'
    ).bind(key).first();

    if (row) {
      const windowExpired = now - row.window_start > ADMIN_WINDOW_SECONDS;
      if (windowExpired) {
        // Old window — reset counter
        await env.DB.prepare(
          'UPDATE rate_limits SET attempts = 1, window_start = ? WHERE key = ?'
        ).bind(now, key).run();
      } else if (row.attempts >= ADMIN_MAX_ATTEMPTS) {
        const retryAfter = ADMIN_WINDOW_SECONDS - (now - row.window_start);
        return { blocked: true, retryAfter };
      } else {
        await env.DB.prepare(
          'UPDATE rate_limits SET attempts = attempts + 1 WHERE key = ?'
        ).bind(key).run();
      }
    } else {
      await env.DB.prepare(
        'INSERT INTO rate_limits (key, attempts, window_start) VALUES (?, 1, ?)'
      ).bind(key, now).run();
    }
    return { blocked: false };
  } catch {
    // Table doesn't exist yet or DB error — fail open
    return { blocked: false };
  }
}

export function adminRateLimitKey(request, operation) {
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0].trim()
    || 'unknown';
  return `admin:${operation}:${ip}`;
}
