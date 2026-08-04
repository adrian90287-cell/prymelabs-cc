import { json } from '../_utils/cors.js'

// Verify HMAC-SHA256 token for unsubscribe link
async function verifyUnsubToken(uid, email, tok, secret) {
  if (!tok || !secret) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['verify']
  )
  let sigBytes
  try {
    sigBytes = Uint8Array.from(
      atob(tok.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    )
  } catch { return false }
  return crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`unsub:${uid}:${email}`))
}

function successPage(lang) {
  const es = lang === 'es'
  return new Response(`<!DOCTYPE html>
<html lang="${es ? 'es' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${es ? 'Cancelaste tu Suscripción — Pryme Labs' : 'Unsubscribed — Pryme Labs'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #09090b; color: #e4e4e7; font-family: Inter, Arial, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #12121f; border: 1px solid #1e1e2e; border-radius: 20px; max-width: 480px; width: 100%; padding: 40px 32px; text-align: center; }
    .logo { font-size: 22px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 28px; }
    .logo span { color: #3b82f6; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 12px; }
    p { color: #71717a; font-size: 15px; line-height: 1.6; margin-bottom: 8px; }
    .note { background: #1c1c2e; border: 1px solid #2e2e4e; border-radius: 12px; padding: 14px 18px; margin-top: 20px; }
    .note p { font-size: 13px; color: #52525b; }
    .note strong { color: #a1a1aa; }
    a { display: inline-block; margin-top: 24px; color: #3b82f6; font-size: 14px; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">PRYME<span>LABS</span></div>
    <div class="icon">✅</div>
    <h1>${es ? 'Suscripción Cancelada' : 'Successfully Unsubscribed'}</h1>
    <p>${es
      ? 'Has sido removido de nuestras listas de anuncios por correo electrónico y SMS.'
      : 'You have been removed from our email and SMS announcement lists.'
    }</p>
    <p>${es
      ? 'Aún recibirás actualizaciones importantes sobre tus pedidos (confirmaciones y notificaciones de envío).'
      : 'You will still receive important updates about your orders (confirmations and shipping notifications).'
    }</p>
    <div class="note">
      <p><strong>${es ? '¿Cambiaste de opinión?' : 'Changed your mind?'}</strong> ${es
        ? 'Puedes volver a suscribirte en cualquier momento desde la configuración de tu cuenta.'
        : 'You can re-subscribe at any time from your account settings.'
      }</p>
    </div>
    <a href="https://prymelabs.cc/shop">${es ? '← Volver a la tienda' : '← Back to Shop'}</a>
  </div>
</body>
</html>`, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
}

function errorPage(msg) {
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invalid Link — Pryme Labs</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #09090b; color: #e4e4e7; font-family: Inter, Arial, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #12121f; border: 1px solid #1e1e2e; border-radius: 20px; max-width: 480px; width: 100%; padding: 40px 32px; text-align: center; }
    .logo { font-size: 22px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 28px; }
    .logo span { color: #3b82f6; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 800; color: #ef4444; margin-bottom: 12px; }
    p { color: #71717a; font-size: 15px; line-height: 1.6; }
    a { display: inline-block; margin-top: 24px; color: #3b82f6; font-size: 14px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">PRYME<span>LABS</span></div>
    <div class="icon">⚠️</div>
    <h1>Invalid Link</h1>
    <p>${msg || 'This unsubscribe link is invalid or has already been used. Please contact support if you need help.'}</p>
    <a href="https://prymelabs.cc/shop">← Back to Shop</a>
  </div>
</body>
</html>`, { status: 400, headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const uid = url.searchParams.get('uid')
  const tok = url.searchParams.get('tok')

  if (!uid || !tok) return errorPage('Missing required parameters.')

  const user = await env.DB.prepare(
    'SELECT id, email, lang FROM users WHERE id = ?'
  ).bind(Number(uid)).first()

  if (!user || !user.email) return errorPage('Account not found.')

  const valid = await verifyUnsubToken(uid, user.email, tok, env.JWT_SECRET)
  if (!valid) return errorPage('This link is invalid or expired.')

  await env.DB.prepare(
    'UPDATE users SET email_unsubscribed = 1, sms_unsubscribed = 1 WHERE id = ?'
  ).bind(Number(uid)).run()

  return successPage(user.lang || 'en')
}
