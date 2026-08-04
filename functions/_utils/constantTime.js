// Constant-time comparison utility to prevent timing attacks
// Essential for security-sensitive operations like token/signature verification

/**
 * Compare two strings in constant time to prevent timing attacks.
 * Takes roughly the same time regardless of where strings differ.
 *
 * @param {string} a - First string to compare
 * @param {string} b - Second string to compare
 * @returns {boolean} - True if strings are equal
 */
export function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  // Always compare full lengths even if they differ
  const aLen = a.length;
  const bLen = b.length;
  const minLen = Math.min(aLen, bLen);

  let result = aLen === bLen ? 0 : 1;

  // Compare byte-by-byte in constant time
  for (let i = 0; i < minLen; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Compare two Uint8Array buffers in constant time.
 * Useful for comparing cryptographic signatures and tokens.
 *
 * @param {Uint8Array} a - First buffer
 * @param {Uint8Array} b - Second buffer
 * @returns {boolean} - True if buffers are equal
 */
export function constantTimeBufferCompare(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
    return false;
  }

  const aLen = a.length;
  const bLen = b.length;
  const minLen = Math.min(aLen, bLen);

  let result = aLen === bLen ? 0 : 1;

  for (let i = 0; i < minLen; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

/**
 * Hash-based HMAC comparison in constant time.
 * Use this when comparing HMAC signatures.
 *
 * @param {string} signature1 - First signature (base64url format)
 * @param {string} signature2 - Second signature (base64url format)
 * @returns {boolean} - True if signatures match
 */
export function constantTimeHMACCompare(signature1, signature2) {
  return constantTimeCompare(signature1, signature2);
}
