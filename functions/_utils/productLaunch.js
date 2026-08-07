export async function ensureProductLaunchColumns(env) {
  for (const stmt of [
    'ALTER TABLE products ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE products ADD COLUMN release_at INTEGER',
  ]) {
    try { await env.DB.prepare(stmt).run() } catch {}
  }
}

export function releaseAtFromInput(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
  const s = String(value).trim()
  if (!s) return null
  const asNumber = Number(s)
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.floor(asNumber)
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

export function isReleasedProduct(p, now = Math.floor(Date.now() / 1000)) {
  if (Number(p?.is_draft || 0) === 1) return false
  const releaseAt = Number(p?.release_at || 0)
  return !releaseAt || releaseAt <= now
}
