// Admin session management - issues secure tokens instead of storing passwords
// Simple JWT implementation using Web Crypto API (no external dependencies)
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js';
import { verifyTOTP } from '../../_utils/totpCore.js';

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function signJWT(payload, secret, expiresInSeconds = 8 * 60 * 60) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInSeconds;

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
    const secret = env.JWT_SECRET || 'dev-secret-key';

    // ── Step 2: completing a pending 2FA login (password already verified) ──
    if (body.pendingToken && body.code) {
      const rlKey2 = adminRateLimitKey(request, 'login-2fa');
      const rl2 = await checkAdminRateLimit(env, rlKey2);
      if (rl2.blocked) {
        return new Response(JSON.stringify({
          error: `Too many attempts. Try again in ${Math.ceil(rl2.retryAfter)} second(s).`
        }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': Math.ceil(rl2.retryAfter) } });
      }

      let pending;
      try { pending = await verifyJWT(body.pendingToken, secret); } catch { pending = null; }
      if (!pending || pending.pending2fa !== true) {
        return new Response(JSON.stringify({ error: 'Login session expired — enter your password again' }), {
          status: 401, headers: { 'Content-Type': 'application/json' }
        });
      }

      const secretRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_2fa_secret'").first();
      if (!secretRow?.value) {
        return new Response(JSON.stringify({ error: '2FA is not configured' }), {
          status: 401, headers: { 'Content-Type': 'application/json' }
        });
      }

      const valid = await verifyTOTP(String(body.code), secretRow.value);
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid code' }), {
          status: 401, headers: { 'Content-Type': 'application/json' }
        });
      }

      const token = await signJWT({ admin: true }, secret);
      return new Response(JSON.stringify({ token, expiresIn: 28800 }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    // ── Step 1: password check ──
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

    const twoFARow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_2fa_enabled'").first();
    if (twoFARow?.value === '1') {
      // Password proven — issue a short-lived pending token instead of the
      // real admin token. It carries no admin rights (pending2fa only), and
      // expires in 5 minutes if the code step isn't completed.
      const pendingToken = await signJWT({ pending2fa: true }, secret, 5 * 60);
      return new Response(JSON.stringify({ requires2fa: true, pendingToken }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    const token = await signJWT({ admin: true }, secret);
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
