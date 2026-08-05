/**
 * Professional document generators for OneDrive backup.
 * Each function returns an HTML string ready to be uploaded as a .html file.
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function safe(s, def = []) {
  try { return JSON.parse(s || 'null') || def } catch { return def }
}

function fmtDateTime(ts) {
  if (!ts) return new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })
  return new Date(ts * 1000).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })
}

function fmtDateShort(ts) {
  if (!ts) return new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium' })
  return new Date(ts * 1000).toLocaleDateString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium' })
}

const PAY_LABEL = { zelle: 'Zelle', cashapp: 'Cash App', venmo: 'Venmo' }

// True when an order is a Will Call (in-store pickup) order. Identified by the
// `-WC-` order-number prefix, the pickup marker in shipping_json, or the
// Will Call shipping-rate label — any one is sufficient for older/newer records.
// True if the order contains a research peptide (drives the research-only note
// on records). Legacy items with no department default to Peptides.
function hasPeptideItems(order) {
  const items = Array.isArray(order?.items) ? order.items : safe(order?.items_json, [])
  if (!items.length) return true
  return items.some(i => (i?.department || 'Peptides') === 'Peptides')
}

export function isWillCall(order) {
  if (!order) return false
  if (typeof order.order_number === 'string' && order.order_number.includes('-WC-')) return true
  const ship = order.shipping && typeof order.shipping === 'object' ? order.shipping : safe(order.shipping_json, {})
  return ship?.method === 'will_call' || ship?.pickup === true || order.shipping_rate_name === 'Will Call — Pickup'
}

const STATUS_STYLE = {
  pending:   { bg: '#fffbeb', border: '#fde68a', text: '#92400e',  badge: 'PENDING' },
  paid:      { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af',  badge: 'PAID' },
  fulfilled: { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1',  badge: 'FULFILLED' },
  shipped:   { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534',  badge: 'SHIPPED' },
  completed: { bg: '#ecfdf5', border: '#6ee7b7', text: '#064e3b',  badge: 'COMPLETED' },
  cancelled: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b',  badge: 'CANCELLED' },
  refunded:  { bg: '#f9fafb', border: '#e5e7eb', text: '#374151',  badge: 'REFUNDED' },
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER RECEIPT / INVOICE
// ─────────────────────────────────────────────────────────────────────────────

export function orderReceiptHtml(order) {
  const items      = Array.isArray(order.items) ? order.items : safe(order.items_json, [])
  const shipping   = order.shipping && typeof order.shipping === 'object' ? order.shipping : safe(order.shipping_json, {})
  const tracking   = order.tracking && typeof order.tracking === 'object' ? order.tracking : safe(order.tracking_json, {})

  const subtotal   = Number(order.subtotal || 0)
  const discount   = Number(order.discount_amount || 0)
  const shipCost   = Number(order.shipping_cost || 0)
  const taxAmount  = Number(order.tax_amount || 0)
  const total      = Number(order.order_total || order.subtotal || 0)
  const taxPct     = order.tax_rate ? ` (${(Number(order.tax_rate) * 100).toFixed(1)}%)` : ''
  const ss         = STATUS_STYLE[order.status] || STATUS_STYLE.pending
  const method     = PAY_LABEL[order.payment_method] || esc(order.payment_method || '')
  const willCall   = isWillCall(order)

  const addr = shipping.address
    ? `${esc(shipping.address)}${shipping.address2 ? ', ' + esc(shipping.address2) : ''}, ${esc(shipping.city)}, ${esc(shipping.state)} ${esc(shipping.zip)}`
    : '—'

  const itemRows = items.map(i => `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;color:#111827;font-size:13px">
        <strong>${esc(i.name)}</strong>${i.size ? ` <span style="color:#9ca3af;font-size:11px">(${esc(i.size)})</span>` : ''}
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:#374151;font-size:13px">${i.qty}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;text-align:right;color:#374151;font-size:13px">$${Number(i.price).toFixed(2)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:700;color:#111827;font-size:13px">$${(i.price * i.qty).toFixed(2)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Order Receipt — ${esc(order.order_number)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; }
    body { margin:0; padding:40px 20px; background:#f3f4f6; font-family:'Inter',Arial,sans-serif; color:#111827; }
    .card { max-width:720px; margin:0 auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.09); }
    table { border-collapse: collapse; }
    @media print { body { background:#fff; padding:0; } .card { box-shadow:none; border-radius:0; } }
  </style>
</head>
<body>
<div class="card">

  <!-- ── Header ── -->
  <div style="background:#0f172a;padding:28px 36px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
    <div>
      <div style="display:flex;align-items:center;gap:8px;color:#fff;font-size:22px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase"><img src="https://prymelabs.cc/logo-mark.png" alt="" style="height:22px;width:auto" />PRYME<span style="color:#3b82f6">LABS</span></div>
      <div style="color:#64748b;font-size:12px;margin-top:3px">prymelabs.cc · support@prymelabs.net · (346) 550-9100</div>
    </div>
    <div style="text-align:right">
      <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:600">${willCall ? 'Will Call Receipt' : 'Order Receipt'}</div>
      <div style="color:#60a5fa;font-size:22px;font-weight:900;font-family:monospace;margin-top:2px">${esc(order.order_number)}</div>
      <div style="color:#64748b;font-size:12px;margin-top:2px">${fmtDateTime(order.created_at)} CST</div>
      ${willCall ? '<div style="display:inline-block;margin-top:8px;background:#f59e0b;color:#0f172a;font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:0.08em">🏷️ Will Call · Pickup</div>' : ''}
    </div>
  </div>

  <!-- ── Status Banner ── -->
  <div style="background:${ss.bg};border-bottom:2px solid ${ss.border};padding:10px 36px;display:flex;align-items:center;gap:12px">
    <span style="background:${ss.border};color:${ss.text};font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:0.08em">${ss.badge}</span>
    <span style="color:${ss.text};font-size:13px;font-weight:500">
      ${order.paid_at ? `Paid ${fmtDateShort(order.paid_at)} · ` : ''}${order.shipped_at ? `Shipped ${fmtDateShort(order.shipped_at)} · ` : ''}Payment via <strong>${method}</strong>
    </span>
  </div>

  <!-- ── Customer & Shipping ── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e5e7eb">
    <div style="padding:24px 36px;border-right:1px solid #e5e7eb">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;margin-bottom:10px">Customer</div>
      <div style="font-weight:800;color:#111827;font-size:16px">${esc(order.customer_name)}</div>
      <div style="margin-top:4px"><a href="mailto:${esc(order.customer_email)}" style="color:#3b82f6;font-size:13px;text-decoration:none">${esc(order.customer_email)}</a></div>
      ${shipping.phone ? `<div style="color:#374151;font-size:13px;margin-top:3px">${esc(shipping.phone)}</div>` : ''}
      ${order.promo_code ? `<div style="margin-top:10px;font-size:12px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:5px 10px;border-radius:6px;font-weight:600;display:inline-block">Promo: ${esc(order.promo_code)} (−$${discount.toFixed(2)})</div>` : ''}
    </div>
    <div style="padding:24px 36px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;margin-bottom:10px">${willCall ? 'Fulfillment' : 'Ship To'}</div>
      ${willCall ? `
      <div style="font-weight:700;color:#111827;font-size:14px">🏷️ Will Call — In-Store Pickup</div>
      <div style="color:#6b7280;font-size:12px;line-height:1.7;margin-top:2px">Customer picks up in store · no shipment</div>
      ` : `
      ${shipping.name ? `<div style="font-weight:600;color:#111827;font-size:14px">${esc(shipping.name)}</div>` : ''}
      <div style="color:#374151;font-size:13px;line-height:1.7">${addr}</div>
      `}
      ${tracking.number ? `
      <div style="margin-top:12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:8px 12px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#0369a1;letter-spacing:0.1em;margin-bottom:3px">Tracking</div>
        <div style="color:#0c4a6e;font-family:monospace;font-weight:700;font-size:13px">${esc(tracking.carrier || '')} ${esc(tracking.number)}</div>
      </div>` : ''}
    </div>
  </div>

  <!-- ── Items ── -->
  <div style="padding:24px 36px;border-bottom:1px solid #e5e7eb">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;margin-bottom:14px">Items Ordered</div>
    <table width="100%" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Product</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Unit</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Line Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <!-- ── Pricing Summary ── -->
  <div style="padding:20px 36px;border-bottom:1px solid #e5e7eb">
    <div style="max-width:280px;margin-left:auto">
      <table width="100%">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Subtotal</td><td style="padding:4px 0;text-align:right;color:#374151;font-size:13px">$${subtotal.toFixed(2)}</td></tr>
        ${discount > 0 ? `<tr><td style="padding:4px 0;color:#059669;font-size:13px">Discount</td><td style="padding:4px 0;text-align:right;color:#059669;font-size:13px;font-weight:700">−$${discount.toFixed(2)}</td></tr>` : ''}
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px">${esc(order.shipping_rate_name || 'Shipping')}</td><td style="padding:4px 0;text-align:right;font-size:13px;${shipCost > 0 ? 'color:#374151' : 'color:#059669;font-weight:600'}">${shipCost > 0 ? '$' + shipCost.toFixed(2) : 'Free'}</td></tr>
        ${taxAmount > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Tax${taxPct}</td><td style="padding:4px 0;text-align:right;color:#374151;font-size:13px">$${taxAmount.toFixed(2)}</td></tr>` : ''}
        <tr><td colspan="2" style="padding:6px 0 0"><div style="border-top:2px solid #e5e7eb;margin:4px 0"></div></td></tr>
        <tr>
          <td style="padding:8px 0 4px;font-weight:900;color:#111827;font-size:16px;text-transform:uppercase;letter-spacing:0.06em">Total</td>
          <td style="padding:8px 0 4px;text-align:right;font-weight:900;font-size:24px;color:#1e40af">$${total.toFixed(2)}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- ── Footer ── -->
  <div style="background:#f9fafb;padding:16px 36px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <div style="font-size:11px;color:#9ca3af">
      ${hasPeptideItems(order) ? '⚠ All products are for <strong>research use only</strong>. Not for human consumption.<br>' : ''}
      © ${new Date().getFullYear()} Pryme Labs · <a href="https://prymelabs.cc/compliance" style="color:#3b82f6">Legal &amp; Compliance</a>
    </div>
    <div style="font-size:11px;color:#d1d5db;text-align:right">
      Backup generated ${fmtDateTime(null)} CST<br>
      <span style="font-family:monospace">ID: ${order.id || '—'}</span>
    </div>
  </div>

</div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER STATUS UPDATE RECORD  (full professional stage-transition document)
// ─────────────────────────────────────────────────────────────────────────────

export function statusUpdateHtml(order, newStatus, tracking = null) {
  const ss    = STATUS_STYLE[newStatus] || STATUS_STYLE.pending
  const prev  = STATUS_STYLE[order.status] || STATUS_STYLE.pending
  const items = Array.isArray(order.items) ? order.items : safe(order.items_json, [])
  const ship  = order.shipping && typeof order.shipping === 'object' ? order.shipping : safe(order.shipping_json, {})
  const trk   = tracking || (order.tracking_json ? safe(order.tracking_json, {}) : {})

  const total     = Number(order.order_total || order.subtotal || 0)
  const subtotal  = Number(order.subtotal || 0)
  const discount  = Number(order.discount_amount || 0)
  const shipCost  = Number(order.shipping_cost || 0)
  const taxAmt    = Number(order.tax_amount || 0)
  const method    = PAY_LABEL[order.payment_method] || esc(order.payment_method || '')

  const itemRows = items.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#111827;font-size:13px">
        <strong>${esc(i.name)}</strong>${i.size ? ` <span style="color:#9ca3af;font-size:11px">(${esc(i.size)})</span>` : ''}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:#374151;font-size:13px">${i.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:700;color:#111827;font-size:13px">$${(Number(i.price) * i.qty).toFixed(2)}</td>
    </tr>`).join('')

  const addr = ship.address
    ? `${esc(ship.address)}${ship.address2 ? ', ' + esc(ship.address2) : ''}, ${esc(ship.city)}, ${esc(ship.state)} ${esc(ship.zip)}`
    : '—'

  const STAGE_LABEL = {
    pending: 'Order Received', paid: 'Payment Verified', fulfilled: 'Order Fulfilled',
    shipped: 'Order Shipped', completed: 'Order Completed',
    cancelled: 'Order Cancelled', refunded: 'Refund Issued',
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Stage Update — ${esc(order.order_number)} → ${ss.badge}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing:border-box; }
    body { margin:0; padding:40px 20px; background:#f3f4f6; font-family:'Inter',Arial,sans-serif; color:#111827; }
    .card { max-width:700px; margin:0 auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.09); }
    @media print { body { background:#fff; padding:0; } .card { box-shadow:none; border-radius:0; } }
  </style>
</head>
<body>
<div class="card">

  <!-- ── Header ── -->
  <div style="background:#0f172a;padding:26px 36px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
    <div>
      <div style="display:flex;align-items:center;gap:8px;color:#fff;font-size:22px;font-weight:900;letter-spacing:0.1em"><img src="https://prymelabs.cc/logo-mark.png" alt="" style="height:22px;width:auto" />PRYME<span style="color:#3b82f6">LABS</span></div>
      <div style="color:#64748b;font-size:12px;margin-top:3px">prymelabs.cc · support@prymelabs.net</div>
    </div>
    <div style="text-align:right">
      <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:600">Stage Transition Log</div>
      <div style="color:#60a5fa;font-size:22px;font-weight:900;font-family:monospace;margin-top:2px">${esc(order.order_number)}</div>
      <div style="color:#64748b;font-size:12px;margin-top:2px">${fmtDateTime(null)} CST</div>
    </div>
  </div>

  <!-- ── Stage Transition Banner ── -->
  <div style="background:${ss.bg};border-bottom:3px solid ${ss.border};padding:18px 36px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:${ss.text};margin-bottom:8px">Status Change</div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="background:${prev.border};color:${prev.text};font-size:12px;font-weight:800;padding:4px 14px;border-radius:999px;text-transform:uppercase;letter-spacing:0.08em">${prev.badge}</span>
      <span style="color:#9ca3af;font-size:18px;font-weight:300">→</span>
      <span style="background:${ss.border};color:${ss.text};font-size:14px;font-weight:800;padding:5px 16px;border-radius:999px;text-transform:uppercase;letter-spacing:0.08em">${ss.badge}</span>
    </div>
    <div style="font-size:13px;color:${ss.text};margin-top:10px;font-weight:600">${STAGE_LABEL[newStatus] || ss.badge} — ${fmtDateTime(null)} CST</div>
    ${trk.number ? `
    <div style="margin-top:10px;background:rgba(255,255,255,0.6);border:1px solid ${ss.border};border-radius:8px;padding:8px 14px;display:inline-block">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:${ss.text};letter-spacing:0.1em">Tracking: </span>
      <span style="font-family:monospace;font-weight:800;font-size:13px;color:${ss.text}">${esc(trk.carrier || '')} ${esc(trk.number)}</span>
    </div>` : ''}
  </div>

  <!-- ── Customer & Shipping ── -->
  <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e5e7eb">
    <div style="padding:20px 36px;border-right:1px solid #e5e7eb">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;margin-bottom:8px">Customer</div>
      <div style="font-weight:800;color:#111827;font-size:15px">${esc(order.customer_name)}</div>
      <div style="margin-top:3px"><a href="mailto:${esc(order.customer_email)}" style="color:#3b82f6;font-size:13px;text-decoration:none">${esc(order.customer_email)}</a></div>
      ${ship.phone ? `<div style="color:#374151;font-size:13px;margin-top:2px">${esc(ship.phone)}</div>` : ''}
      <div style="margin-top:8px;font-size:12px;color:#6b7280">Ordered: ${fmtDateTime(order.created_at)}</div>
      ${order.paid_at ? `<div style="font-size:12px;color:#6b7280">Paid: ${fmtDateTime(order.paid_at)}</div>` : ''}
      ${order.fulfilled_at ? `<div style="font-size:12px;color:#6b7280">Fulfilled: ${fmtDateTime(order.fulfilled_at)}</div>` : ''}
      ${order.shipped_at ? `<div style="font-size:12px;color:#6b7280">Shipped: ${fmtDateTime(order.shipped_at)}</div>` : ''}
    </div>
    <div style="padding:20px 36px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;margin-bottom:8px">Ship To</div>
      ${ship.name ? `<div style="font-weight:600;color:#111827;font-size:14px">${esc(ship.name)}</div>` : ''}
      <div style="color:#374151;font-size:13px;line-height:1.7">${addr}</div>
      <div style="margin-top:10px;font-size:12px;color:#6b7280">
        <strong style="color:#374151">Payment:</strong> ${method}
        ${order.promo_code ? ` · <span style="color:#059669">Promo: ${esc(order.promo_code)}</span>` : ''}
      </div>
    </div>
  </div>

  <!-- ── Items ── -->
  <div style="padding:20px 36px;border-bottom:1px solid #e5e7eb">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;margin-bottom:12px">Items Ordered</div>
    <table width="100%" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;border-collapse:collapse">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Product</th>
          <th style="padding:9px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Qty</th>
          <th style="padding:9px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <!-- ── Order Total ── -->
  <div style="padding:16px 36px;border-bottom:1px solid #e5e7eb">
    <div style="max-width:260px;margin-left:auto">
      <table width="100%">
        <tr><td style="padding:3px 0;color:#6b7280;font-size:13px">Subtotal</td><td style="padding:3px 0;text-align:right;color:#374151;font-size:13px">$${subtotal.toFixed(2)}</td></tr>
        ${discount > 0 ? `<tr><td style="padding:3px 0;color:#059669;font-size:13px">Discount</td><td style="padding:3px 0;text-align:right;color:#059669;font-size:13px">−$${discount.toFixed(2)}</td></tr>` : ''}
        <tr><td style="padding:3px 0;color:#6b7280;font-size:13px">${esc(order.shipping_rate_name || 'Shipping')}</td><td style="padding:3px 0;text-align:right;font-size:13px;${shipCost > 0 ? 'color:#374151' : 'color:#059669'}">${shipCost > 0 ? '$' + shipCost.toFixed(2) : 'Free'}</td></tr>
        ${taxAmt > 0 ? `<tr><td style="padding:3px 0;color:#6b7280;font-size:13px">Tax</td><td style="padding:3px 0;text-align:right;color:#374151;font-size:13px">$${taxAmt.toFixed(2)}</td></tr>` : ''}
        <tr><td colspan="2" style="padding:4px 0"><div style="border-top:2px solid #e5e7eb"></div></td></tr>
        <tr>
          <td style="padding:6px 0 2px;font-weight:900;color:#111827;font-size:15px">Order Total</td>
          <td style="padding:6px 0 2px;text-align:right;font-weight:900;font-size:22px;color:#1e40af">$${total.toFixed(2)}</td>
        </tr>
      </table>
    </div>
  </div>

  ${order.notes ? `
  <!-- ── Notes ── -->
  <div style="padding:16px 36px;border-bottom:1px solid #e5e7eb;background:#fffbeb">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#92400e;margin-bottom:6px">Internal Notes</div>
    <div style="color:#78350f;font-size:13px;line-height:1.6">${esc(order.notes)}</div>
  </div>` : ''}

  <!-- ── Footer ── -->
  <div style="background:#f9fafb;padding:14px 36px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <div style="font-size:11px;color:#9ca3af">
      ${hasPeptideItems(order) ? '⚠ All products are for <strong>research use only</strong>. Not for human consumption.<br>' : ''}
      © ${new Date().getFullYear()} Pryme Labs · <a href="https://prymelabs.cc/compliance" style="color:#3b82f6">Legal &amp; Compliance</a>
    </div>
    <div style="font-size:11px;color:#d1d5db;text-align:right">
      Auto-backup ${fmtDateTime(null)} CST<br>
      <span style="font-family:monospace;font-size:10px">13 Admin/Status Logs/${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}</span>
    </div>
  </div>

</div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIBER RECORD
// ─────────────────────────────────────────────────────────────────────────────

export function subscriberRecordHtml(user) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Subscriber — ${esc(user.name)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
    body { margin:0; padding:40px 20px; background:#f3f4f6; font-family:'Inter',Arial,sans-serif; }
  </style>
</head>
<body>
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">

  <div style="background:#0f172a;padding:22px 30px;display:flex;justify-content:space-between;align-items:center">
    <div style="display:flex;align-items:center;gap:7px;color:#fff;font-size:18px;font-weight:900;letter-spacing:0.1em"><img src="https://prymelabs.cc/logo-mark.png" alt="" style="height:18px;width:auto" />PRYME<span style="color:#3b82f6">LABS</span></div>
    <div style="color:#64748b;font-size:12px">Subscriber Record</div>
  </div>

  <div style="background:#f0fdf4;border-bottom:2px solid #bbf7d0;padding:20px 30px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#166534;margin-bottom:6px">New Subscriber</div>
    <div style="font-size:26px;font-weight:900;color:#166534">${esc(user.name)}</div>
    <div style="font-size:12px;color:#166534;margin-top:4px;opacity:0.75">${fmtDateTime(null)} CST</div>
  </div>

  <div style="padding:24px 30px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:7px 0;color:#9ca3af;font-size:13px;width:110px;font-weight:500">Name</td><td style="color:#111827;font-weight:800;font-size:14px">${esc(user.name)}</td></tr>
      <tr><td style="padding:7px 0;color:#9ca3af;font-size:13px;font-weight:500">Username</td><td style="color:#374151;font-size:13px">@${esc(user.username)}</td></tr>
      <tr><td style="padding:7px 0;color:#9ca3af;font-size:13px;font-weight:500">Email</td><td><a href="mailto:${esc(user.email)}" style="color:#3b82f6;font-size:13px;text-decoration:none">${esc(user.email)}</a></td></tr>
      ${user.phone ? `<tr><td style="padding:7px 0;color:#9ca3af;font-size:13px;font-weight:500">Phone</td><td style="color:#374151;font-size:13px">${esc(user.phone)}</td></tr>` : ''}
      <tr><td style="padding:7px 0;color:#9ca3af;font-size:13px;font-weight:500">Language</td><td style="color:#374151;font-size:13px">${user.lang === 'es' ? '🇲🇽 Spanish' : '🇺🇸 English'}</td></tr>
      <tr><td style="padding:7px 0;color:#9ca3af;font-size:13px;font-weight:500">User ID</td><td style="color:#d1d5db;font-family:monospace;font-size:12px">${esc(String(user.id || ''))}</td></tr>
    </table>
  </div>

  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:12px 30px;font-size:11px;color:#9ca3af;text-align:center">
    Pryme Labs Store Operations · Automated backup · ${fmtDateTime(null)} CST
  </div>
</div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV LEDGER (monthly rolling log)
// ─────────────────────────────────────────────────────────────────────────────

export const CSV_HEADER =
  '"Order #","Date","Time","Customer Name","Customer Email","Customer Phone","Payment","Status","Subtotal","Discount","Shipping","Tax","Total","Items","Promo Code"'

export function orderCsvRow(order) {
  const items    = Array.isArray(order.items) ? order.items : safe(order.items_json, [])
  const shipping = order.shipping && typeof order.shipping === 'object' ? order.shipping : safe(order.shipping_json, {})
  const ts       = order.created_at ? new Date(order.created_at * 1000) : new Date()
  const date     = ts.toLocaleDateString('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
  const time     = ts.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit' })
  const items_summary = items.map(i => `${i.name} x${i.qty}`).join('; ')

  const cols = [
    order.order_number || '',
    date,
    time,
    order.customer_name || '',
    order.customer_email || '',
    shipping.phone || '',
    PAY_LABEL[order.payment_method] || order.payment_method || '',
    order.status || 'pending',
    Number(order.subtotal || 0).toFixed(2),
    Number(order.discount_amount || 0).toFixed(2),
    Number(order.shipping_cost || 0).toFixed(2),
    Number(order.tax_amount || 0).toFixed(2),
    Number(order.order_total || order.subtotal || 0).toFixed(2),
    items_summary,
    order.promo_code || '',
  ]
  return cols.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
}

/** Build or append to a CSV. Pass existing content (or null for new file). */
export function buildCsv(existingContent, newRow) {
  if (existingContent && existingContent.trim().length > 0) {
    return `${existingContent.trimEnd()}\n${newRow}`
  }
  return `${CSV_HEADER}\n${newRow}`
}

