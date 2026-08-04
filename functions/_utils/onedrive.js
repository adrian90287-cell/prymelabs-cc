/**
 * OneDrive / Microsoft Graph API integration
 * Uses OAuth refresh-token flow; rotates tokens in D1 settings table.
 * Required Cloudflare secrets: ONEDRIVE_CLIENT_ID, ONEDRIVE_CLIENT_SECRET
 * Refresh token is stored as settings key: onedrive_refresh_token
 */

const TOKEN_URL  = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const SCOPES     = 'https://graph.microsoft.com/Files.ReadWrite offline_access'

/** Exchange OAuth refresh token for a new access token; rotates refresh token in D1 */
async function getAccessToken(env) {
  if (!env.ONEDRIVE_CLIENT_ID || !env.ONEDRIVE_CLIENT_SECRET) return null

  const row = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'onedrive_refresh_token'"
  ).first()
  const refreshToken = row?.value
  if (!refreshToken) return null

  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     env.ONEDRIVE_CLIENT_ID,
    client_secret: env.ONEDRIVE_CLIENT_SECRET,
    refresh_token: refreshToken,
    scope:         SCOPES,
  })

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (data.error || !data.access_token) return null

  // Rotate refresh token (Microsoft issues a new one on each use)
  if (data.refresh_token) {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('onedrive_refresh_token', ?)"
    ).bind(data.refresh_token).run()
  }

  return data.access_token
}

/**
 * Upload (create or overwrite) a file to OneDrive.
 * folderPath examples: "prymelabs-cc/Store Operations/Orders/2026-06"
 * filename example:    "PL-00001 - John Doe.html"
 */
export async function uploadToOneDrive(env, { folderPath, filename, content, contentType = 'text/html; charset=utf-8' }) {
  try {
    const token = await getAccessToken(env)
    if (!token) return { skipped: true, reason: 'not connected' }

    // Build the drive path — each segment individually encoded
    const segments = [...folderPath.split('/'), filename]
      .filter(Boolean)
      .map(s => encodeURIComponent(s))
      .join('/')

    const res = await fetch(`${GRAPH_BASE}/me/drive/root:/${segments}:/content`, {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
      body:    content,
    })
    return res.ok ? { ok: true } : { error: await res.text(), status: res.status }
  } catch (e) {
    return { error: e.message }
  }
}

/**
 * Download a file from OneDrive (used for CSV append-before-upload).
 * Returns file text or null if not found.
 */
export async function downloadFromOneDrive(env, { folderPath, filename }) {
  try {
    const token = await getAccessToken(env)
    if (!token) return null

    const segments = [...folderPath.split('/'), filename]
      .filter(Boolean)
      .map(s => encodeURIComponent(s))
      .join('/')

    const res = await fetch(`${GRAPH_BASE}/me/drive/root:/${segments}:/content`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** Build the Microsoft OAuth authorization URL */
export function buildAuthUrl(clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         SCOPES,
    response_mode: 'query',
    prompt:        'select_account',
  })
  return `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params}`
}

/** Exchange authorization code for tokens and store refresh token in D1 */
export async function exchangeCodeAndStore(env, { code, redirectUri }) {
  const params = new URLSearchParams({
    grant_type:    'authorization_code',
    client_id:     env.ONEDRIVE_CLIENT_ID,
    client_secret: env.ONEDRIVE_CLIENT_SECRET,
    code,
    redirect_uri:  redirectUri,
    scope:         SCOPES,
  })
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  })
  const data = await res.json()
  if (data.error || !data.refresh_token) {
    return { error: data.error_description || data.error || 'No refresh token received' }
  }
  await env.DB.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('onedrive_refresh_token', ?)"
  ).bind(data.refresh_token).run()
  return { ok: true }
}
