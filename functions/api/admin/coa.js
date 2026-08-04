import { corsHeaders, json } from '../../_utils/cors.js'

function adminAuth(request, env) {
  const auth = request.headers.get('Authorization') || ''
  return auth === `Bearer admin:${env.ADMIN_PASSWORD}`
}

const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB

export async function onRequestGet({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  const { results } = await env.DB.prepare(
    'SELECT * FROM coa_documents ORDER BY title ASC'
  ).all()
  return json({ documents: results || [] })
}

export async function onRequestPost({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let form
  try { form = await request.formData() } catch { return json({ error: 'Invalid form data' }, 400) }

  const title = (form.get('title') || '').toString().trim()
  const description = (form.get('description') || '').toString().trim()
  const file = form.get('file')
  if (!title) return json({ error: 'title required' }, 400)
  if (!(file instanceof File) || !file.size) return json({ error: 'file required' }, 400)
  if (file.size > MAX_FILE_SIZE) return json({ error: 'file too large (max 15MB)' }, 400)

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
  const key = `${crypto.randomUUID()}.${ext}`
  await env.COA_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  })

  const now = Math.floor(Date.now() / 1000)
  await env.DB.prepare(
    `INSERT INTO coa_documents (title, description, file_key, file_type, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  ).bind(title, description, key, file.type || '', now, now).run()

  return json({ ok: true })
}

export async function onRequestPut({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let form
  try { form = await request.formData() } catch { return json({ error: 'Invalid form data' }, 400) }

  const id = Number(form.get('id'))
  if (!id) return json({ error: 'id required' }, 400)

  const title = (form.get('title') || '').toString().trim()
  const description = (form.get('description') || '').toString().trim()
  const enabled = form.get('enabled') === '1' ? 1 : 0
  const file = form.get('file')
  if (!title) return json({ error: 'title required' }, 400)

  const existing = await env.DB.prepare('SELECT file_key FROM coa_documents WHERE id = ?').bind(id).first()
  if (!existing) return json({ error: 'not found' }, 404)

  const now = Math.floor(Date.now() / 1000)
  let fileKey = existing.file_key
  let fileType

  if (file instanceof File && file.size) {
    if (file.size > MAX_FILE_SIZE) return json({ error: 'file too large (max 15MB)' }, 400)
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
    const newKey = `${crypto.randomUUID()}.${ext}`
    await env.COA_BUCKET.put(newKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    })
    await env.COA_BUCKET.delete(fileKey)
    fileKey = newKey
    fileType = file.type || ''
  }

  if (fileType !== undefined) {
    await env.DB.prepare(
      'UPDATE coa_documents SET title=?, description=?, enabled=?, file_key=?, file_type=?, updated_at=? WHERE id=?'
    ).bind(title, description, enabled, fileKey, fileType, now, id).run()
  } else {
    await env.DB.prepare(
      'UPDATE coa_documents SET title=?, description=?, enabled=?, updated_at=? WHERE id=?'
    ).bind(title, description, enabled, now, id).run()
  }

  return json({ ok: true })
}

export async function onRequestDelete({ request, env }) {
  if (!adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const { id } = body
  if (!id) return json({ error: 'id required' }, 400)

  const existing = await env.DB.prepare('SELECT file_key FROM coa_documents WHERE id = ?').bind(id).first()
  if (!existing) return json({ error: 'not found' }, 404)

  await env.COA_BUCKET.delete(existing.file_key)
  await env.DB.prepare('DELETE FROM coa_documents WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