// ─────────────────────────────────────────────────────────────────────────────
// TAX RECORD DOCUMENT
// ─────────────────────────────────────────────────────────────────────────────

export function taxRecordHtml(order) {
  const items     = Array.isArray(order.items) ? order.items : safe(order.items_json, [])
  const shipping  = order.shipping && typeof order.shipping === 'object' ? order.shipping : safe(order.shipping_json, {})
  const subtotal  = Number(order.subtotal || 0)
  const discount  = Number(order.discount_amount || 0)
  const taxable   = subtotal - discount
  const taxRate   = Number(order.tax_rate || 0)
  const taxAmount = Number(order.tax_amount || 0)
  const shipCost  = Number(order.shipping_cost || 0)
  const total     = Number(order.order_total || order.subtotal || 0)
  const isTaxed   = taxAmount > 0
  const taxPct    = (taxRate * 100).toFixed(2)
  const willCall  = isWillCall(order)

  const exemptReason = !isTaxed
    ? (order.promo_code && order.no_tax ? `Promo code applied: ${esc(order.promo_code)}` : 'No tax rate configured or promo exemption')
    : null

  const itemRows = items.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#111827;font-size:13px">${esc(i.name)}${i.size ? ` <span style="color:#9ca3af">(${esc(i.size)})</span>` : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:#374151;font-size:13px">${i.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;color:#374151;font-size:13px">$${Number(i.price).toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:700;color:#111827;font-size:13px">$${(i.price * i.qty).toFixed(2)}</td>
    </tr>`).join('')

  const addr = shipping.address
    ? `${esc(shipping.address)}${shipping.address2 ? ', ' + esc(shipping.address2) : ''}, ${esc(shipping.city)}, ${esc(shipping.state)} ${esc(shipping.zip)}`
    : '—'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Tax Record — ${esc(order.order_number)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing:border-box; }
    body { margin:0; padding:40px 20px; background:#f3f4f6; font-family:'Inter',Arial,sans-serif; color:#111827; }
    .card { max-width:700px; margin:0 auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.09); }
    @media print { body { background:#fff; padding:0; } .card { box-shadow:none; border-radius:0; } }
  </style>
</head>
<body>
<div class="card">

  <!-- ── Header ── -->
  <div style="background:#0f172a;padding:26px 36px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
    <div>
      <div style="display:flex;align-items:center;gap:7px;color:#fff;font-size:20px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase"><img src="https://prymelabs.cc/logo-mark.png" alt="" style="height:20px;width:auto" />PRYME<span style="color:#3b82f6">LABS</span></div>
      <div style="color:#64748b;font-size:12px;margin-top:3px">prymelabs.cc · support@prymelabs.net</div>
    </div>
    <div style="text-align:right">
      <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:600">Tax Record${willCall ? ' · Will Call' : ''}</div>
      <div style="color:#60a5fa;font-size:20px;font-weight:900;font-family:monospace;margin-top:2px">${esc(order.order_number)}</div>
      <div style="color:#64748b;font-size:12px;margin-top:2px">${fmtDateTime(order.created_at)} CST</div>
      ${willCall ? '<div style="display:inline-block;margin-top:8px;background:#f59e0b;color:#0f172a;font-size:10px;font-weight:800;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:0.08em">🏷️ Will Call · Pickup</div>' : ''}
    </div>
  </div>

  <!-- ── Tax Status Banner ── -->
  <div style="background:${isTaxed ? '#eff6ff' : '#f0fdf4'};border-bottom:3px solid ${isTaxed ? '#3b82f6' : '#22c55e'};padding:16px 36px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
    <div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:${isTaxed ? '#1e40af' : '#166534'};margin-bottom:4px">
        ${isTaxed ? '📋 TAXABLE TRANSACTION' : '🔖 TAX EXEMPT TRANSACTION'}
      </div>
      <div style="font-size:13px;color:${isTaxed ? '#1e40af' : '#166534'};font-weight:500">
        ${isTaxed ? `Tax collected at ${taxPct}% · $${taxAmount.toFixed(2)} remitted` : `No tax collected${exemptReason ? ' — ' + exemptReason : ''}`}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:28px;font-weight:900;color:${isTaxed ? '#1e40af' : '#166534'}">$${taxAmount.toFixed(2)}</div>
      <div style="font-size:11px;color:${isTaxed ? '#3b82f6' : '#22c55e'};font-weight:600">TAX ${isTaxed ? 'COLLECTED' : 'EXEMPT'}</div>
    </div>
  </div>

  <!-- ── Customer Info ── -->
  <div style="padding:20px 36px;border-bottom:1px solid #e5e7eb;display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;margin-bottom:8px">Customer</div>
      <div style="font-weight:800;color:#111827;font-size:15px">${esc(order.customer_name)}</div>
      <div style="color:#3b82f6;font-size:13px;margin-top:3px">${esc(order.customer_email)}</div>
      ${shipping.phone ? `<div style="color:#374151;font-size:13px;margin-top:2px">${esc(shipping.phone)}</div>` : ''}
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;margin-bottom:8px">${willCall ? 'Fulfillment' : 'Ship To'}</div>
      <div style="color:#374151;font-size:13px;line-height:1.6">${willCall ? '🏷️ Will Call — In-Store Pickup' : addr}</div>
    </div>
  </div>

  <!-- ── Items ── -->
  <div style="padding:20px 36px;border-bottom:1px solid #e5e7eb">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;margin-bottom:12px">Line Items</div>
    <table width="100%" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;border-collapse:collapse">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:9px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Product</th>
          <th style="padding:9px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Qty</th>
          <th style="padding:9px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Unit</th>
          <th style="padding:9px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <!-- ── Tax Breakdown ── -->
  <div style="padding:20px 36px;border-bottom:1px solid #e5e7eb">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#9ca3af;margin-bottom:14px">Tax Breakdown</div>
    <div style="max-width:320px;margin-left:auto">
      <table width="100%" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;border-collapse:collapse">
        <tr style="background:#f9fafb"><td style="padding:9px 14px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em">Item</td><td style="padding:9px 14px;text-align:right;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em">Amount</td></tr>
        <tr><td style="padding:8px 14px;border-top:1px solid #f3f4f6;color:#374151;font-size:13px">Gross Subtotal</td><td style="padding:8px 14px;border-top:1px solid #f3f4f6;text-align:right;color:#111827;font-size:13px">$${subtotal.toFixed(2)}</td></tr>
        ${discount > 0 ? `<tr><td style="padding:8px 14px;border-top:1px solid #f3f4f6;color:#059669;font-size:13px">Discount${order.promo_code ? ` (${esc(order.promo_code)})` : ''}</td><td style="padding:8px 14px;border-top:1px solid #f3f4f6;text-align:right;color:#059669;font-size:13px;font-weight:600">−$${discount.toFixed(2)}</td></tr>` : ''}
        <tr style="background:#f9fafb"><td style="padding:8px 14px;border-top:1px solid #e5e7eb;color:#374151;font-size:13px;font-weight:600">Taxable Amount</td><td style="padding:8px 14px;border-top:1px solid #e5e7eb;text-align:right;color:#111827;font-size:13px;font-weight:700">$${taxable.toFixed(2)}</td></tr>
        <tr><td style="padding:8px 14px;border-top:1px solid #f3f4f6;color:#374151;font-size:13px">Tax Rate</td><td style="padding:8px 14px;border-top:1px solid #f3f4f6;text-align:right;color:#111827;font-size:13px">${isTaxed ? taxPct + '%' : '0% (Exempt)'}</td></tr>
        <tr><td style="padding:8px 14px;border-top:1px solid #f3f4f6;color:${isTaxed ? '#1e40af' : '#6b7280'};font-size:13px;font-weight:700">Tax Collected</td><td style="padding:8px 14px;border-top:1px solid #f3f4f6;text-align:right;color:${isTaxed ? '#1e40af' : '#9ca3af'};font-size:13px;font-weight:800">$${taxAmount.toFixed(2)}</td></tr>
        ${shipCost > 0 ? `<tr><td style="padding:8px 14px;border-top:1px solid #f3f4f6;color:#374151;font-size:13px">${esc(order.shipping_rate_name || 'Shipping')} (not taxed)</td><td style="padding:8px 14px;border-top:1px solid #f3f4f6;text-align:right;color:#374151;font-size:13px">$${shipCost.toFixed(2)}</td></tr>` : ''}
        <tr style="background:${isTaxed ? '#eff6ff' : '#f0fdf4'}">
          <td style="padding:12px 14px;border-top:2px solid ${isTaxed ? '#3b82f6' : '#22c55e'};font-weight:900;color:#111827;font-size:15px;text-transform:uppercase;letter-spacing:0.06em">Order Total</td>
          <td style="padding:12px 14px;border-top:2px solid ${isTaxed ? '#3b82f6' : '#22c55e'};text-align:right;font-weight:900;font-size:22px;color:${isTaxed ? '#1e40af' : '#166534'}">$${total.toFixed(2)}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- ── Footer ── -->
  <div style="background:#f9fafb;padding:14px 36px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
    <div style="font-size:11px;color:#9ca3af">
      ${hasPeptideItems(order) ? '⚠ All products sold for research use only · Not for human consumption<br>' : ''}
      © ${new Date().getFullYear()} Pryme Labs · <a href="https://prymelabs.cc/compliance" style="color:#3b82f6">Legal &amp; Compliance</a>
    </div>
    <div style="font-size:11px;color:#d1d5db;text-align:right">
      Tax record generated ${fmtDateTime(null)} CST<br>
      <span style="font-family:monospace;font-size:10px">Filed: ${isTaxed ? 'Tax Records/Taxed Orders' : 'Tax Records/Tax Exempt Orders'}</span>
    </div>
  </div>

</div>
</body>
</html>`
}
