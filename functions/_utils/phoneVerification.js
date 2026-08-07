export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

export function smsPhone(phone) {
  const clean = normalizePhone(phone)
  if (!clean) return null
  // Current storefront registration expects US-style 10 digit numbers.
  if (clean.length === 10) return `+1${clean}`
  return clean.startsWith('+') ? clean : `+${clean}`
}

export async function ensurePhoneVerificationTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS phone_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      phone_norm TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0,
      sent_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )
  `).run()
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_phone_verifications_user ON phone_verifications(user_id, used, expires_at)').run()
}

export function randomPhoneCode() {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return String(100000 + (arr[0] % 900000))
}
