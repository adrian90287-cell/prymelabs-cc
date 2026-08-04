export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = btoa(String.fromCharCode(...salt));

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    { name: 'PBKDF2' }, false, ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key, 256
  );

  return {
    hash: btoa(String.fromCharCode(...new Uint8Array(bits))),
    salt: saltB64,
  };
}

export async function verifyPassword(password, storedHash, storedSalt) {
  const salt = Uint8Array.from(atob(storedSalt), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    { name: 'PBKDF2' }, false, ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key, 256
  );

  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return hash === storedHash;
}

// Generate a URL-safe random token (used for password-reset links).
export function generateToken(bytes = 32) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// SHA-256 hex digest of a string. We store the hash of a reset token (never the
// raw token) so a database leak can't be replayed to take over an account.
export async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// HMAC-SHA256 hex of a message with a server secret. Used to sign tamper-proof
// action links (e.g. one-tap "confirm payment") that travel in email/SMS.
export async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(message)));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
