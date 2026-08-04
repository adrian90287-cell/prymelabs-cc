import { corsHeaders, json } from '../../_utils/cors.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

function authHeader(apiKey) {
  return { Authorization: `Basic ${btoa(`${apiKey}:`)}` }
}

// Recovers shipping-label PDF URLs from EasyPost for older orders that were
// shipped before we started persisting label_url. Matches each order's stored
// tracking number against the tracking_code of purchased EasyPost shipments,
// then writes the label_url (and tracker URL) back into the order's tracking_json.
export async function onRequestPost({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  const keyRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'easypost_api_key'").first()
  const apiKey = env.EASYPOST_API_KEY || keyRow?.value
  if (!apiKey) return json({ error: 'EasyPost API key not configured' }, 400)

  // Find orders with a tracking number but no stored label_url yet
  const { results } = await env.DB.prepare(
    'SELECT id, order_number, tracking_json FROM orders WHERE deleted_at IS NULL AND tracking_json IS NOT NULL'
  ).all()

  const needing = []
  for (const o of results || []) {
    let t
    try { t = JSON.parse(o.tracking_json || 'null') } catch { t = null }
    if (t && t.number && !t.label_url) needing.push({ id: o.id, order_number: o.order_number, tracking: t })
  }

  if (needing.length === 0) {
    return json({ ok: true, scanned: 0, updated: 0, unmatched: 0, message: 'No orders needed recovery.' })
  }

  // Build a tracking_code → { label_url, tracking_url } map from EasyPost.
  const wanted = new Set(needing.map(n => String(n.tracking.number).trim()))
  const map = new Map()
  let beforeId = null
  let pages = 0
  const MAX_PAGES = 40 // up to ~4000 shipments

  while (pages < MAX_PAGES) {
    const url = new URL('https://api.easypost.com/v2/shipments')
    url.searchParams.set('page_size', '100')
    url.searchParams.set('purchased', 'true')
    if (beforeId) url.searchParams.set('before_id', beforeId)

    const res = await fetch(url.toString(), { headers: authHeader(apiKey) })
    if (!res.ok) {
      // Surface the error only if we've matched nothing so far
      if (map.size === 0) {
        const txt = await res.text().catch(() => '')
        return json({ error: 'EasyPost shipment lookup failed', detail: txt.slice(0, 300) }, 502)
      }
      break
    }
    const data = await res.json()
    const shipments = data.shipments || []
    if (shipments.length === 0) break

    for (const s of shipments) {
      const code = s.tracking_code
      const labelUrl = s.postage_label?.label_url
      if (code && labelUrl && wanted.has(String(code).trim()) && !map.has(code)) {
        map.set(String(code).trim(), { label_url: labelUrl, tracking_url: s.tracker?.public_url || null })
      }
    }

    beforeId = shipments[shipments.length - 1].id
    pages++
    if (!data.has_more) break
    // Stop early once every needed tracking number has been found
    if (needing.every(n => map.has(String(n.tracking.number).trim()))) break
  }

  // Write recovered URLs back into matching orders
  const updates = []
  let updated = 0
  for (const n of needing) {
    const found = map.get(String(n.tracking.number).trim())
    if (!found) continue
    const merged = {
      ...n.tracking,
      label_url:    found.label_url,
      tracking_url: n.tracking.tracking_url || found.tracking_url || null,
    }
    updates.push(env.DB.prepare('UPDATE orders SET tracking_json = ? WHERE id = ?').bind(JSON.stringify(merged), n.id))
    updated++
  }
  if (updates.length) await env.DB.batch(updates)

  return json({ ok: true, scanned: needing.length, updated, unmatched: needing.length - updated, pages })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
