import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'
import { ensureDepartmentWaitlistTable, canJoinDepartmentWaitlist } from '../../_utils/departmentWaitlist.js'
import { sendEmail } from '../../_utils/email.js'
import { logAdminAudit } from '../../_utils/adminAudit.js'

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function validEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '').trim())
}

function launchHtml({ department, message }) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#09090b;font-family:Arial,sans-serif;color:#e4e4e7">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:28px 16px">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#12121f;border:1px solid #27272a;border-radius:18px;overflow:hidden">
          <tr><td style="padding:26px 30px;border-bottom:1px solid #27272a">
            <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:.12em">PRYME<span style="color:#3b82f6">LABS</span></div>
          </td></tr>
          <tr><td style="padding:30px">
            <p style="color:#60a5fa;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.14em;margin:0 0 8px">${esc(department)} Launch Update</p>
            <h1 style="color:#fff;font-size:24px;line-height:1.25;margin:0 0 18px">New products are on the way</h1>
            <div style="color:#a1a1aa;font-size:15px;line-height:1.7;margin:0 0 24px">${esc(message).replace(/\n/g, '<br>')}</div>
            <a href="https://prymelabs.cc/shop?dept=${encodeURIComponent(department)}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;font-size:14px;padding:14px 24px;border-radius:12px;text-decoration:none">Visit ${esc(department)}</a>
            <p style="color:#71717a;font-size:12px;line-height:1.6;margin:24px 0 0">You are receiving this because you asked to be notified when this Pryme Labs department launches.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`
}

async function authenticate(request, env) {
  const auth = await verifyAdminToken(request, env)
  if (!auth.valid) return { response: json({ error: auth.error || 'Unauthorized' }, auth.status || 401) }
  return { payload: auth.payload }
}

function runAll(stmt, params) {
  return params.length ? stmt.bind(...params).all() : stmt.all()
}

export async function onRequestGet({ request, env }) {
  const rl = await checkAdminRateLimit(env, adminRateLimitKey(request, 'department-waitlist:get'))
  if (rl.blocked) return json({ error: 'Rate limited' }, 429)
  const auth = await authenticate(request, env)
  if (auth.response) return auth.response

  await ensureDepartmentWaitlistTable(env)
  const url = new URL(request.url)
  const department = String(url.searchParams.get('department') || '').trim()
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase()

  const where = []
  const params = []
  if (department && department !== 'all') { where.push('department = ?'); params.push(department) }
  if (q) { where.push('(LOWER(email) LIKE ? OR LOWER(department) LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const signupStmt = env.DB.prepare(`
    SELECT id, department, email, created_at, notified_at
    FROM department_waitlist
    ${sqlWhere}
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `)

  const [{ results }, { results: summary }] = await Promise.all([
    runAll(signupStmt, params),
    env.DB.prepare(`
      SELECT department, COUNT(*) AS total, SUM(CASE WHEN notified_at IS NULL THEN 1 ELSE 0 END) AS unnotified
      FROM department_waitlist
      GROUP BY department
      ORDER BY department ASC
    `).all(),
  ])

  return json({ signups: results || [], summary: summary || [] })
}

export async function onRequestPost({ request, env, waitUntil }) {
  const rl = await checkAdminRateLimit(env, adminRateLimitKey(request, 'department-waitlist:post'))
  if (rl.blocked) return json({ error: 'Rate limited' }, 429)
  const auth = await authenticate(request, env)
  if (auth.response) return auth.response

  await ensureDepartmentWaitlistTable(env)
  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const action = String(body.action || '').trim()
  const now = Math.floor(Date.now() / 1000)

  if (action === 'mark-notified') {
    const id = Number(body.id || 0)
    if (!id) return json({ error: 'Signup id required' }, 400)
    await env.DB.prepare('UPDATE department_waitlist SET notified_at = ? WHERE id = ?').bind(now, id).run()
    waitUntil(logAdminAudit(env, request, auth.payload, 'department_waitlist.mark_notified', { target_type: 'department_waitlist', target_id: id }))
    return json({ ok: true })
  }

  if (action === 'delete') {
    const id = Number(body.id || 0)
    if (!id) return json({ error: 'Signup id required' }, 400)
    await env.DB.prepare('DELETE FROM department_waitlist WHERE id = ?').bind(id).run()
    waitUntil(logAdminAudit(env, request, auth.payload, 'department_waitlist.deleted', { target_type: 'department_waitlist', target_id: id }))
    return json({ ok: true })
  }

  if (action === 'send-launch') {
    const department = String(body.department || '').trim()
    const subject = String(body.subject || '').trim().slice(0, 140)
    const message = String(body.message || '').trim().slice(0, 2000)
    const testEmail = String(body.test_email || '').trim().toLowerCase()
    if (!canJoinDepartmentWaitlist(department)) return json({ error: 'Invalid department' }, 400)
    if (!subject || !message) return json({ error: 'Subject and message required' }, 400)

    if (testEmail) {
      if (!validEmail(testEmail)) return json({ error: 'Valid test email required' }, 400)
      const r = await sendEmail(env, {
        to: testEmail,
        subject,
        html: launchHtml({ department, message }),
        fromEmail: env.ANNOUNCE_FROM_EMAIL || 'news@prymelabs.net',
        fromName: env.STORE_NAME || 'Pryme Labs',
      })
      if (r?.error) return json({ error: `Test send failed: ${r.error}` }, 502)
      waitUntil(logAdminAudit(env, request, auth.payload, 'department_waitlist.test_launch_sent', { target_type: 'department', target_id: department, metadata: { to: testEmail } }))
      return json({ test: true, sent: 1 })
    }

    const { results: rows } = await env.DB.prepare(
      'SELECT id, email FROM department_waitlist WHERE department = ? AND notified_at IS NULL ORDER BY created_at ASC LIMIT 1000'
    ).bind(department).all()
    if (!rows || rows.length === 0) return json({ sent: 0, total: 0, message: 'No unnotified signups for this department' })

    const sends = await Promise.allSettled(rows.map(row => sendEmail(env, {
      to: row.email,
      subject,
      html: launchHtml({ department, message }),
      fromEmail: env.ANNOUNCE_FROM_EMAIL || 'news@prymelabs.net',
      fromName: env.STORE_NAME || 'Pryme Labs',
    }).catch(() => null)))
    const sent = sends.filter(r => r.status === 'fulfilled' && r.value && !r.value.error).length
    if (sent > 0) {
      await env.DB.prepare('UPDATE department_waitlist SET notified_at = ? WHERE department = ? AND notified_at IS NULL')
        .bind(now, department).run()
    }
    waitUntil(logAdminAudit(env, request, auth.payload, 'department_waitlist.launch_sent', { target_type: 'department', target_id: department, metadata: { sent, total: rows.length } }))
    return json({ sent, total: rows.length })
  }

  return json({ error: 'Invalid action' }, 400)
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
