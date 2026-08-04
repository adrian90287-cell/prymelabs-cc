// TEMPORARY debug endpoint - remove after diagnosing JWT verification issue
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function onRequestGet({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return new Response(JSON.stringify({ error: 'no token' }), { status: 400 });

  const parts = token.split('.');
  const msg = parts[0] + '.' + parts[1];
  const secret = env.JWT_SECRET || 'dev-secret-key';

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const expectedSig = base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));

  let payload = null;
  try {
    payload = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    ));
  } catch (e) {
    payload = { decodeError: e.message };
  }

  return new Response(JSON.stringify({
    tokenParts: parts.length,
    receivedSig: parts[2],
    expectedSig,
    match: expectedSig === parts[2],
    secretSet: !!env.JWT_SECRET,
    secretLength: secret.length,
    payload,
    now: Math.floor(Date.now() / 1000),
  }, null, 2), { headers: { 'Content-Type': 'application/json' } });
}
