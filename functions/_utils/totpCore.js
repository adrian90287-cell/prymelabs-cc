// RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) — Web Crypto only, no dependencies.
// This is the actual cryptographic core; keep it framework-agnostic and covered
// by tests against the official RFC 6238 test vectors before it's ever wired
// into an auth flow.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes) {
  let bits = 0, value = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  while (output.length % 8) output += '=';
  return output;
}

export function base32Decode(str) {
  const clean = str.toUpperCase().replace(/=+$/, '');
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue; // skip whitespace/formatting characters
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function hmacSha1(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, msgBytes);
  return new Uint8Array(sig);
}

// counter → 8-byte big-endian buffer (RFC 4226 §5.2)
function counterToBytes(counter) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // JS numbers are safe integers well past any realistic 30s-step counter value,
  // so a 32-bit low word is enough; high word stays 0.
  view.setUint32(4, counter, false);
  return new Uint8Array(buf);
}

export async function generateTOTPCode(base32Secret, counter, digits = 6) {
  const key = base32Decode(base32Secret);
  const msg = counterToBytes(counter);
  const hmac = await hmacSha1(key, msg);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  const code = (binary % 10 ** digits).toString().padStart(digits, '0');
  return code;
}

function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// Accepts a code from the current 30s step or one step before/after, to tolerate clock skew.
export async function verifyTOTP(code, base32Secret, window = 1) {
  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    const expected = await generateTOTPCode(base32Secret, counter + i);
    if (constantTimeCompare(code, expected)) return true;
  }
  return false;
}
