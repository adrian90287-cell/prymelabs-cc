// Serves product/hero images from R2. Public and aggressively cacheable —
// unlike /api/products (gated, protects pricing/catalog structure from casual
// scraping), individual product photos aren't sensitive, and plain <img src>
// tags can't send an Authorization header anyway. Keys are random, not
// sequential, so the bucket can't be casually enumerated.
export async function onRequestGet({ params, env }) {
  const key = params.key
  const obj = await env.IMAGES_BUCKET.get(key)
  if (!obj) return new Response('Not found', { status: 404 })

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
