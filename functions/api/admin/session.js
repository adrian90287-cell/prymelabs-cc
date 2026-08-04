// Admin session management - issues secure tokens instead of storing passwords
// Simple JWT implementation using Web Crypto API (no external dependencies)
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js';

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (8 * 60 * 60); // 8 hours

  const jwtPayload = { ...payload, iat: now, exp };
  const msg = base64url(new TextEncoder().encode(JSON.stringify(header))) + '.' +
              base64url(new TextEncoder().encode(JSON.stringify(jwtPayload)));

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));

  return msg + '.' + base64url(sig);
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');

  const msg = parts[0] + '.' + parts[1];
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);

  const expectedSig = base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  if (expectedSig !== parts[2]) throw new Error('Invalid signature');

  const payload = JSON.parse(new TextDecoder().decode(
    Uint8Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  ));

  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

export async function onRequest({ request, env }) {
  if (request.method === 'POST') {
    return handleLogin(request, env);
  }
  if (request.method === 'GET') {
    return handleVerify(request, env);
  }
  if (request.method === 'DELETE') {
    return handleLogout(request, env);
  }
  return new Response('Method not allowed', { status: 405 });
}

async function handleLogin(request, env) {
  try {
    const body = await request.json();
    const { password } = body;
    const rlKey = adminRateLimitKey(request, 'login');

    const rl = await checkAdminRateLimit(env, rlKey);
    if (rl.blocked) {
      return new Response(JSON.stringify({
        error: `Too many login attempts. Try again in ${Math.ceil(rl.retryAfter)} second(s).`
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': Math.ceil(rl.retryAfter) }
      });
    }

    if (password !== env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Invalid password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = await signJWT({ admin: true }, env.JWT_SECRET || 'dev-secret-key');
    return new Response(JSON.stringify({ token, expiresIn: 28800 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleVerify(request, env) {
  try {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '');

    if (!token) {
      return new Response(JSON.stringify({ valid: false }), { status: 401 });
    }

    await verifyJWT(token, env.JWT_SECRET || 'dev-secret-key');

    return new Response(JSON.stringify({
      valid: true,
      message: 'Token is valid'
    }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({
      valid: false,
      error: 'Invalid or expired token'
    }), { status: 401 });
  }
}

async function handleLogout(request, env) {
  return new Response(JSON.stringify({ message: 'Logged out' }), { status: 200 });
}
