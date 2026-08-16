import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import { sendEmail } from '../../_utils/email.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'


// Generate per-user HMAC-SHA256 unsubscribe token
async function signUnsub(uid, email, secret) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`unsub:${uid}:${email}`))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// Translate text to Spanish using Workers AI
async function translateToSpanish(env, text) {
  if (!text || !env.AI) return text
  try {
    const resp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        {
          role: 'system',
          content: 'You are a professional Spanish translator. Translate the following text to Spanish accurately. Output only the translation — no explanations, no quotes, no extra text.',
        },
        { role: 'user', content: text },
      ],
      max_tokens: 600,
    })
    return resp?.response?.trim() || text
  } catch {
    return text
  }
}

export async function onRequestPost({ request, env }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  // Mass broadcast + a metered Workers AI translation call — throttle
  // independently of login rate limiting.
  const rl = await checkAdminRateLimit(env, adminRateLimitKey(request, 'ai-generate'))
  if (rl.blocked) return json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter)}s.` }, 429)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { subject, message, preview_text, image_url } = body
  if (!subject || !message) return json({ error: 'Subject and message required' }, 400)

  // ── Test send: deliver one preview to a single address, skip the broadcast ──
  if (body.test_email) {
    const testEmail = String(body.test_email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) return json({ error: 'Invalid test email address' }, 400)
    const html = buildAnnouncementHtml({
      subject, message, preview_text, image_url,
      store_name: env.STORE_NAME || 'Pryme Labs',
      unsubUrl: 'https://prymelabs.cc/api/unsubscribe?uid=0&tok=test',
      name: 'there',
    })
    const r = await sendEmail(env, {
      to: testEmail, subject, html,
      fromEmail: env.ANNOUNCE_FROM_EMAIL || 'news@prymelabs.net',
      fromName: env.STORE_NAME || 'Pryme Labs',
    })
    if (r?.error) return json({ error: `Test send failed: ${r.error}` }, 502)
    return json({ test: true, sent: 1, to: testEmail })
  }

  const { results: users } = await env.DB.prepare(
    `SELECT id, name, email, lang FROM users
     WHERE email IS NOT NULL AND email != ''
     AND COALESCE(username, '') != 'guest_checkout'
     AND COALESCE(email, '') != 'guest-checkout@prymelabs.local'
     AND (email_unsubscribed IS NULL OR email_unsubscribed = 0)`
  ).all()

  if (!users || users.length === 0) return json({ sent: 0, message: 'No subscribed users found' })

  // Separate users by language
  const esUsers = users.filter(u => u.lang === 'es')
  const enUsers = users.filter(u => u.lang !== 'es')

  const storeName = env.STORE_NAME || 'Pryme Labs'

  // Pre-translate for Spanish users (only if there are any)
  let subjectEs = subject
  let messageEs = message
  if (esUsers.length > 0 && env.AI) {
    ;[subjectEs, messageEs] = await Promise.all([
      translateToSpanish(env, subject),
      translateToSpanish(env, message),
    ])
  }

  // Send to all users
  const jobs = await Promise.all(users.map(async (u) => {
    const isEs = u.lang === 'es'
    const token = await signUnsub(u.id, u.email, env.JWT_SECRET)
    const unsubUrl = `https://prymelabs.cc/api/unsubscribe?uid=${u.id}&tok=${encodeURIComponent(token)}`
    const html = isEs
      ? buildAnnouncementHtmlEs({ subject: subjectEs, message: messageEs, preview_text, image_url, store_name: storeName, unsubUrl, name: u.name })
      : buildAnnouncementHtml({ subject, message, preview_text, image_url, store_name: storeName, unsubUrl, name: u.name })

    return sendEmail(env, {
      to: u.email,
      subject: isEs ? subjectEs : subject,
      html,
      fromEmail: env.ANNOUNCE_FROM_EMAIL || 'news@prymelabs.net',
      fromName: env.STORE_NAME || 'Pryme Labs',
    }).catch(() => null)
  }))

  const results = await Promise.allSettled(jobs)
  const sent = results.filter(r => r.status === 'fulfilled' && r.value !== null).length

  return json({ sent, total: users.length })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildAnnouncementHtml({ subject, message, preview_text, image_url, store_name, unsubUrl, name }) {
  const msgHtml = esc(message).replace(/\n/g, '<br>')
  subject = esc(subject)
  const imageBlock = image_url
    ? `<div style="margin-bottom:24px;border-radius:12px;overflow:hidden"><a href="https://prymelabs.cc/shop" target="_blank" style="display:block;text-decoration:none"><img src="${image_url}" alt="" style="width:100%;max-width:600px;display:block;border-radius:12px;border:0" /></a></div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${preview_text ? `<span style="display:none;max-height:0;overflow:hidden">${preview_text}</span>` : ''}
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td style="background:#12121f;border-radius:16px 16px 0 0;padding:28px 32px;border-bottom:1px solid #1e1e2e">
          <img src="https://prymelabs.cc/logo-mark.png" alt="" width="20" height="22" style="vertical-align:middle;margin-right:8px" /><span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;vertical-align:middle">PRYME<span style="color:#3b82f6">LABS</span></span>
        </td></tr>
        <tr><td style="background:#12121f;padding:32px">
          <p style="color:#60a5fa;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;margin:0 0 8px">Announcement from ${store_name}</p>
          <h1 style="color:#ffffff;font-size:24px;font-weight:800;margin:0 0 20px">${subject}</h1>
          ${imageBlock}
          <div style="color:#a1a1aa;font-size:15px;line-height:1.7;margin-bottom:28px">
            <p style="margin:0 0 16px">Hi ${esc(name) || 'Valued Customer'},</p>
            <p style="margin:0">${msgHtml}</p>
          </div>
          <a href="https://prymelabs.cc/shop" style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;padding:14px 28px;border-radius:12px;text-decoration:none;letter-spacing:0.04em">
            Shop Now →
          </a>
          <div style="margin-top:28px;padding:14px 18px;background:#1a1400;border:1px solid #fbbf24;border-radius:10px">
            <p style="color:#fbbf24;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px">⚠ Research Use Only</p>
            <p style="color:#a3781a;font-size:12px;margin:0;line-height:1.5">All products are strictly for laboratory and research purposes. Not for human consumption.</p>
          </div>
        </td></tr>
        <tr><td style="background:#0d0d1a;border-radius:0 0 16px 16px;padding:20px 32px;border-top:1px solid #1e1e2e">
          <p style="color:#52525b;font-size:11px;margin:0;text-align:center">
            You are receiving this because you have an account at ${store_name}.<br>
            <a href="${unsubUrl}" style="color:#3b82f6;text-decoration:none">Unsubscribe from announcements</a>
            &nbsp;·&nbsp; support@prymelabs.net &nbsp;·&nbsp; (346) 550-9100
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function buildAnnouncementHtmlEs({ subject, message, preview_text, image_url, store_name, unsubUrl, name }) {
  const msgHtml = esc(message).replace(/\n/g, '<br>')
  subject = esc(subject)
  const imageBlock = image_url
    ? `<div style="margin-bottom:24px;border-radius:12px;overflow:hidden"><a href="https://prymelabs.cc/shop" target="_blank" style="display:block;text-decoration:none"><img src="${image_url}" alt="" style="width:100%;max-width:600px;display:block;border-radius:12px;border:0" /></a></div>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${preview_text ? `<span style="display:none;max-height:0;overflow:hidden">${preview_text}</span>` : ''}
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td style="background:#12121f;border-radius:16px 16px 0 0;padding:28px 32px;border-bottom:1px solid #1e1e2e">
          <img src="https://prymelabs.cc/logo-mark.png" alt="" width="20" height="22" style="vertical-align:middle;margin-right:8px" /><span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;vertical-align:middle">PRYME<span style="color:#3b82f6">LABS</span></span>
        </td></tr>
        <tr><td style="background:#12121f;padding:32px">
          <p style="color:#60a5fa;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;margin:0 0 8px">Anuncio de ${store_name}</p>
          <h1 style="color:#ffffff;font-size:24px;font-weight:800;margin:0 0 20px">${subject}</h1>
          ${imageBlock}
          <div style="color:#a1a1aa;font-size:15px;line-height:1.7;margin-bottom:28px">
            <p style="margin:0 0 16px">Hola ${esc(name) || 'Cliente'},</p>
            <p style="margin:0">${msgHtml}</p>
          </div>
          <a href="https://prymelabs.cc/shop" style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:700;font-size:14px;padding:14px 28px;border-radius:12px;text-decoration:none;letter-spacing:0.04em">
            Ver Tienda →
          </a>
          <div style="margin-top:28px;padding:14px 18px;background:#1a1400;border:1px solid #fbbf24;border-radius:10px">
            <p style="color:#fbbf24;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px">⚠ Solo para Investigación</p>
            <p style="color:#a3781a;font-size:12px;margin:0;line-height:1.5">Todos los productos son estrictamente para uso en laboratorio e investigación. No apto para consumo humano.</p>
          </div>
        </td></tr>
        <tr><td style="background:#0d0d1a;border-radius:0 0 16px 16px;padding:20px 32px;border-top:1px solid #1e1e2e">
          <p style="color:#52525b;font-size:11px;margin:0;text-align:center">
            Recibes este mensaje porque tienes una cuenta en ${store_name}.<br>
            <a href="${unsubUrl}" style="color:#3b82f6;text-decoration:none">Cancelar suscripción a anuncios</a>
            &nbsp;·&nbsp; support@prymelabs.net &nbsp;·&nbsp; (346) 550-9100
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
