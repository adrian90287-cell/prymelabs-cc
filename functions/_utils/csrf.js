// CSRF token generation and validation

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function generateCSRFToken() {
  // Generate 32 random bytes
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64url(bytes);
}

export async function createCSRFToken(sessionId, secret) {
  const token = await generateCSRFToken();
  const timestamp = Math.floor(Date.now() / 1000);

  // Create HMAC of (token + sessionId + timestamp) for validation
  const msg = `${token}.${sessionId}.${timestamp}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));

  return `${msg}.${base64url(sig)}`;
}

export async function validateCSRFToken(token, sessionId, secret, maxAge = 3600) {
  try {
    const parts = token.split('.');
    if (parts.length !== 4) return false;

    const [tokenPart, sessionIdPart, timestampPart, sig] = parts;

    // Verify sessionId matches
    if (sessionIdPart !== sessionId) return false;

    // Check token age (max 1 hour by default)
    const timestamp = parseInt(timestampPart);
    const now = Math.floor(Date.now() / 1000);
    if (now - timestamp > maxAge) return false;

    // Verify HMAC signature
    const msg = `${tokenPart}.${sessionIdPart}.${timestampPart}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);

    const expectedSig = base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));

    return expectedSig === sig;
  } catch (e) {
    return false;
  }
}
