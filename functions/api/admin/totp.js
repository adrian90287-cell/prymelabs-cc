// Two-Factor Authentication (2FA) setup using TOTP (RFC 6238).
// GET  → generate a new candidate secret (not yet persisted)
// POST → { secret, code } verify the code proves the secret works, then
//         persist it as the active 2FA secret and enable 2FA
import { verifyAdminToken } from '../../_utils/adminAuth.js';
import { base32Encode, verifyTOTP } from '../../_utils/totpCore.js';
import { logSecurityEvent, SECURITY_EVENT_TYPES } from '../../_utils/securityLog.js';
import { ensureAdminUsersTable } from '../../_utils/adminPermissions.js';

export async function onRequest({ request, env }) {
  if (request.method === 'POST') return handleEnable(request, env);
  if (request.method === 'GET') return handleSetup(request, env);
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}

async function handleSetup(request, env) {
  const authResult = await verifyAdminToken(request, env);
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const secretBytes = crypto.getRandomValues(new Uint8Array(20)); // 160-bit, standard TOTP secret length
  const secret = base32Encode(secretBytes);
  const label = authResult.payload.role === 'staff'
    ? `Pryme Labs Admin:${authResult.payload.username || authResult.payload.name || 'staff'}`
    : 'Pryme Labs Admin:Owner';
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=Pryme%20Labs`;

  return new Response(JSON.stringify({ secret, otpauthUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleEnable(request, env) {
  const authResult = await verifyAdminToken(request, env);
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }
  const { secret, code } = body;
  if (!secret || !code) {
    return new Response(JSON.stringify({ error: 'Missing secret or code' }), { status: 400 });
  }

  const valid = await verifyTOTP(String(code), secret);
  if (!valid) {
    logSecurityEvent(SECURITY_EVENT_TYPES.AUTH_FAILURE, { reason: '2FA setup code invalid' });
    return new Response(JSON.stringify({ error: 'Invalid code — check your authenticator app and try again' }), { status: 401 });
  }

  if (authResult.payload.role === 'staff' && authResult.payload.admin_user_id) {
    await ensureAdminUsersTable(env);
    await env.DB.prepare('UPDATE admin_users SET totp_secret = ?, totp_enabled = 1, updated_at = ? WHERE id = ?')
      .bind(secret, Math.floor(Date.now() / 1000), authResult.payload.admin_user_id).run();
  } else {
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_2fa_secret', ?)").bind(secret),
      env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_2fa_enabled', '1')"),
    ]);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
