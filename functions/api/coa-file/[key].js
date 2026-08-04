import { corsHeaders } from '../../_utils/cors.js'

export async function onRequestGet({ params, env }) {
  const key = params.key
  const doc = await env.DB.prepare(
    `SELECT cd.file_type FROM coa_documents cd, settings s
     WHERE cd.file_key = ? AND cd.enabled = 1 AND s.key = 'coa_enabled' AND s.value = '1'`
  ).bind(key).first()
  if (!doc) return new Response('Not found', { status: 404 })

  const obj = await env.COA_BUCKET.get(key)
  if (!obj) return new Response('Not found', { status: 404 })

  return new Response(obj.body, {
    headers: {
      'Content-Type': doc.file_type || obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
      ...corsHeaders,
    },
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
