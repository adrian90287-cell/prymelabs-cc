// CSRF token endpoint - issues tokens for state-changing operations
import { createCSRFToken } from '../_utils/csrf.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    // Generate a session ID from the request (IP + User-Agent hash)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    const sessionIdMsg = `${ip}::${userAgent}`;

    const sessionKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionIdMsg));
    const sessionId = Array.from(new Uint8Array(sessionKey))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);

    // Generate CSRF token
    const token = await createCSRFToken(sessionId, env.JWT_SECRET || 'dev-secret-key');

    return new Response(JSON.stringify({
      token,
      sessionId
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    console.error('CSRF token generation error:', e);
    return new Response(JSON.stringify({ error: 'Token generation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
