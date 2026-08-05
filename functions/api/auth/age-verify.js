// Server-side age verification - issues signed tokens using Web Crypto API
import { constantTimeCompare } from '../../_utils/constantTime.js';

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (365 * 24 * 60 * 60); // 1 year

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
  // Imported for 'sign' (not 'verify') — we recompute the expected signature
  // via .sign() and compare, never call subtle.verify(). 'verify' usage here
  // previously made .sign() produce a different signature in this runtime,
  // so every legitimately valid token failed verification.
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

export async function onRequest({ request, env }) {
  if (request.method === 'POST') {
    return handleVerify(request, env);
  }
  if (request.method === 'GET') {
    return handleCheck(request, env);
  }
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}

async function handleVerify(request, env) {
  try {
    // User confirms they are 21+
    if (!env.JWT_SECRET) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }
    const token = await signJWT({
      ageVerified: true,
      verifiedAt: new Date().toISOString()
    }, env.JWT_SECRET);

    return new Response(JSON.stringify({
      token,
      expiresIn: 31536000 // 1 year in seconds
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    console.error('Age verify error:', e);
    return new Response(JSON.stringify({ error: 'Verification failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleCheck(request, env) {
  try {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '');

    if (!token || !env.JWT_SECRET) {
      return new Response(JSON.stringify({ verified: false }), { status: 200 });
    }

    const payload = await verifyJWT(token, env.JWT_SECRET);

    if (payload.ageVerified !== true) {
      return new Response(JSON.stringify({ verified: false }), { status: 200 });
    }

    return new Response(JSON.stringify({
      verified: true,
      verifiedAt: payload.verifiedAt
    }), { status: 200 });
  } catch (e) {
    // Invalid or expired token
    return new Response(JSON.stringify({ verified: false }), { status: 200 });
  }
}
