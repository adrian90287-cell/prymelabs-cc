// Accepts EITHER the legacy plaintext-password scheme (Bearer admin:<ADMIN_PASSWORD>)
// or a valid JWT issued by /api/admin/session (Bearer <jwt>), verified via adminAuth.js.
// This lets older endpoints keep working during the migration to JWT-only auth
// without depending on the client keeping two separate credentials in sync.
import { verifyAdminToken } from './adminAuth.js';
import { constantTimeCompare } from './constantTime.js';
import { checkAdminRateLimit, adminRateLimitKey } from './adminRateLimit.js';
import { hasAdminPermission, inferAdminPermission } from './adminPermissions.js';
import { logAdminAudit } from './adminAudit.js';

export async function adminAuth(request, env) {
  // A valid JWT (the common case for an already-logged-in admin) never touches
  // the rate limiter below — only requests that fall back to the legacy
  // password scheme do, so normal admin usage is never throttled.
  const result = await verifyAdminToken(request, env);
  if (result.valid) return true;
  if (result.status === 403) return false;

  // Below this point we're either brute-forcing the legacy password or
  // legitimately using it — throttle per-IP before even comparing, since
  // this helper is shared by every endpoint that still accepts it and
  // previously had no rate limiting of its own.
  const rl = await checkAdminRateLimit(env, adminRateLimitKey(request, 'legacy-auth'));
  if (rl.blocked) return false;

  if (!env.ADMIN_PASSWORD) return false; // fail closed if unset, not "admin:undefined"
  const auth = request.headers.get('Authorization') || '';
  if (constantTimeCompare(auth, `Bearer admin:${env.ADMIN_PASSWORD}`)) {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
      logAdminAudit(env, request, { role: 'owner', owner: true, username: 'legacy-owner' }, 'admin_api.mutate', {
        target_type: 'route',
        target_id: new URL(request.url).pathname,
        metadata: { method: request.method, legacy: true },
      }).catch(() => {});
    }
    return true;
  }
  return false;
}

export async function adminAuthResult(request, env) {
  const result = await verifyAdminToken(request, env);
  if (result.valid) return result;

  const rl = await checkAdminRateLimit(env, adminRateLimitKey(request, 'legacy-auth'));
  if (rl.blocked) return { valid: false, error: 'Unauthorized', status: 401 };

  const auth = request.headers.get('Authorization') || '';
  if (env.ADMIN_PASSWORD && constantTimeCompare(auth, `Bearer admin:${env.ADMIN_PASSWORD}`)) {
    const payload = { admin: true, owner: true, role: 'owner', permissions: ['*'] };
    const required = inferAdminPermission(request);
    if (required && !hasAdminPermission(payload, required)) return { valid: false, error: 'Forbidden', status: 403 };
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
      logAdminAudit(env, request, payload, 'admin_api.mutate', {
        target_type: 'route',
        target_id: new URL(request.url).pathname,
        metadata: { method: request.method, permission: required || null, legacy: true },
      }).catch(() => {});
    }
    return { valid: true, payload };
  }
  return { valid: false, error: 'Unauthorized', status: 401 };
}
