// Pryme Labs payment-notification Email Worker.
//
// Cloudflare Email Routing delivers payment-notification emails (Zelle / Cash
// App / Venmo) to this Worker. It extracts the order number (which customers
// put in the payment memo) and the dollar amount, then POSTs them to the
// secured ingest endpoint on the Pages project, which matches the order and
// marks it Paid. Nothing here touches the DB directly — the secret-protected
// endpoint owns all the order logic.

// Minimal quoted-printable decode so "=24" -> "$" and soft line breaks vanish.
function qpDecode(s) {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function detectProvider(from, subject) {
  const hay = `${from} ${subject}`.toLowerCase()
  if (hay.includes('venmo')) return 'venmo'
  if (hay.includes('cash app') || hay.includes('cashapp') || hay.includes('square')) return 'cashapp'
  if (hay.includes('zelle')) return 'zelle'
  return 'unknown'
}

export default {
  async email(message, env, ctx) {
    let raw = ''
    try { raw = await new Response(message.raw).text() } catch {}
    const text = qpDecode(raw)

    // Order numbers look like PL-00123 (customers add this to the memo).
    const orderMatch = text.match(/PL-\d{4,6}/i)
    // First dollar amount with cents.
    const amtMatch = text.match(/\$\s*([0-9][0-9,]*\.[0-9]{2})/)

    const from = message.from || ''
    const subject = (message.headers && message.headers.get('subject')) || ''

    const payload = {
      provider: detectProvider(from, subject),
      order_number: orderMatch ? orderMatch[0].toUpperCase() : null,
      amount: amtMatch ? Number(amtMatch[1].replace(/,/g, '')) : null,
      from,
      subject,
    }

    ctx.waitUntil(
      fetch(env.INGEST_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.PAYMENT_INGEST_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {})
    )
  },
}
