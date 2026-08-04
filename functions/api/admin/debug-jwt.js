// TEMPORARY debug endpoint - remove after diagnosing JWT verification issue
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return new Response(JSON.stringify({ error: 'no token', authHeaderPresent: !!auth }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const parts = token.split('.');
    const secret = env.JWT_SECRET || 'dev-secret-key';

    let expectedSig = null, sigError = null;
    try {
      const msg = parts[0] + '.' + parts[1];
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      expectedSig = base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
    } catch (e) {
      sigError = e.message;
    }

    let payload = null, payloadError = null;
    try {
      payload = JSON.parse(new TextDecoder().decode(
        Uint8Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
      ));
    } catch (e) {
      payloadError = e.message;
    }

    return new Response(JSON.stringify({
      tokenLength: token.length,
      tokenParts: parts.length,
      receivedSig: parts[2],
      expectedSig,
      sigError,
      match: expectedSig === parts[2],
      secretSet: !!env.JWT_SECRET,
      secretLength: secret.length,
      payload,
      payloadError,
      now: Math.floor(Date.now() / 1000),
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ fatalError: e.message, stack: e.stack }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
