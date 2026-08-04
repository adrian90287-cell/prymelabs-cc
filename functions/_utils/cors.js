// The real frontend always calls its own API same-origin, which the browser
// never subjects to CORS checks at all — this header only ever matters for a
// THIRD-PARTY origin trying to call the API cross-origin from someone else's
// page, which is exactly what should be blocked. Restricting it away from
// '*' has zero effect on the real app, preview deployments, or local dev,
// since all of those are same-origin relative to whatever host is serving
// the page that made the request.
export const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://prymelabs.cc',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      // public/_headers only covers static assets, not Function responses —
      // add the safe, behavior-neutral security headers here too.
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}
