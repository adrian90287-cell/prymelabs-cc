import { corsHeaders, json } from '../../_utils/cors.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'
import { canJoinDepartmentWaitlist, ensureDepartmentWaitlistTable } from '../../_utils/departmentWaitlist.js'

export async function onRequestPost({ request, env }) {
  const rl = await checkRateLimit(env, rateLimitKey(request, 'dept-waitlist'))
  if (rl.blocked) return json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const department = String(body.department || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  if (!canJoinDepartmentWaitlist(department)) return json({ error: 'Invalid department' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Valid email required' }, 400)

  await ensureDepartmentWaitlistTable(env)
  await env.DB.prepare(
    'INSERT OR IGNORE INTO department_waitlist (department, email) VALUES (?, ?)'
  ).bind(department, email).run()

  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
