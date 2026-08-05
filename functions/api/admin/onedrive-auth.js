import { adminAuth } from '../../_utils/legacyAdminAuth.js'
/**
 * OneDrive OAuth connect/disconnect for admin.
 *
 * GET  /api/admin/onedrive-auth          → { auth_url } (call with admin Bearer token)
 * GET  /api/admin/onedrive-auth?code=... → OAuth callback redirect (no auth header needed)
 * DELETE /api/admin/onedrive-auth        → disconnect (remove stored token)
 */
import { corsHeaders, json } from '../../_utils/cors.js'
import { buildAuthUrl, exchangeCodeAndStore, generateOAuthState, verifyAndConsumeOAuthState } from '../../_utils/onedrive.js'


export async function onRequestGet({ request, env }) {
  const url   = new URL(request.url)
  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  // ── OAuth callback (Microsoft redirects here with ?code=&state=) ──────────
  if (code) {
    // Reject unless the state matches a flow we ourselves started — otherwise
    // anyone could feed an admin their own authorization code and hijack
    // where OneDrive uploads (order receipts) end up going.
    if (!await verifyAndConsumeOAuthState(env, state)) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/admin?onedrive=error&msg=' + encodeURIComponent('Invalid or expired authorization request') },
      })
    }
    const redirectUri = `${url.origin}/api/admin/onedrive-auth`
    const result = await exchangeCodeAndStore(env, { code, redirectUri })
    const dest = result.ok
      ? '/admin?onedrive=connected'
      : `/admin?onedrive=error&msg=${encodeURIComponent(result.error || 'Unknown error')}`
    return new Response(null, { status: 302, headers: { Location: dest } })
  }

  // ── Return the OAuth URL for the admin to open ────────────────────────────
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  if (!env.ONEDRIVE_CLIENT_ID) {
    return json({ error: 'ONEDRIVE_CLIENT_ID secret not configured in Cloudflare' }, 400)
  }

  const redirectUri = `${url.origin}/api/admin/onedrive-auth`
  const oauthState = await generateOAuthState(env)
  return json({ auth_url: buildAuthUrl(env.ONEDRIVE_CLIENT_ID, redirectUri, oauthState) })
}

export async function onRequestDelete({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  await env.DB.prepare("DELETE FROM settings WHERE key = 'onedrive_refresh_token'").run()
  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
