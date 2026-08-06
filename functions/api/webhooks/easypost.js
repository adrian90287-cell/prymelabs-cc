import { json } from '../../_utils/cors.js'
import { refreshOrderTracking } from '../../_utils/tracking.js'

// ─────────────────────────────────────────────────────────────────────────────
// EasyPost webhook — receives real-time tracker updates as carriers scan packages.
// EasyPost POSTs a signed event; we verify the HMAC signature, find the matching
// order by tracking number, then run refreshOrderTracking which auto-promotes
// Fulfilled → Shipped (on first scan) and Shipped → Completed (on delivery),
// firing the customer notifications. Direction is one-way: EasyPost → us. This
// endpoint exposes no admin data and processes only signed tracker events.
// Docs: https://docs.easypost.com/docs/webhooks
// ─────────────────────────────────────────────────────────────────────────────

// Constant-time string comparison to avoid signature timing leaks
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Verify EasyPost's X-Hmac-Signature header against the raw request body.
// EasyPost: NFKD-normalize the secret, HMAC-SHA256 over the raw body bytes,
// hex-encode, and prefix with "hmac-sha256-hex=".
async function verifySignature(secret, rawBodyBytes, signatureHeader) {
  if (!secret || !signatureHeader) return false
  const keyData = new TextEncoder().encode(secret.normalize('NFKD'))
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBuf = await crypto.subtle.sign('HMAC', key, rawBodyBytes)
  const hex = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual('hmac-sha256-hex=' + hex, signatureHeader)
}

async function getEasyPostKey(env) {
  if (env.EASYPOST_API_KEY) return env.EASYPOST_API_KEY
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'easypost_api_key'").first()
  return row?.value || null
}

export async function onRequestPost({ request, env, waitUntil }) {
  // Read the raw bytes once — needed for both signature check and JSON parse
  const rawBody = await request.arrayBuffer()

  // ── Verify the request genuinely came from EasyPost ──
  const secret = env.EASYPOST_WEBHOOK_SECRET
  if (!secret) {
    // Secret not configured yet — refuse rather than process unverified events
    return json({ error: 'Webhook secret not configured' }, 503)
  }
  const signature = request.headers.get('X-Hmac-Signature') || request.headers.get('x-hmac-signature')
  const valid = await verifySignature(secret, rawBody, signature)
  if (!valid) return json({ error: 'Invalid signature' }, 401)

  let event
  try { event = JSON.parse(new TextDecoder().decode(rawBody)) } catch { return json({ error: 'Invalid JSON' }, 400) }

  // Only tracker events carry shipment scan updates
  const description = event.description || event.object || ''
  if (!String(description).includes('tracker')) return json({ ok: true, ignored: description })

  const tracker = event.result || event.tracker || {}
  const code = (tracker.tracking_code || '').trim()
  if (!code) return json({ ok: true, ignored: 'no_tracking_code' })

  // Find the order by its indexed tracking_number first (fast, exact). Falls
  // back to the old LIKE-scan + JS exact-match for any order predating the
  // tracking_number backfill (migrations/tracking_index.sql) — belt and
  // suspenders so a webhook can never silently miss an order either way.
  let order = await env.DB.prepare(
    `SELECT * FROM orders WHERE deleted_at IS NULL AND tracking_number = ? LIMIT 1`
  ).bind(code).first()

  if (!order) {
    const { results: candidates } = await env.DB.prepare(
      `SELECT * FROM orders
       WHERE deleted_at IS NULL AND tracking_json IS NOT NULL
         AND tracking_json LIKE '%' || ? || '%'
       ORDER BY created_at DESC LIMIT 25`
    ).bind(code).all()

    order = (candidates || []).find(o => {
      try { return (JSON.parse(o.tracking_json || '{}').number || '').trim() === code } catch { return false }
    })
  }

  if (!order) return json({ ok: true, ignored: 'no_matching_order' })

  // Reuse the shared tracking logic — handles auto-ship, auto-complete, and
  // all customer notifications. force:true bypasses the 30-min refresh throttle.
  const easypostKey = await getEasyPostKey(env)
  await refreshOrderTracking(env, order, { force: true, waitUntil, easypostKey }).catch(() => {})

  return json({ ok: true })
}

// EasyPost (and manual dashboard tests) may send a GET to confirm the endpoint
export async function onRequestGet() {
  return new Response('OK', { status: 200 })
}
