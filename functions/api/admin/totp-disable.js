// GET  → current 2FA status ({ enabled: true/false })
// POST → { password } disables 2FA. Requires the admin password (not a fresh
// TOTP code) so losing access to the authenticator app is never a lockout —
// the password is always something the admin already has.
import { verifyAdminToken } from '../../_utils/adminAuth.js';
import { constantTimeCompare } from '../../_utils/constantTime.js';
import { verifyPassword } from '../../_utils/crypto.js';
import { ensureAdminUsersTable } from '../../_utils/adminPermissions.js';

export async function onRequest({ request, env }) {
  if (request.method === 'GET') return handleStatus(request, env);
  if (request.method === 'POST') return handleDisable(request, env);
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}

async function handleStatus(request, env) {
  const authResult = await verifyAdminToken(request, env);
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  let enabled = false;
  if (authResult.payload.role === 'staff' && authResult.payload.admin_user_id) {
    await ensureAdminUsersTable(env);
    const row = await env.DB.prepare('SELECT totp_enabled FROM admin_users WHERE id = ?').bind(authResult.payload.admin_user_id).first();
    enabled = row?.totp_enabled === 1;
  } else {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_2fa_enabled'").first();
    enabled = row?.value === '1';
  }
  return new Response(JSON.stringify({ enabled }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleDisable(request, env) {
  const authResult = await verifyAdminToken(request, env);
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }
  const { password } = body;
  if (authResult.payload.role === 'staff' && authResult.payload.admin_user_id) {
    await ensureAdminUsersTable(env);
    const row = await env.DB.prepare('SELECT password_hash, salt FROM admin_users WHERE id = ? AND is_active = 1').bind(authResult.payload.admin_user_id).first();
    if (!row || !password || !await verifyPassword(String(password), row.password_hash, row.salt)) {
      return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401 });
    }
    await env.DB.prepare('UPDATE admin_users SET totp_enabled = 0, totp_secret = NULL, updated_at = ? WHERE id = ?')
      .bind(Math.floor(Date.now() / 1000), authResult.payload.admin_user_id).run();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ownerHashRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_owner_password_hash'").first().catch(() => null);
  const ownerSaltRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_owner_password_salt'").first().catch(() => null);
  const dbOwnerOk = ownerHashRow?.value && ownerSaltRow?.value && password
    ? await verifyPassword(String(password), ownerHashRow.value, ownerSaltRow.value)
    : false;
  if (!password || (!dbOwnerOk && !constantTimeCompare(String(password), String(env.ADMIN_PASSWORD || '')))) {
    return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401 });
  }

  await env.DB.batch([
    env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_2fa_enabled', '0')"),
    env.DB.prepare("DELETE FROM settings WHERE key = 'admin_2fa_secret'"),
  ]);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
