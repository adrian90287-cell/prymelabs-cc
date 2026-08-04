// Pryme Labs scheduled "alarm clock" Worker.
//
// Cloudflare Pages can't run cron, so this tiny standalone Worker fires on a
// schedule and calls the secured Pages endpoint that does the real work
// (payment reminders + auto-cancelling unpaid orders). All DB/email logic and
// secrets live in the Pages project — this Worker only holds CRON_SECRET.

async function hit(url, env) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}`, 'Content-Type': 'application/json' },
  })
  let body = null
  try { body = await res.json() } catch {}
  return { status: res.status, body }
}

// Hourly → pending maintenance; daily 13:00 UTC → owner digest + review requests.
async function trigger(env, cron) {
  if (cron === '0 13 * * *') return hit(env.DIGEST_URL, env)
  return hit(env.TARGET_URL, env)
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(trigger(env, event.cron))
  },

  // Optional manual trigger for testing: GET/POST with ?key=<CRON_SECRET>
  // or an "Authorization: Bearer <CRON_SECRET>" header.
  async fetch(request, env) {
    const url = new URL(request.url)
    const key = url.searchParams.get('key') || (request.headers.get('Authorization') || '').replace(/^Bearer\s+/, '')
    if (!env.CRON_SECRET || key !== env.CRON_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }
    // ?job=digest tests the daily digest; otherwise runs pending maintenance
    const job = url.searchParams.get('job')
    const result = job === 'digest' ? await hit(env.DIGEST_URL, env) : await hit(env.TARGET_URL, env)
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
}
