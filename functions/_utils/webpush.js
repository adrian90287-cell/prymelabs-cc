/**
 * Web Push utility — RFC 8291 (aes128gcm content encryption) + RFC 8292 (VAPID)
 * Pure Web Crypto API — compatible with Cloudflare Workers
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function b64u(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromB64u(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

function concat(...arrays) {
  const len = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const a of arrays) { out.set(a, off); off += a.length }
  return out
}

function u32be(n) {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n, false)
  return b
}

const enc = new TextEncoder()

// ─── HKDF ─────────────────────────────────────────────────────────────────────

async function hkdfExtract(salt, ikm) {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const prk = await crypto.subtle.sign('HMAC', key, ikm)
  return new Uint8Array(prk)
}

async function hkdfExpand(prk, info, length) {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const out = new Uint8Array(length)
  let prev = new Uint8Array(0)
  let pos = 0
  for (let i = 1; pos < length; i++) {
    const t = new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(prev, info, new Uint8Array([i]))))
    const take = Math.min(t.length, length - pos)
    out.set(t.subarray(0, take), pos)
    prev = t
    pos += take
  }
  return out
}

// ─── Encrypt payload (RFC 8291 aes128gcm) ────────────────────────────────────

async function encryptPayload(subscription, plaintext) {
  const { keys: { p256dh, auth } } = subscription

  const receiverPub = fromB64u(p256dh)
  const authSecret  = fromB64u(auth)

  // Generate ephemeral sender ECDH key pair
  const senderPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const senderPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', senderPair.publicKey))

  // Import receiver's public key
  const receiverKey = await crypto.subtle.importKey(
    'raw', receiverPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  )

  // ECDH shared secret
  const ecdhBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverKey }, senderPair.privateKey, 256
  ))

  // PRK_key = HKDF-Extract(auth_secret, ecdh_secret)
  const prkKey = await hkdfExtract(authSecret, ecdhBits)

  // key_info = "WebPush: info\0" || receiverPub || senderPub
  const keyInfo = concat(enc.encode('WebPush: info\0'), receiverPub, senderPubRaw)

  // IKM = HKDF-Expand(PRK_key, key_info, 32)
  const ikm = await hkdfExpand(prkKey, keyInfo, 32)

  // Random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // PRK = HKDF-Extract(salt, ikm)
  const prk = await hkdfExtract(salt, ikm)

  // CEK = HKDF-Expand(prk, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo   = enc.encode('Content-Encoding: aes128gcm\0')
  const cek       = await hkdfExpand(prk, cekInfo, 16)

  // Nonce = HKDF-Expand(prk, "Content-Encoding: nonce\0", 12)
  const nonceInfo = enc.encode('Content-Encoding: nonce\0')
  const nonce     = await hkdfExpand(prk, nonceInfo, 12)

  // Encrypt: plaintext || 0x02 padding delimiter
  const pt = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext
  const paddedPt = concat(pt, new Uint8Array([0x02]))

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aesKey, paddedPt
  ))

  // Header: salt(16) + rs=4096 as u32be(4) + keyidlen=65(1) + senderPub(65)
  const header = concat(salt, u32be(4096), new Uint8Array([65]), senderPubRaw)
  return concat(header, ciphertext)
}

// ─── VAPID JWT (RFC 8292) ─────────────────────────────────────────────────────

async function vapidAuth(endpoint, publicKeyB64u, privateKeyB64u, email) {
  const origin = new URL(endpoint).origin

  // Decode VAPID keys
  const pubRaw  = fromB64u(publicKeyB64u)   // 65-byte uncompressed P-256 point
  const privRaw = fromB64u(privateKeyB64u)  // 32-byte scalar

  // Build JWK for private key import (PKCS#8 not directly available for raw P-256)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: b64u(privRaw),
    x: b64u(pubRaw.slice(1, 33)),
    y: b64u(pubRaw.slice(33, 65)),
    ext: true,
  }
  const sigKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])

  const header  = { typ: 'JWT', alg: 'ES256' }
  const payload = { aud: origin, exp: Math.floor(Date.now() / 1000) + 43200, sub: `mailto:${email}` }

  const headerB64  = b64u(enc.encode(JSON.stringify(header)))
  const payloadB64 = b64u(enc.encode(JSON.stringify(payload)))
  const sigInput   = enc.encode(`${headerB64}.${payloadB64}`)

  const sigDer = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sigKey, sigInput))

  // DER → raw R||S (each 32 bytes)
  const rs = derToRaw(sigDer)
  const jwt = `${headerB64}.${payloadB64}.${b64u(rs)}`

  return `vapid t=${jwt},k=${publicKeyB64u}`
}

// Convert DER-encoded ECDSA signature to raw R||S
function derToRaw(der) {
  // DER: 0x30 len 0x02 rLen r... 0x02 sLen s...
  let off = 2
  const rLen = der[off + 1]; off += 2
  const r = der.slice(off, off + rLen); off += rLen
  const sLen = der[off + 1]; off += 2
  const s = der.slice(off, off + sLen)

  // Trim/pad to exactly 32 bytes each
  const pad = (arr) => {
    const a = arr[0] === 0 ? arr.slice(1) : arr  // remove leading 0x00
    const out = new Uint8Array(32)
    out.set(a.slice(-32), 32 - Math.min(a.length, 32))
    return out
  }
  return concat(pad(r), pad(s))
}

// ─── Send a single push message ───────────────────────────────────────────────

export async function sendPush(env, subscriptionJson, payload) {
  const subscription = typeof subscriptionJson === 'string'
    ? JSON.parse(subscriptionJson)
    : subscriptionJson

  const { endpoint } = subscription
  const body    = await encryptPayload(subscription, JSON.stringify(payload))
  const vapid   = await vapidAuth(endpoint, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.OWNER_EMAIL || 'admin@prymelabs.cc')

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization':     vapid,
      'Content-Type':      'application/octet-stream',
      'Content-Encoding':  'aes128gcm',
      'TTL':               '86400',
    },
    body,
  })

  if (res.status === 410 || res.status === 404) {
    return { ok: false, gone: true, status: res.status }
  }
  if (!res.ok) {
    return { ok: false, error: `Push failed: ${res.status}`, status: res.status }
  }
  return { ok: true }
}

// ─── Broadcast to all stored subscriptions ────────────────────────────────────

export async function pushToAll(env, payload) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return   // not configured

  let rows
  try {
    const result = await env.DB.prepare('SELECT id, subscription_json FROM push_subscriptions').all()
    rows = result.results || []
  } catch { return }

  const gone = []
  await Promise.allSettled(
    rows.map(async row => {
      const result = await sendPush(env, row.subscription_json, payload).catch(() => ({ ok: false }))
      if (result.gone) gone.push(row.id)
    })
  )

  // Clean up expired subscriptions
  if (gone.length > 0) {
    await Promise.allSettled(
      gone.map(id => env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(id).run())
    )
  }
}
