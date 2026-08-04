// Admin authentication helper - validates JWT tokens
import { constantTimeCompare } from './constantTime.js';

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

  try {
    const payload = await verifyJWT(token, env.JWT_SECRET || 'dev-secret-key');
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: 'Invalid or expired token' };
  }
}

export function adminAuthHeaders() {
  return { 'Content-Type': 'application/json' };
}
