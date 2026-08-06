// Admin session management - issues secure tokens instead of storing passwords
// Simple JWT implementation using Web Crypto API (no external dependencies)
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js';
import { verifyTOTP } from '../../_utils/totpCore.js';
import { constantTimeCompare } from '../../_utils/constantTime.js';
import { verifyAdminToken } from '../../_utils/adminAuth.js';
import { verifyPassword } from '../../_utils/crypto.js';
import { ensureAdminUsersTable, normalizePermissions, publicAdminUser } from '../../_utils/adminPermissions.js';

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
  // NOTE: imported for 'sign' (not 'verify') even though this function verifies —
  // we recompute the expected signature ourselves via .sign() and compare, we
  // never call subtle.verify(). Importing with 'verify' usage here previously
  // made this key produce a different (wrong) signature under .sign() in this
  // runtime, so every legitimately valid token failed verification.
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const expectedSig = base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  if (!constantTimeCompare(expectedSig, parts[2])) throw new Error('Invalid signature');

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
    if (!env.JWT_SECRET) {
      // Fail closed — a hardcoded fallback secret would let anyone forge an
      // admin token offline if this Cloudflare secret is ever unset.
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }
    const body = await request.json();
    const secret = env.JWT_SECRET;

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

      const secretValue = pending.adminUser?.admin_user_id
        ? (await env.DB.prepare('SELECT totp_secret FROM admin_users WHERE id = ? AND is_active = 1').bind(pending.adminUser.admin_user_id).first())?.totp_secret
        : (await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_2fa_secret'").first())?.value;
      if (!secretValue) {
        return new Response(JSON.stringify({ error: '2FA is not configured' }), {
          status: 401, headers: { 'Content-Type': 'application/json' }
        });
      }

      const valid = await verifyTOTP(String(body.code), secretValue);
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid code' }), {
          status: 401, headers: { 'Content-Type': 'application/json' }
        });
      }

      const tokenPayload = pending.adminUser
        ? {
            admin: true,
            role: 'staff',
            admin_user_id: pending.adminUser.id,
            username: pending.adminUser.username,
            name: pending.adminUser.name,
            email: pending.adminUser.email || '',
            permissions: normalizePermissions(pending.adminUser.permissions),
            totp_enabled: true,
          }
        : { admin: true, owner: true, role: 'owner', permissions: ['*'], name: 'Owner' };
      const token = await signJWT(tokenPayload, secret);
      return new Response(JSON.stringify({ token, expiresIn: 28800, admin: tokenPayload }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    // ── Step 1: password check ──
    const { username, password } = body;
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

    let loginPayload = null;
    const loginName = String(username || '').trim().toLowerCase();

    if (!loginName || loginName === 'owner') {
      const ownerUserRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_owner_username'").first().catch(() => null);
      const ownerHashRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_owner_password_hash'").first().catch(() => null);
      const ownerSaltRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_owner_password_salt'").first().catch(() => null);
      const ownerUsername = String(ownerUserRow?.value || 'owner').trim().toLowerCase();
      const usernameOk = !loginName || loginName === ownerUsername || loginName === 'owner';
      const dbPasswordOk = ownerHashRow?.value && ownerSaltRow?.value && typeof password === 'string'
        ? await verifyPassword(password, ownerHashRow.value, ownerSaltRow.value)
        : false;
      const envPasswordOk = env.ADMIN_PASSWORD && typeof password === 'string' && constantTimeCompare(password, env.ADMIN_PASSWORD);
      if (usernameOk && (dbPasswordOk || envPasswordOk)) {
        loginPayload = { admin: true, owner: true, role: 'owner', permissions: ['*'], name: 'Owner', username: ownerUsername };
      }
    } else {
      await ensureAdminUsersTable(env);
      const row = await env.DB.prepare(
        'SELECT * FROM admin_users WHERE is_active = 1 AND (username = ? OR lower(email) = ?) LIMIT 1'
      ).bind(loginName, loginName).first();
      if (row && typeof password === 'string' && await verifyPassword(password, row.password_hash, row.salt)) {
        await env.DB.prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?')
          .bind(Math.floor(Date.now() / 1000), row.id).run();
        loginPayload = {
          admin: true,
          role: 'staff',
          admin_user_id: row.id,
          username: row.username,
          name: row.name,
          email: row.email || '',
          permissions: normalizePermissions(row.permissions_json),
          totp_enabled: row.totp_enabled === 1,
        };
      }
    }

    if (!loginPayload) {
      return new Response(JSON.stringify({ error: 'Invalid password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const twoFARow = loginPayload.role === 'staff'
      ? { value: loginPayload.totp_enabled ? '1' : '0' }
      : await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_2fa_enabled'").first();
    if (twoFARow?.value === '1') {
      // Password proven — issue a short-lived pending token instead of the
      // real admin token. It carries no admin rights (pending2fa only), and
      // expires in 5 minutes if the code step isn't completed.
      const pendingToken = await signJWT(
        loginPayload.role === 'staff' ? { pending2fa: true, adminUser: loginPayload } : { pending2fa: true },
        secret,
        5 * 60
      );
      return new Response(JSON.stringify({ requires2fa: true, pendingToken }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    const token = await signJWT(loginPayload, secret);
    return new Response(JSON.stringify({ token, expiresIn: 28800, admin: loginPayload }), {
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
    const authResult = await verifyAdminToken(request, env);
    if (!authResult.valid) {
      return new Response(JSON.stringify({ valid: false }), { status: 401 });
    }

    return new Response(JSON.stringify({
      valid: true,
      message: 'Token is valid',
      admin: authResult.payload?.role === 'staff'
        ? publicAdminUser({
            id: authResult.payload.admin_user_id,
            name: authResult.payload.name,
            username: authResult.payload.username,
            email: authResult.payload.email,
            permissions_json: JSON.stringify(authResult.payload.permissions || []),
            is_active: 1,
          })
        : { role: 'owner', owner: true, name: authResult.payload?.name || 'Owner', permissions: ['*'] }
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
