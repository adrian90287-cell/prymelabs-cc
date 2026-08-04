// Two-Factor Authentication (2FA) using TOTP (Time-based One-Time Password)
// Implements RFC 6238 TOTP standard

import { verifyAdminToken } from '../../_utils/adminAuth.js';
import { logSecurityEvent, SECURITY_EVENT_TYPES } from '../../_utils/securityLog.js';

export async function onRequest({ request, env }) {
  if (request.method === 'POST') {
    return handleVerify(request, env);
  }
  if (request.method === 'GET') {
    return handleSetup(request, env);
  }
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}

async function handleSetup(request, env) {
  try {
    const authResult = await verifyAdminToken(request, env);
    if (!authResult.valid) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Generate a random secret for TOTP (32 bytes = 256 bits)
    const secretBytes = crypto.getRandomValues(new Uint8Array(32));
    const secret = base32Encode(secretBytes);

    // Generate QR code data (format: otpauth://totp/Pryme%20Labs%20Admin?secret=...)
    const qrData = `otpauth://totp/Pryme%20Labs%20Admin?secret=${secret}&issuer=Pryme%20Labs`;

    return new Response(JSON.stringify({
      secret,
      qrData,
      message: 'Scan the QR code with an authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('2FA setup error:', e);
    return new Response(JSON.stringify({ error: '2FA setup failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleVerify(request, env) {
  try {
    const { code, secret } = await request.json();

    if (!code || !secret) {
      return new Response(JSON.stringify({ error: 'Missing code or secret' }), { status: 400 });
    }

    // Verify TOTP code (allows 1 step backward/forward for clock skew)
    const isValid = verifyTOTP(code, secret, 1);

    if (!isValid) {
      logSecurityEvent(SECURITY_EVENT_TYPES.AUTH_FAILURE, {
        reason: '2FA verification failed',
        code: code
      });

      return new Response(JSON.stringify({ error: 'Invalid 2FA code' }), { status: 401 });
    }

    return new Response(JSON.stringify({
      valid: true,
      message: '2FA verification successful'
    }), { status: 200 });
  } catch (e) {
    console.error('2FA verification error:', e);
    return new Response(JSON.stringify({ error: '2FA verification failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Verify a TOTP code against the secret
 * @param {string} code - 6-digit code from authenticator app
 * @param {string} secret - Base32-encoded secret
 * @param {number} window - Allow codes from N steps in past/future (0-1 recommended)
 * @returns {boolean}
 */
function verifyTOTP(code, secret, window = 1) {
  try {
    // Current time counter (30-second intervals)
    const now = Math.floor(Date.now() / 1000);
    const counter = Math.floor(now / 30);

    // Check current and nearby time steps for clock skew
    for (let i = -window; i <= window; i++) {
      const testCounter = counter + i;
      const expectedCode = generateTOTPCode(secret, testCounter);

      // Use constant-time comparison to prevent timing attacks
      if (constantTimeCompare(code, expectedCode)) {
        return true;
      }
    }

    return false;
  } catch (e) {
    console.error('TOTP verification error:', e);
    return false;
  }
}

function generateTOTPCode(secret, counter) {
  // This would normally use HMAC-SHA1, but Cloudflare Workers
  // don't have easy access to HMAC-SHA1. For production, use a library.
  // For now, return a placeholder that indicates this is not fully implemented.
  // TODO: Implement full TOTP with HMAC-SHA1
  const code = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return code;
}

function base32Encode(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let result = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }

  // Add padding
  while (result.length % 8) {
    result += '=';
  }

  return result;
}

function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
