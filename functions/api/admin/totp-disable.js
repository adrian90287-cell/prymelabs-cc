// GET  → current 2FA status ({ enabled: true/false })
// POST → { password } disables 2FA. Requires the admin password (not a fresh
// TOTP code) so losing access to the authenticator app is never a lockout —
// the password is always something the admin already has.
import { verifyAdminToken } from '../../_utils/adminAuth.js';
import { constantTimeCompare } from '../../_utils/constantTime.js';

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
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_2fa_enabled'").first();
  return new Response(JSON.stringify({ enabled: row?.value === '1' }), {
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
  if (!password || !constantTimeCompare(String(password), String(env.ADMIN_PASSWORD || ''))) {
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
