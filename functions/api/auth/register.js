import { hashPassword } from '../../_utils/crypto.js'
import { signJWT } from '../../_utils/jwt.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { sendEmail, sendSMS } from '../../_utils/email.js'
import { pushToAll } from '../../_utils/webpush.js'
import { uploadToOneDrive } from '../../_utils/onedrive.js'
import { subscriberRecordHtml } from '../../_utils/documents.js'

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

export async function onRequestPost({ request, env, waitUntil }) {
  // Rate-limit account creation — 5 registrations per 15 minutes per IP
  const rlKey = rateLimitKey(request, 'register')
  const rl = await checkRateLimit(env, rlKey)
  if (rl.blocked) {
    return json(
      { error: `Too many registration attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` },
      429
    )
  }

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { name, username, email, password, phone, lang } = body

  if (!name?.trim() || !username?.trim() || !email?.trim() || !password) {
    return json({ error: 'Name, username, email, and password are required' }, 400)
  }

  // Length guards
  if (name.trim().length > 128) return json({ error: 'Name is too long' }, 400)
  if (username.trim().length < 3 || username.trim().length > 32) return json({ error: 'Username must be 3–32 characters' }, 400)
  if (email.trim().length > 254) return json({ error: 'Email address is too long' }, 400)
  if (password.length < 8 || password.length > 256) return json({ error: 'Password must be 8–256 characters' }, 400)
  if (phone && phone.trim().length > 20) return json({ error: 'Phone number is too long' }, 400)

  if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    return json({ error: 'Username can only contain letters, numbers, and underscores' }, 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return json({ error: 'Valid email address required' }, 400)
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username.trim().toLowerCase()).first()
  if (existing) return json({ error: 'Username already taken' }, 409)

  const emailTaken = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.trim().toLowerCase()).first()
  if (emailTaken) return json({ error: 'An account with that email already exists' }, 409)

  const cleanPhone = normalizePhone(phone)
  if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 15) return json({ error: 'Valid phone number required' }, 400)
  const phoneTaken = await env.DB.prepare(
    `SELECT id FROM users
      WHERE phone = ?
         OR replace(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+1', '') = ?
         OR replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?`
  ).bind(cleanPhone, cleanPhone, `1${cleanPhone}`).first()
  if (phoneTaken) return json({ error: 'An account with that phone number already exists' }, 409)

  const { hash, salt } = await hashPassword(password)
  const cleanLang = ['en', 'es'].includes(lang) ? lang : 'en'
  const result = await env.DB.prepare(
    'INSERT INTO users (name, username, email, password_hash, salt, phone, lang) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(name.trim(), username.trim().toLowerCase(), email.trim().toLowerCase(), hash, salt, cleanPhone, cleanLang).run()

  const userId = result.meta.last_row_id
  await env.DB.prepare('UPDATE users SET phone_norm = ? WHERE id = ?').bind(cleanPhone, userId).run().catch(() => {})
  await env.DB.prepare('UPDATE users SET phone_verified = 0 WHERE id = ?').bind(userId).run().catch(() => {})
  const token = await signJWT(
    { sub: userId, username: username.trim().toLowerCase(), name: name.trim(), email: email.trim().toLowerCase(), phone: cleanPhone, lang: cleanLang, tv: 0, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
    env.JWT_SECRET
  )

  // Fire-and-forget: notify owner of new signup
  if (env.OWNER_EMAIL) {
    const signedUpAt = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })
    sendEmail(env, {
      to: env.OWNER_EMAIL,
      subject: `🆕 New Subscriber — ${name.trim()}`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#09090b;font-family:Inter,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#12121f;border:1px solid #1e1e2e;border-radius:16px;overflow:hidden">
  <div style="background:#0d0d1a;padding:18px 24px;border-bottom:1px solid #1e1e2e">
    <img src="https://prymelabs.cc/logo-mark.png" alt="" width="18" height="20" style="vertical-align:middle;margin-right:6px" /><span style="color:#fff;font-size:17px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;vertical-align:middle">PRYME<span style="color:#3b82f6">LABS</span></span>
  </div>
  <div style="padding:24px">
    <p style="color:#4ade80;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;margin:0 0 10px">🆕 New Subscriber</p>
    <h2 style="color:#fff;font-size:20px;font-weight:800;margin:0 0 20px">${esc(name.trim())} just created an account</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="color:#71717a;font-size:13px;padding:5px 0;width:90px">Name</td><td style="color:#e4e4e7;font-size:13px;font-weight:600">${esc(name.trim())}</td></tr>
      <tr><td style="color:#71717a;font-size:13px;padding:5px 0">Username</td><td style="color:#a1a1aa;font-size:13px">@${esc(username.trim().toLowerCase())}</td></tr>
      <tr><td style="color:#71717a;font-size:13px;padding:5px 0">Email</td><td style="font-size:13px"><a href="mailto:${esc(email.trim())}" style="color:#60a5fa;text-decoration:none">${esc(email.trim())}</a></td></tr>
      <tr><td style="color:#71717a;font-size:13px;padding:5px 0">Signed Up</td><td style="color:#a1a1aa;font-size:13px">${esc(signedUpAt)} CST</td></tr>
      ${cleanPhone ? `<tr><td style="color:#71717a;font-size:13px;padding:5px 0">Phone</td><td style="color:#e4e4e7;font-size:13px;font-weight:600">${esc(cleanPhone)}</td></tr>` : ''}
    </table>
    <a href="https://prymelabs.cc/admin" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px">View Subscribers →</a>
  </div>
</div>
</body></html>`,
    }).catch(() => {})
  }

  // ── OneDrive subscriber backup ────────────────────────────────────────────
  const now = new Date()
  const yearKey = String(now.getFullYear())
  const safeName = name.trim().replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 40)
  waitUntil(uploadToOneDrive(env, {
    folderPath: `prymelabs-cc/Store Operations/09 Customers/${yearKey}`,
    filename: `${safeName} - ${now.toISOString().slice(0, 10)}.html`,
    content: subscriberRecordHtml({ id: userId, name: name.trim(), username: username.trim().toLowerCase(), email: email.trim().toLowerCase(), phone: cleanPhone, lang: cleanLang }),
  }).catch(() => {}))

  // Push + SMS — use waitUntil so Cloudflare keeps the Worker alive until these finish
  waitUntil(pushToAll(env, {
    title: '👤 New Subscriber',
    body: `${name.trim()} (${email.trim().toLowerCase()})`,
    url: '/admin',
  }).catch(() => {}))

  waitUntil(sendSMS(env, { message: `👤 New Subscriber: ${name.trim()} (${email.trim().toLowerCase()})${cleanPhone ? ` 📱${cleanPhone}` : ''}` }).catch(() => {}))

  return json({ token, user: { id: userId, name: name.trim(), username: username.trim().toLowerCase(), email: email.trim().toLowerCase(), phone: cleanPhone, lang: cleanLang } })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
