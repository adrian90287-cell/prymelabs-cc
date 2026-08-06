import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { sendEmail, sendSMS } from '../../_utils/email.js'

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

export async function onRequestPost({ request, env, waitUntil }) {
  const rl = await checkRateLimit(env, rateLimitKey(request, 'forgot-username'))
  if (rl.blocked) return json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const identifier = String(body.identifier || '').trim().toLowerCase()
  const phone = normalizePhone(identifier)
  const genericOk = json({ ok: true })
  if (!identifier || identifier.length > 254) return genericOk

  const user = phone
    ? await env.DB.prepare(
        `SELECT name, username, email, phone FROM users
          WHERE phone = ?
             OR replace(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+1', '') = ?
             OR replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?`
      ).bind(phone, phone, `1${phone}`).first()
    : await env.DB.prepare('SELECT name, username, email, phone FROM users WHERE email = ?').bind(identifier).first()

  if (!user) return genericOk

  const message = `Your Pryme Labs username is: ${user.username}`
  if (user.email) {
    waitUntil(sendEmail(env, {
      to: user.email,
      subject: 'Your Pryme Labs username',
      html: `<div style="font-family:Inter,Arial,sans-serif;padding:24px;color:#111"><h2>Your Pryme Labs username</h2><p>${message}</p><p>If you did not request this, you can ignore this email.</p></div>`,
    }).catch(() => {}))
  }
  if (phone && user.phone) {
    waitUntil(sendSMS(env, { to: user.phone, message }).catch(() => {}))
  }

  return genericOk
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
