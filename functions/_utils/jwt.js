export async function signJWT(payload, secret) {
  const encoder = new TextEncoder();
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return `${data}.${rawB64url(sig)}`;
}

// Takes `env` (not just the secret) so it can also enforce token_version —
// bumping a user's token_version (done on password reset) instantly
// invalidates every JWT issued before that point, even though JWTs are
// otherwise stateless and would keep working until their 30-day expiry.
// Tokens signed before this check existed carry no `tv` claim; those are
// treated as version 0, matching the column default, so they keep working
// until the next password reset for that account.
export async function verifyJWT(token, env) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [h, p, s] = parts;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(env.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['verify']
  );

  let sigBytes;
  try {
    sigBytes = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  } catch {
    return null;
  }

  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(`${h}.${p}`));
  if (!valid) return null;

  try {
    const payload = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    if (payload.sub != null) {
      const row = await env.DB.prepare('SELECT token_version FROM users WHERE id = ?').bind(payload.sub).first();
      if (!row) return null; // user deleted since token was issued
      const currentVersion = row.token_version || 0;
      const tokenVersion = payload.tv || 0;
      if (tokenVersion !== currentVersion) return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function b64url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function rawB64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
