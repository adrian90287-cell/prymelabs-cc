import { corsHeaders, json } from '../../_utils/cors.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

async function translateToSpanish(env, text) {
  if (!text || !env.AI) return null
  try {
    const resp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        {
          role: 'system',
          content: 'You are a professional Spanish translator for a scientific research supply company. Translate the text accurately to Spanish. Keep compound names, abbreviations (GLP-1, BPC, etc.) and scientific terms in their original form. Output only the translation — no explanations, no quotes, no extra text.',
        },
        { role: 'user', content: text },
      ],
      max_tokens: 400,
    })
    return resp?.response?.trim() || null
  } catch {
    return null
  }
}

export async function onRequestPost({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  // Fetch all products missing a Spanish description
  const { results: products } = await env.DB.prepare(
    "SELECT id, description FROM products WHERE (description_es IS NULL OR description_es = '') AND description IS NOT NULL AND description != ''"
  ).all()

  if (!products || products.length === 0) {
    return json({ translated: 0, failed: 0, total: 0, message: 'All products already have Spanish descriptions.' })
  }

  let translated = 0
  let failed = 0
  const BATCH_SIZE = 5

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE)

    // Translate each product in this batch (parallel within batch)
    const results = await Promise.allSettled(
      batch.map(async (p) => {
        const es = await translateToSpanish(env, p.description)
        if (es) {
          await env.DB.prepare('UPDATE products SET description_es = ? WHERE id = ?')
            .bind(es, p.id)
            .run()
          return true
        }
        return false
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value === true) translated++
      else failed++
    }
  }

  return json({ translated, failed, total: products.length })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
