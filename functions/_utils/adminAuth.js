// Admin authentication helper - validates JWT tokens
import { constantTimeCompare } from './constantTime.js';
import { hasAdminPermission, inferAdminPermission } from './adminPermissions.js';

// Cloudflare Pages Functions run on the Workers runtime, which has no
// Node.js Buffer global (no nodejs_compat flag set) — must use Web Crypto
// + btoa, matching the signing side in functions/api/admin/session.js.
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');

  const msg = parts[0] + '.' + parts[1];
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const expectedSig = base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));

  // Use constant-time comparison to prevent timing attacks
  if (!constantTimeCompare(expectedSig, parts[2])) throw new Error('Invalid signature');

  const payload = JSON.parse(new TextDecoder().decode(
    Uint8Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  ));

  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

export async function verifyAdminToken(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');

  if (!token) {
    return { valid: false, error: 'Missing authorization token' };
  }
  if (!env.JWT_SECRET) {
    // Fail closed — signing/verifying with a hardcoded fallback would let
    // anyone forge an admin token offline if this secret is ever unset.
    return { valid: false, error: 'Server misconfigured' };
  }

  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    // Customer JWTs (functions/_utils/jwt.js) are signed with this same
    // JWT_SECRET, so signature validity alone isn't enough — without this
    // check, any logged-in customer's own token would pass as a valid admin
    // token. Only a token minted by /api/admin/session with admin:true
    // (i.e. a fully completed admin login, past 2FA if enabled) is accepted.
    if (payload.admin !== true) {
      return { valid: false, error: 'Invalid token' };
    }
    const required = inferAdminPermission(request);
    if (required && !hasAdminPermission(payload, required)) {
      return { valid: false, error: 'Forbidden', status: 403 };
    }
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: 'Invalid or expired token' };
  }
}

export function adminAuthHeaders() {
  return { 'Content-Type': 'application/json' };
}
