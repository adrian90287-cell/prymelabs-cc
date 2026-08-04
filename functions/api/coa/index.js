import { corsHeaders, json } from '../../_utils/cors.js'
import { isContentAuthed } from '../../_utils/contentAuth.js'

export async function onRequestGet({ request, env }) {
  if (!(await isContentAuthed(request, env))) return json({ error: 'Unauthorized' }, 401)
  const setting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'coa_enabled'").first()
  if (setting?.value !== '1') return json({ documents: [] })

  const { results } = await env.DB.prepare(
    `SELECT id, title, description, file_key, file_type
     FROM coa_documents WHERE enabled = 1 ORDER BY title ASC`
  ).all()
  return json({ documents: results || [] })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
