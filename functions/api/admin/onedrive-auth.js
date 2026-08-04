/**
 * OneDrive OAuth connect/disconnect for admin.
 *
 * GET  /api/admin/onedrive-auth          → { auth_url } (call with admin Bearer token)
 * GET  /api/admin/onedrive-auth?code=... → OAuth callback redirect (no auth header needed)
 * DELETE /api/admin/onedrive-auth        → disconnect (remove stored token)
 */
import { corsHeaders, json } from '../../_utils/cors.js'
import { buildAuthUrl, exchangeCodeAndStore } from '../../_utils/onedrive.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

export async function onRequestGet({ request, env }) {
  const url  = new URL(request.url)
  const code = url.searchParams.get('code')

  // ── OAuth callback (Microsoft redirects here with ?code=) ─────────────────
  if (code) {
    const redirectUri = `${url.origin}/api/admin/onedrive-auth`
    const result = await exchangeCodeAndStore(env, { code, redirectUri })
    const dest = result.ok
      ? '/admin?onedrive=connected'
      : `/admin?onedrive=error&msg=${encodeURIComponent(result.error || 'Unknown error')}`
    return new Response(null, { status: 302, headers: { Location: dest } })
  }

  // ── Return the OAuth URL for the admin to open ────────────────────────────
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  if (!env.ONEDRIVE_CLIENT_ID) {
    return json({ error: 'ONEDRIVE_CLIENT_ID secret not configured in Cloudflare' }, 400)
  }

  const redirectUri = `${url.origin}/api/admin/onedrive-auth`
  return json({ auth_url: buildAuthUrl(env.ONEDRIVE_CLIENT_ID, redirectUri) })
}

export async function onRequestDelete({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  await env.DB.prepare("DELETE FROM settings WHERE key = 'onedrive_refresh_token'").run()
  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
