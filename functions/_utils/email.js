import { smsPhone } from './phoneVerification.js'

const PAYMENT_LABEL = { zelle: 'Zelle', cashapp: 'Cash App', venmo: 'Venmo' }

/** Escape HTML special chars to prevent XSS in email templates */
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatItems(items) {
  return items.map(i =>
    `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #1e1e2e;color:#e4e4e7;font-weight:600">${escHtml(i.name)}${i.size ? ' — ' + escHtml(i.size) : ''}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e1e2e;color:#a1a1aa;text-align:center">×${i.qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e1e2e;color:#f59e0b;text-align:right;font-weight:700">$${(i.price * i.qty).toFixed(2)}</td>
    </tr>`
  ).join('')
}

// Renders a dark-theme pricing breakdown block (used in customer emails)
function pricingBreakdownDark({ subtotal, promo_code, discount_amount, shipping_cost, shipping_rate_name, tax_rate, tax_amount, total, lang }) {
  const es = lang === 'es'
  const hasDiscount = discount_amount > 0
  const hasShipping = shipping_cost > 0
  const hasTax = tax_amount > 0
  const taxPct = tax_rate > 0 ? ` (${(tax_rate * 100).toFixed(2)}%)` : ''

  const L = {
    subtotal:   es ? 'Subtotal'         : 'Subtotal',
    discount:   es ? 'Descuento'        : 'Discount',
    shipping:   es ? 'Envío'            : 'Shipping',
    tax:        es ? 'Impuesto'         : 'Tax',
    free:       es ? 'Gratis'           : 'Free',
    orderTotal: es ? 'Total del Pedido' : 'Order Total',
  }

  const discountRow = hasDiscount ? `
    <tr>
      <td style="padding:6px 12px;color:#4ade80;font-size:13px">
        ${L.discount}${promo_code ? ` — <span style="font-family:monospace;font-weight:700;letter-spacing:0.08em">${escHtml(promo_code)}</span>` : ''}
      </td>
      <td style="padding:6px 12px;color:#4ade80;font-size:13px;text-align:right;font-weight:700">−$${Number(discount_amount).toFixed(2)}</td>
    </tr>` : ''

  const shippingRow = hasShipping ? `
    <tr>
      <td style="padding:6px 12px;color:#a1a1aa;font-size:13px">${shipping_rate_name || L.shipping}</td>
      <td style="padding:6px 12px;color:#a1a1aa;font-size:13px;text-align:right">$${Number(shipping_cost).toFixed(2)}</td>
    </tr>` : `
    <tr>
      <td style="padding:6px 12px;color:#a1a1aa;font-size:13px">${shipping_rate_name || L.shipping}</td>
      <td style="padding:6px 12px;color:#4ade80;font-size:13px;text-align:right;font-weight:600">${L.free}</td>
    </tr>`

  const taxRow = hasTax ? `
    <tr>
      <td style="padding:6px 12px;color:#a1a1aa;font-size:13px">${L.tax}${taxPct}</td>
      <td style="padding:6px 12px;color:#a1a1aa;font-size:13px;text-align:right">$${Number(tax_amount).toFixed(2)}</td>
    </tr>` : ''

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;border:1px solid #1e1e2e;border-radius:12px;margin-bottom:24px;overflow:hidden">
      <tr>
        <td style="padding:6px 12px;color:#a1a1aa;font-size:13px">${L.subtotal}</td>
        <td style="padding:6px 12px;color:#a1a1aa;font-size:13px;text-align:right">$${Number(subtotal).toFixed(2)}</td>
      </tr>
      ${discountRow}
      ${shipping_rate_name !== undefined ? shippingRow : ''}
      ${taxRow}
      <tr style="border-top:1px solid #1e1e2e">
        <td style="padding:12px 12px 10px;color:#ffffff;font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:0.06em">${L.orderTotal}</td>
        <td style="padding:12px 12px 10px;color:#f59e0b;font-weight:800;font-size:22px;text-align:right">$${Number(total).toFixed(2)}</td>
      </tr>
    </table>`
}

// Renders a light-theme pricing breakdown block (used in owner email)
function pricingBreakdownLight({ subtotal, promo_code, discount_amount, shipping_cost, shipping_rate_name, tax_rate, tax_amount, total }) {
  const hasDiscount = discount_amount > 0
  const hasShipping = shipping_cost > 0
  const hasTax = tax_amount > 0
  const taxPct = tax_rate > 0 ? ` (${(tax_rate * 100).toFixed(2)}%)` : ''

  const rows = []
  rows.push(`<tr><td style="padding:5px 8px;color:#1e3a4f;font-size:13px">Subtotal</td><td style="padding:5px 8px;color:#091a28;font-size:13px;text-align:right">$${Number(subtotal).toFixed(2)}</td></tr>`)
  if (hasDiscount) rows.push(`<tr><td style="padding:5px 8px;color:#166534;font-size:13px">Discount${promo_code ? ` — <strong>${escHtml(promo_code)}</strong>` : ''}</td><td style="padding:5px 8px;color:#166534;font-size:13px;text-align:right;font-weight:700">−$${Number(discount_amount).toFixed(2)}</td></tr>`)
  if (shipping_rate_name !== undefined) {
    if (hasShipping) rows.push(`<tr><td style="padding:5px 8px;color:#1e3a4f;font-size:13px">${shipping_rate_name || 'Shipping'}</td><td style="padding:5px 8px;color:#091a28;font-size:13px;text-align:right">$${Number(shipping_cost).toFixed(2)}</td></tr>`)
    else rows.push(`<tr><td style="padding:5px 8px;color:#1e3a4f;font-size:13px">${shipping_rate_name || 'Shipping'}</td><td style="padding:5px 8px;color:#166534;font-size:13px;text-align:right;font-weight:600">Free</td></tr>`)
  }
  if (hasTax) rows.push(`<tr><td style="padding:5px 8px;color:#1e3a4f;font-size:13px">Tax${taxPct}</td><td style="padding:5px 8px;color:#091a28;font-size:13px;text-align:right">$${Number(tax_amount).toFixed(2)}</td></tr>`)
  rows.push(`<tr style="border-top:2px solid #d0dff8"><td style="padding:8px 8px 4px;font-weight:800;color:#0055bb;font-size:14px;text-transform:uppercase">Order Total</td><td style="padding:8px 8px 4px;text-align:right;font-weight:800;font-size:18px;color:#0055bb">$${Number(total).toFixed(2)}</td></tr>`)

  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fbff;border:1px solid #d0dff8;border-radius:8px;margin-bottom:16px;overflow:hidden">${rows.join('')}</table>`
}

// ── Packing-slip themed item table (navy header, white rows) ──
function itemsTableSlip(items, lang = 'en') {
  const L = lang === 'es' ? { item: 'PRODUCTO', qty: 'CANT.', price: 'PRECIO' } : { item: 'ITEM', qty: 'QTY', price: 'PRICE' }
  const rows = (items || []).map(i => `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #e5e8ee;color:#111111;font-size:15px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${escHtml(i.name)}${i.size ? ` <span style="color:#6b6f76;font-weight:400;">(${escHtml(i.size)})</span>` : ''}</td>
        <td align="center" style="padding:14px 16px;border-bottom:1px solid #e5e8ee;color:#6b6f76;font-size:15px;font-family:Arial,Helvetica,sans-serif;">${i.qty}</td>
        <td align="right" style="padding:14px 16px;border-bottom:1px solid #e5e8ee;color:#111111;font-size:15px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">$${(i.price * i.qty).toFixed(2)}</td>
      </tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e8ee;border-radius:10px;overflow:hidden;margin:0 0 24px 0;">
      <tr>
        <td style="padding:12px 16px;background:#002b63;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;text-align:left;font-family:Arial,Helvetica,sans-serif;">${L.item}</td>
        <td style="padding:12px 16px;background:#002b63;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;text-align:center;font-family:Arial,Helvetica,sans-serif;">${L.qty}</td>
        <td style="padding:12px 16px;background:#002b63;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;text-align:right;font-family:Arial,Helvetica,sans-serif;">${L.price}</td>
      </tr>${rows}
    </table>`
}

// ── Packing-slip themed price breakdown (light theme, navy total) ──
function pricingBreakdownSlip({ subtotal, promo_code, discount_amount, shipping_cost, shipping_rate_name, tax_rate, tax_amount, total, lang = 'en' }) {
  const es = lang === 'es'
  const L = { subtotal: 'Subtotal', discount: es ? 'Descuento' : 'Discount', shipping: es ? 'Envío' : 'Shipping', tax: es ? 'Impuesto' : 'Tax', free: es ? 'Gratis' : 'Free', total: es ? 'Total del Pedido' : 'Order Total' }
  const taxPct = tax_rate > 0 ? ` (${(tax_rate * 100).toFixed(2)}%)` : ''
  const c = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;'
  const rows = []
  rows.push(`<tr><td style="padding:6px 0;color:#6b6f76;${c}">${L.subtotal}</td><td align="right" style="padding:6px 0;color:#111111;${c}">$${Number(subtotal).toFixed(2)}</td></tr>`)
  if (discount_amount > 0) rows.push(`<tr><td style="padding:6px 0;color:#157347;${c}">${L.discount}${promo_code ? ` — <strong>${escHtml(promo_code)}</strong>` : ''}</td><td align="right" style="padding:6px 0;color:#157347;font-weight:700;${c}">−$${Number(discount_amount).toFixed(2)}</td></tr>`)
  if (shipping_rate_name !== undefined) {
    if (shipping_cost > 0) rows.push(`<tr><td style="padding:6px 0;color:#6b6f76;${c}">${escHtml(shipping_rate_name || L.shipping)}</td><td align="right" style="padding:6px 0;color:#111111;${c}">$${Number(shipping_cost).toFixed(2)}</td></tr>`)
    else rows.push(`<tr><td style="padding:6px 0;color:#6b6f76;${c}">${escHtml(shipping_rate_name || L.shipping)}</td><td align="right" style="padding:6px 0;color:#157347;font-weight:700;${c}">${L.free}</td></tr>`)
  }
  if (tax_amount > 0) rows.push(`<tr><td style="padding:6px 0;color:#6b6f76;${c}">${L.tax}${taxPct}</td><td align="right" style="padding:6px 0;color:#111111;${c}">$${Number(tax_amount).toFixed(2)}</td></tr>`)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">${rows.join('')}
      <tr><td style="padding:14px 0 0;border-top:2px solid #002b63;color:#002b63;font-weight:800;font-size:15px;font-family:Arial,Helvetica,sans-serif;">${L.total}</td><td align="right" style="padding:14px 0 0;border-top:2px solid #002b63;color:#002b63;font-weight:800;font-size:22px;font-family:Arial,Helvetica,sans-serif;">$${Number(total).toFixed(2)}</td></tr>
    </table>`
}

// Small reusable building blocks for the slip-style customer emails
function slipEyebrow(text) {
  return `<div style="font-size:14px;color:#4f7fd9;font-weight:800;letter-spacing:4px;margin-bottom:16px;font-family:Arial,Helvetica,sans-serif;">${text}</div>`
}
function slipH1(text) {
  return `<h1 class="pl-h1" style="margin:0 0 18px 0;font-size:32px;line-height:1.18;color:#222222;font-weight:800;font-family:Arial,Helvetica,sans-serif;">${text}</h1>`
}
function slipInfoBox(label, value, valueColor = '#002b63') {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafc;border:1px solid #d9dde5;border-radius:12px;margin:0 0 24px 0;"><tr><td style="padding:18px 24px;">
      <div style="font-size:12px;color:#9aa0aa;font-weight:700;letter-spacing:3px;font-family:Arial,Helvetica,sans-serif;">${label}</div>
      <div style="font-size:20px;font-weight:800;letter-spacing:1px;color:${valueColor};margin-top:6px;font-family:Arial,Helvetica,sans-serif;">${value}</div>
    </td></tr></table>`
}
// The research disclaimer only applies to research peptides. Items snapshot
// their department at order time; if the order has no peptide item, the block is
// omitted. Legacy items with no department default to Peptides (all older
// products were peptides), so their emails keep the disclaimer.
function slipDisclaimer(lang = 'en', items = null) {
  const anyPeptide = !Array.isArray(items) || items.length === 0 ||
    items.some(i => (i?.department || 'Peptides') === 'Peptides')
  if (!anyPeptide) return ''
  const es = lang === 'es'
  const title = es ? 'Solo para Uso de Investigación — No para Consumo Humano' : 'Research Use Only — Not for Human Consumption'
  const text = es
    ? 'Todos los productos de Pryme Labs son estrictamente para fines de laboratorio e investigación. No para consumo humano ni uso terapéutico.'
    : 'All products sold by Pryme Labs are strictly for laboratory and research purposes only. Not for human consumption, therapeutic, or clinical use.'
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffaf0;border:1px solid #d6a72a;border-radius:14px;margin-top:4px;"><tr><td style="padding:18px 24px;font-family:Arial,Helvetica,sans-serif;">
      <div style="color:#9a7b1f;font-size:12px;font-weight:800;letter-spacing:1px;margin-bottom:4px;">⚠ ${title}</div>
      <div style="color:#b38620;font-size:13px;line-height:1.55;">${text}</div>
    </td></tr></table>`
}

export function customerConfirmationHtml({ order_number, customer_name, customer_email, items, subtotal, total, promo_code, discount_amount, shipping_cost, shipping_rate_name, tax_rate, tax_amount, payment_method, payment_handle, shipping }) {
  const method = PAYMENT_LABEL[payment_method] || payment_method
  const addr = shipping
    ? `${escHtml(shipping.address)}, ${escHtml(shipping.city)}, ${escHtml(shipping.state)} ${escHtml(shipping.zip)}`
    : 'Not provided'
  const trackUrl = customer_email ? `https://prymelabs.cc/track?order_number=${encodeURIComponent(order_number)}&email=${encodeURIComponent(customer_email)}` : null
  const body = `
    ${slipEyebrow('ORDER CONFIRMATION')}
    ${slipH1(`Thank you, ${escHtml(customer_name)}!`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Your order has been placed. Complete your payment below to confirm it.</p>
    ${slipInfoBox('ORDER NUMBER', escHtml(order_number))}
    ${itemsTableSlip(items, 'en')}
    ${pricingBreakdownSlip({ subtotal: subtotal ?? total, promo_code, discount_amount: discount_amount ?? 0, shipping_cost: shipping_cost ?? 0, shipping_rate_name, tax_rate: tax_rate ?? 0, tax_amount: tax_amount ?? 0, total, lang: 'en' })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fd;border:1px solid #cdd9ee;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:13px;color:#002b63;font-weight:800;letter-spacing:2px;margin-bottom:16px;">PAYMENT INSTRUCTIONS</div>
      <div style="font-size:15px;color:#111111;margin-bottom:12px;"><strong style="color:#002b63;">1.</strong> Open <strong>${escHtml(method)}</strong> on your phone</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">2.</strong> Send <strong style="color:#002b63;">$${Number(total).toFixed(2)}</strong> to:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 14px 20px;font-family:Arial,Helvetica,sans-serif;color:#002b63;font-size:16px;font-weight:700;word-break:break-word;">${escHtml(payment_handle)}</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">3.</strong> Put your order number in the memo:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 0 20px;font-family:Arial,Helvetica,sans-serif;color:#157347;font-size:16px;font-weight:800;letter-spacing:1px;">${escHtml(order_number)}</div>
    </td></tr></table>
    ${slipInfoBox('SHIPPING TO', addr, '#111111')}
    ${trackUrl ? `<div style="text-align:center;margin:0 0 24px 0;"><a href="${trackUrl}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:13px 26px;border-radius:8px;text-decoration:none;font-size:15px;font-family:Arial,Helvetica,sans-serif;">📦 Track Your Order</a></div>` : ''}
    ${slipDisclaimer('en', items)}`
  return prymeEmailShell({ lang: 'en', rightLabel: 'ORDER CONFIRMATION', preheader: `Order ${order_number} received — complete payment to confirm.`, body })
}

export function customerConfirmationHtmlEs({ order_number, customer_name, customer_email, items, subtotal, total, promo_code, discount_amount, shipping_cost, shipping_rate_name, tax_rate, tax_amount, payment_method, payment_handle, shipping }) {
  const method = PAYMENT_LABEL[payment_method] || payment_method
  const addr = shipping
    ? `${escHtml(shipping.address)}, ${escHtml(shipping.city)}, ${escHtml(shipping.state)} ${escHtml(shipping.zip)}`
    : 'No proporcionada'
  const trackUrl = customer_email ? `https://prymelabs.cc/track?order_number=${encodeURIComponent(order_number)}&email=${encodeURIComponent(customer_email)}` : null
  const body = `
    ${slipEyebrow('CONFIRMACIÓN DE PEDIDO')}
    ${slipH1(`¡Gracias, ${escHtml(customer_name)}!`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Tu pedido ha sido recibido. Completa tu pago a continuación para confirmarlo.</p>
    ${slipInfoBox('NÚMERO DE PEDIDO', escHtml(order_number))}
    ${itemsTableSlip(items, 'es')}
    ${pricingBreakdownSlip({ subtotal: subtotal ?? total, promo_code, discount_amount: discount_amount ?? 0, shipping_cost: shipping_cost ?? 0, shipping_rate_name, tax_rate: tax_rate ?? 0, tax_amount: tax_amount ?? 0, total, lang: 'es' })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fd;border:1px solid #cdd9ee;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:13px;color:#002b63;font-weight:800;letter-spacing:2px;margin-bottom:16px;">INSTRUCCIONES DE PAGO</div>
      <div style="font-size:15px;color:#111111;margin-bottom:12px;"><strong style="color:#002b63;">1.</strong> Abre <strong>${escHtml(method)}</strong> en tu teléfono</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">2.</strong> Envía <strong style="color:#002b63;">$${Number(total).toFixed(2)}</strong> a:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 14px 20px;font-family:Arial,Helvetica,sans-serif;color:#002b63;font-size:16px;font-weight:700;word-break:break-word;">${escHtml(payment_handle)}</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">3.</strong> Incluye tu número de pedido en el memo:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 0 20px;font-family:Arial,Helvetica,sans-serif;color:#157347;font-size:16px;font-weight:800;letter-spacing:1px;">${escHtml(order_number)}</div>
    </td></tr></table>
    ${slipInfoBox('DIRECCIÓN DE ENVÍO', addr, '#111111')}
    ${trackUrl ? `<div style="text-align:center;margin:0 0 24px 0;"><a href="${trackUrl}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:13px 26px;border-radius:8px;text-decoration:none;font-size:15px;font-family:Arial,Helvetica,sans-serif;">📦 Rastrea Tu Pedido</a></div>` : ''}
    ${slipDisclaimer('es', items)}`
  return prymeEmailShell({ lang: 'es', rightLabel: 'CONFIRMACIÓN', preheader: `Pedido ${order_number} recibido — completa el pago para confirmarlo.`, body })
}

// ── Will Call (in-store pickup) invoice ───────────────────────────────────────
// Mirrors customerConfirmationHtml but replaces the "Shipping to" address block
// with a pickup notice, and omits the shipping line from the totals (pickup is
// never shipped). Passing shipping_rate_name: undefined keeps the shipping row
// out of pricingBreakdownSlip.
export function willCallInvoiceHtml({ order_number, customer_name, items, subtotal, total, promo_code, discount_amount, tax_rate, tax_amount, payment_method, payment_handle }) {
  const method = PAYMENT_LABEL[payment_method] || payment_method
  const body = `
    ${slipEyebrow('WILL CALL INVOICE')}
    ${slipH1(`Thank you, ${escHtml(customer_name)}!`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">This is your Will Call (in-store pickup) invoice. Complete your payment below and we'll have your order ready for pickup.</p>
    ${slipInfoBox('ORDER NUMBER', escHtml(order_number))}
    ${itemsTableSlip(items, 'en')}
    ${pricingBreakdownSlip({ subtotal: subtotal ?? total, promo_code, discount_amount: discount_amount ?? 0, shipping_rate_name: undefined, tax_rate: tax_rate ?? 0, tax_amount: tax_amount ?? 0, total, lang: 'en' })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fd;border:1px solid #cdd9ee;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:13px;color:#002b63;font-weight:800;letter-spacing:2px;margin-bottom:16px;">PAYMENT INSTRUCTIONS</div>
      <div style="font-size:15px;color:#111111;margin-bottom:12px;"><strong style="color:#002b63;">1.</strong> Open <strong>${escHtml(method)}</strong> on your phone</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">2.</strong> Send <strong style="color:#002b63;">$${Number(total).toFixed(2)}</strong> to:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 14px 20px;font-family:Arial,Helvetica,sans-serif;color:#002b63;font-size:16px;font-weight:700;word-break:break-word;">${escHtml(payment_handle)}</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">3.</strong> Put your order number in the memo:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 0 20px;font-family:Arial,Helvetica,sans-serif;color:#157347;font-size:16px;font-weight:800;letter-spacing:1px;">${escHtml(order_number)}</div>
    </td></tr></table>
    ${slipInfoBox('PICKUP', 'Will Call — In-Store Pickup', '#111111')}
    ${slipDisclaimer('en', items)}`
  return prymeEmailShell({ lang: 'en', rightLabel: 'WILL CALL INVOICE', preheader: `Will Call invoice ${order_number} — complete payment, then pick up in store.`, body })
}

export function willCallInvoiceHtmlEs({ order_number, customer_name, items, subtotal, total, promo_code, discount_amount, tax_rate, tax_amount, payment_method, payment_handle }) {
  const method = PAYMENT_LABEL[payment_method] || payment_method
  const body = `
    ${slipEyebrow('FACTURA — WILL CALL')}
    ${slipH1(`¡Gracias, ${escHtml(customer_name)}!`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Esta es tu factura de Will Call (recogida en tienda). Completa tu pago a continuación y tendremos tu pedido listo para recoger.</p>
    ${slipInfoBox('NÚMERO DE PEDIDO', escHtml(order_number))}
    ${itemsTableSlip(items, 'es')}
    ${pricingBreakdownSlip({ subtotal: subtotal ?? total, promo_code, discount_amount: discount_amount ?? 0, shipping_rate_name: undefined, tax_rate: tax_rate ?? 0, tax_amount: tax_amount ?? 0, total, lang: 'es' })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fd;border:1px solid #cdd9ee;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:13px;color:#002b63;font-weight:800;letter-spacing:2px;margin-bottom:16px;">INSTRUCCIONES DE PAGO</div>
      <div style="font-size:15px;color:#111111;margin-bottom:12px;"><strong style="color:#002b63;">1.</strong> Abre <strong>${escHtml(method)}</strong> en tu teléfono</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">2.</strong> Envía <strong style="color:#002b63;">$${Number(total).toFixed(2)}</strong> a:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 14px 20px;font-family:Arial,Helvetica,sans-serif;color:#002b63;font-size:16px;font-weight:700;word-break:break-word;">${escHtml(payment_handle)}</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">3.</strong> Incluye tu número de pedido en el memo:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 0 20px;font-family:Arial,Helvetica,sans-serif;color:#157347;font-size:16px;font-weight:800;letter-spacing:1px;">${escHtml(order_number)}</div>
    </td></tr></table>
    ${slipInfoBox('RECOGIDA', 'Will Call — Recogida en Tienda', '#111111')}
    ${slipDisclaimer('es', items)}`
  return prymeEmailShell({ lang: 'es', rightLabel: 'FACTURA', preheader: `Factura Will Call ${order_number} — completa el pago y recoge en tienda.`, body })
}

// ── Will Call: ready for pickup ──────────────────────────────────────────────
export function willCallReadyHtml({ order_number, customer_name, items, total }) {
  const body = `
    ${slipEyebrow('READY FOR PICKUP')}
    ${slipH1(`Your order is ready, ${escHtml(customer_name)}!`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Order <strong>${escHtml(order_number)}</strong> is packed and waiting for you at the store. Come by anytime during business hours to pick it up.</p>
    ${slipInfoBox('ORDER NUMBER', escHtml(order_number))}
    ${itemsTableSlip(items, 'en')}
    ${slipInfoBox('PICKUP', '🏷️ Will Call — In-Store Pickup', '#111111')}
    ${slipDisclaimer('en', items)}`
  return prymeEmailShell({ lang: 'en', rightLabel: 'READY FOR PICKUP', preheader: `Order ${order_number} is ready for pickup.`, body })
}
export function willCallReadyHtmlEs({ order_number, customer_name, items, total }) {
  const body = `
    ${slipEyebrow('LISTO PARA RECOGER')}
    ${slipH1(`¡Tu pedido está listo, ${escHtml(customer_name)}!`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">El pedido <strong>${escHtml(order_number)}</strong> está empacado y esperándote en la tienda. Pasa a recogerlo durante el horario de atención.</p>
    ${slipInfoBox('NÚMERO DE PEDIDO', escHtml(order_number))}
    ${itemsTableSlip(items, 'es')}
    ${slipInfoBox('RECOGIDA', '🏷️ Will Call — Recogida en Tienda', '#111111')}
    ${slipDisclaimer('es', items)}`
  return prymeEmailShell({ lang: 'es', rightLabel: 'LISTO PARA RECOGER', preheader: `El pedido ${order_number} está listo para recoger.`, body })
}

// ── Will Call: picked up (completed) ─────────────────────────────────────────
export function willCallPickedUpHtml({ order_number, customer_name, items, total }) {
  const body = `
    ${slipEyebrow('PICKED UP')}
    ${slipH1(`Thanks, ${escHtml(customer_name)}!`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Your Will Call order <strong>${escHtml(order_number)}</strong> has been picked up and completed. We appreciate your business — see you next time!</p>
    ${slipInfoBox('ORDER NUMBER', escHtml(order_number))}
    ${itemsTableSlip(items, 'en')}
    ${slipDisclaimer('en', items)}`
  return prymeEmailShell({ lang: 'en', rightLabel: 'PICKED UP', preheader: `Order ${order_number} picked up — thank you!`, body })
}
export function willCallPickedUpHtmlEs({ order_number, customer_name, items, total }) {
  const body = `
    ${slipEyebrow('RECOGIDO')}
    ${slipH1(`¡Gracias, ${escHtml(customer_name)}!`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Tu pedido Will Call <strong>${escHtml(order_number)}</strong> ha sido recogido y completado. ¡Gracias por tu compra, te esperamos pronto!</p>
    ${slipInfoBox('NÚMERO DE PEDIDO', escHtml(order_number))}
    ${itemsTableSlip(items, 'es')}
    ${slipDisclaimer('es', items)}`
  return prymeEmailShell({ lang: 'es', rightLabel: 'RECOGIDO', preheader: `Pedido ${order_number} recogido — ¡gracias!`, body })
}

export function ownerNotificationHtml({ order_number, customer_name, customer_email, items, subtotal, total, promo_code, discount_amount, shipping_cost, shipping_rate_name, tax_rate, tax_amount, payment_method, shipping, confirm_url }) {
  const method = PAYMENT_LABEL[payment_method] || payment_method
  const addr = shipping
    ? `${escHtml(shipping.address)}${shipping.address2 ? ' ' + escHtml(shipping.address2) : ''}, ${escHtml(shipping.city)}, ${escHtml(shipping.state)} ${escHtml(shipping.zip)}`
    : 'Not provided'
  const breakdown = pricingBreakdownLight({ subtotal: subtotal ?? total, promo_code, discount_amount: discount_amount ?? 0, shipping_cost: shipping_cost ?? 0, shipping_rate_name, tax_rate: tax_rate ?? 0, tax_amount: tax_amount ?? 0, total })

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f0f6ff;font-family:Inter,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d0dff8;border-radius:16px;overflow:hidden">
    <div style="background:#e8f3ff;padding:20px 24px;border-bottom:1px solid #d0dff8">
      <span style="color:#091a28;font-size:18px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em">🔔 New Order — ${order_number}</span>
      <div style="color:#1e3a4f;font-size:13px;margin-top:4px">Payment method: <strong>${method}</strong> · Total: <strong style="color:#0055bb">$${Number(total).toFixed(2)}</strong></div>
    </div>
    <div style="padding:24px">
      <h3 style="color:#091a28;margin:0 0 12px">Customer</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:6px 0;color:#1e3a4f;font-size:13px;width:120px">Name</td><td style="color:#091a28;font-weight:700;font-size:13px">${escHtml(customer_name)}</td></tr>
        <tr><td style="padding:6px 0;color:#1e3a4f;font-size:13px">Email</td><td style="color:#0055bb;font-size:13px"><a href="mailto:${escHtml(customer_email)}">${escHtml(customer_email)}</a></td></tr>
        ${shipping?.phone ? `<tr><td style="padding:6px 0;color:#1e3a4f;font-size:13px">Phone</td><td style="color:#091a28;font-size:13px"><a href="tel:${escHtml(shipping.phone)}" style="color:#0055bb;text-decoration:none">${escHtml(shipping.phone)}</a></td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#1e3a4f;font-size:13px">Ship To</td><td style="color:#091a28;font-size:13px">${addr}</td></tr>
      </table>
      <h3 style="color:#091a28;margin:0 0 12px">Items Ordered</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px">
        <thead><tr style="background:#f0f6ff">
          <th style="padding:8px;text-align:left;color:#0055bb">Item</th>
          <th style="padding:8px;text-align:center;color:#0055bb">Qty</th>
          <th style="padding:8px;text-align:right;color:#0055bb">Price</th>
        </tr></thead>
        <tbody>${items.map(i => `<tr>
          <td style="padding:8px;border-bottom:1px solid #e8f3ff;color:#091a28;font-weight:600">${escHtml(i.name)}${i.size ? ' — ' + escHtml(i.size) : ''}</td>
          <td style="padding:8px;border-bottom:1px solid #e8f3ff;text-align:center;color:#1e3a4f">×${i.qty}</td>
          <td style="padding:8px;border-bottom:1px solid #e8f3ff;text-align:right;font-weight:700;color:#091a28">$${(i.price * i.qty).toFixed(2)}</td>
        </tr>`).join('')}</tbody>
      </table>
      ${breakdown}
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:16px">
        <strong style="color:#856404">⚡ Action Required:</strong> <span style="color:#856404">Once you've verified the ${method} payment of $${Number(total).toFixed(2)} landed in your account, tap “Confirm Payment” below — that marks the order paid and emails the customer.</span>
      </div>
      ${confirm_url ? `<a href="${confirm_url}" style="display:inline-block;background:#157347;color:#fff;font-weight:800;padding:13px 26px;border-radius:8px;text-decoration:none;font-size:15px;margin:0 8px 10px 0">✓ Confirm Payment</a>` : ''}
      <a href="https://prymelabs.cc/admin" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:13px 26px;border-radius:8px;text-decoration:none;font-size:15px;margin-bottom:10px">Open Admin Dashboard →</a>
      <div style="margin-top:16px;padding:10px 14px;background:#fffbeb;border:1px solid #fbbf24;border-radius:8px">
        <p style="color:#92400e;font-size:11px;margin:0">⚠ All products sold for research use only. Not for human consumption. Support: support@prymelabs.net · (346) 550-9100</p>
      </div>
    </div>
  </div>
</body>
</html>`
}

export function trackingNotificationHtml({ order_number, customer_name, items, total, carrier, tracking_number }) {
  const body = `
    ${slipEyebrow('SHIPPED')}
    ${slipH1('📦 Your order is on its way!')}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Hi ${escHtml(customer_name)}, good news — order <strong style="color:#111111;">${escHtml(order_number)}</strong> has shipped.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafc;border:1px solid #d9dde5;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:22px 26px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:12px;color:#9aa0aa;font-weight:700;letter-spacing:3px;margin-bottom:12px;">TRACKING INFO</div>
      <div style="font-size:15px;color:#111111;margin-bottom:8px;">Carrier: <strong style="color:#002b63;">${escHtml(carrier || 'N/A')}</strong></div>
      <div style="font-size:15px;color:#111111;">Tracking: <strong style="color:#002b63;letter-spacing:1px;word-break:break-all;">${escHtml(tracking_number || 'Pending')}</strong></div>
    </td></tr></table>
    ${slipDisclaimer('en', items)}`
  return prymeEmailShell({ lang: 'en', rightLabel: 'SHIPPED', preheader: `Order ${order_number} has shipped — track it inside.`, body })
}

export function trackingNotificationHtmlEs({ order_number, customer_name, items, total, carrier, tracking_number }) {
  const body = `
    ${slipEyebrow('ENVIADO')}
    ${slipH1('📦 ¡Tu pedido está en camino!')}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Hola ${escHtml(customer_name)}, buenas noticias — el pedido <strong style="color:#111111;">${escHtml(order_number)}</strong> ha sido enviado.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafc;border:1px solid #d9dde5;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:22px 26px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:12px;color:#9aa0aa;font-weight:700;letter-spacing:3px;margin-bottom:12px;">INFORMACIÓN DE SEGUIMIENTO</div>
      <div style="font-size:15px;color:#111111;margin-bottom:8px;">Transportista: <strong style="color:#002b63;">${escHtml(carrier || 'N/A')}</strong></div>
      <div style="font-size:15px;color:#111111;">Seguimiento: <strong style="color:#002b63;letter-spacing:1px;word-break:break-all;">${escHtml(tracking_number || 'Pendiente')}</strong></div>
    </td></tr></table>
    ${slipDisclaimer('es', items)}`
  return prymeEmailShell({ lang: 'es', rightLabel: 'ENVIADO', preheader: `El pedido ${order_number} ha sido enviado — rastréalo aquí.`, body })
}

// ─────────────────────────────────────────────────────────────────────────────
// DELIVERED  (carrier reports delivery → order auto-completed)
// ─────────────────────────────────────────────────────────────────────────────

export function deliveredNotificationHtml({ order_number, customer_name, items, total }) {
  const body = `
    ${slipEyebrow('DELIVERED')}
    ${slipH1('📬 Your order has been delivered!')}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Hi ${escHtml(customer_name)}, order <strong style="color:#111111;">${escHtml(order_number)}</strong> was delivered. Thanks for choosing Pryme Labs!</p>
    ${itemsTableSlip(items, 'en')}
    ${pricingBreakdownSlip({ subtotal: total, total, lang: 'en' })}
    <p style="margin:0 0 26px 0;font-size:15px;line-height:1.6;color:#8a8f99;font-family:Arial,Helvetica,sans-serif;">Anything wrong with your delivery? Reply to this email or call <strong style="color:#333333;">346-550-9100</strong> and we'll make it right.</p>
    ${slipDisclaimer('en', items)}`
  return prymeEmailShell({ lang: 'en', rightLabel: 'DELIVERED', preheader: `Order ${order_number} was delivered — thank you!`, body })
}

export function deliveredNotificationHtmlEs({ order_number, customer_name, items, total }) {
  const body = `
    ${slipEyebrow('ENTREGADO')}
    ${slipH1('📬 ¡Tu pedido ha sido entregado!')}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Hola ${escHtml(customer_name)}, el pedido <strong style="color:#111111;">${escHtml(order_number)}</strong> fue entregado. ¡Gracias por elegir Pryme Labs!</p>
    ${itemsTableSlip(items, 'es')}
    ${pricingBreakdownSlip({ subtotal: total, total, lang: 'es' })}
    <p style="margin:0 0 26px 0;font-size:15px;line-height:1.6;color:#8a8f99;font-family:Arial,Helvetica,sans-serif;">¿Algún problema con tu entrega? Responde a este correo o llama al <strong style="color:#333333;">346-550-9100</strong> y lo resolveremos.</p>
    ${slipDisclaimer('es', items)}`
  return prymeEmailShell({ lang: 'es', rightLabel: 'ENTREGADO', preheader: `El pedido ${order_number} fue entregado — ¡gracias!`, body })
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT CONFIRMED  (status → paid)
// ─────────────────────────────────────────────────────────────────────────────

export function paidConfirmationHtml({ order_number, customer_name, items, total, payment_method }) {
  const method = PAYMENT_LABEL[payment_method] || payment_method
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf7ef;border:1px solid #bfe3cc;border-radius:14px;margin:0 0 26px 0;"><tr><td align="center" style="padding:22px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:34px;line-height:1;margin-bottom:6px;">✅</div>
      <div style="color:#157347;font-size:20px;font-weight:800;letter-spacing:1px;">PAYMENT CONFIRMED</div>
    </td></tr></table>
    ${slipH1('Your payment is in!')}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Hi ${escHtml(customer_name)}, we received and verified your <strong style="color:#111111;">${escHtml(method)}</strong> payment of <strong style="color:#002b63;">$${Number(total).toFixed(2)}</strong>. Your order is being prepared and will ship soon.</p>
    ${slipInfoBox('ORDER NUMBER', escHtml(order_number))}
    ${itemsTableSlip(items, 'en')}
    <p style="margin:0 0 26px 0;font-size:15px;line-height:1.6;color:#8a8f99;font-family:Arial,Helvetica,sans-serif;">You'll get another email with tracking as soon as your order ships. Thank you for your business!</p>
    ${slipDisclaimer('en', items)}`
  return prymeEmailShell({ lang: 'en', rightLabel: 'PAYMENT CONFIRMED', preheader: `Payment received for order ${order_number} — it's being prepared.`, body })
}

export function paidConfirmationHtmlEs({ order_number, customer_name, items, total, payment_method }) {
  const method = PAYMENT_LABEL[payment_method] || payment_method
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf7ef;border:1px solid #bfe3cc;border-radius:14px;margin:0 0 26px 0;"><tr><td align="center" style="padding:22px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:34px;line-height:1;margin-bottom:6px;">✅</div>
      <div style="color:#157347;font-size:20px;font-weight:800;letter-spacing:1px;">PAGO CONFIRMADO</div>
    </td></tr></table>
    ${slipH1('¡Tu pago fue recibido!')}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Hola ${escHtml(customer_name)}, recibimos y verificamos tu pago de <strong style="color:#111111;">${escHtml(method)}</strong> por <strong style="color:#002b63;">$${Number(total).toFixed(2)}</strong>. Tu pedido está siendo preparado y pronto será enviado.</p>
    ${slipInfoBox('NÚMERO DE PEDIDO', escHtml(order_number))}
    ${itemsTableSlip(items, 'es')}
    <p style="margin:0 0 26px 0;font-size:15px;line-height:1.6;color:#8a8f99;font-family:Arial,Helvetica,sans-serif;">Recibirás otro correo con el seguimiento en cuanto tu pedido sea enviado. ¡Gracias por tu compra!</p>
    ${slipDisclaimer('es', items)}`
  return prymeEmailShell({ lang: 'es', rightLabel: 'PAGO CONFIRMADO', preheader: `Pago recibido del pedido ${order_number} — se está preparando.`, body })
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER CANCELLED
// ─────────────────────────────────────────────────────────────────────────────

export function cancelledNotificationHtml({ order_number, customer_name, items, total }) {
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdeced;border:1px solid #f3c0c4;border-radius:14px;margin:0 0 26px 0;"><tr><td align="center" style="padding:22px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:34px;line-height:1;margin-bottom:6px;">❌</div>
      <div style="color:#b42318;font-size:20px;font-weight:800;letter-spacing:1px;">ORDER CANCELLED</div>
    </td></tr></table>
    ${slipH1('Your order was cancelled')}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Hi ${escHtml(customer_name)}, order <strong style="color:#111111;">${escHtml(order_number)}</strong> has been cancelled. If you did not request this or have any questions, please contact us right away.</p>
    ${slipInfoBox('CANCELLED ORDER', escHtml(order_number), '#b42318')}
    ${itemsTableSlip(items, 'en')}
    <p style="margin:0 0 4px 0;font-size:15px;line-height:1.6;color:#8a8f99;font-family:Arial,Helvetica,sans-serif;">Questions? Email <strong style="color:#333333;">support@prymelabs.net</strong> or call <strong style="color:#333333;">346-550-9100</strong> and we'll help right away.</p>`
  return prymeEmailShell({ lang: 'en', rightLabel: 'ORDER CANCELLED', preheader: `Order ${order_number} has been cancelled.`, body })
}

export function cancelledNotificationHtmlEs({ order_number, customer_name, items, total }) {
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdeced;border:1px solid #f3c0c4;border-radius:14px;margin:0 0 26px 0;"><tr><td align="center" style="padding:22px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:34px;line-height:1;margin-bottom:6px;">❌</div>
      <div style="color:#b42318;font-size:20px;font-weight:800;letter-spacing:1px;">PEDIDO CANCELADO</div>
    </td></tr></table>
    ${slipH1('Tu pedido fue cancelado')}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Hola ${escHtml(customer_name)}, el pedido <strong style="color:#111111;">${escHtml(order_number)}</strong> ha sido cancelado. Si no solicitaste esta cancelación o tienes preguntas, comunícate con nosotros de inmediato.</p>
    ${slipInfoBox('PEDIDO CANCELADO', escHtml(order_number), '#b42318')}
    ${itemsTableSlip(items, 'es')}
    <p style="margin:0 0 4px 0;font-size:15px;line-height:1.6;color:#8a8f99;font-family:Arial,Helvetica,sans-serif;">¿Preguntas? Escribe a <strong style="color:#333333;">support@prymelabs.net</strong> o llama al <strong style="color:#333333;">346-550-9100</strong> y te ayudamos de inmediato.</p>`
  return prymeEmailShell({ lang: 'es', rightLabel: 'PEDIDO CANCELADO', preheader: `El pedido ${order_number} ha sido cancelado.`, body })
}

// ─────────────────────────────────────────────────────────────────────────────
// REFUND ISSUED
// ─────────────────────────────────────────────────────────────────────────────

export function refundedNotificationHtml({ order_number, customer_name, items, total, payment_method }) {
  const method = PAYMENT_LABEL[payment_method] || payment_method
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3fb;border:1px solid #cdd9ee;border-radius:14px;margin:0 0 26px 0;"><tr><td align="center" style="padding:22px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:34px;line-height:1;margin-bottom:6px;">💸</div>
      <div style="color:#002b63;font-size:20px;font-weight:800;letter-spacing:1px;">REFUND ISSUED</div>
    </td></tr></table>
    ${slipH1('Your refund is on the way')}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Hi ${escHtml(customer_name)}, a refund of <strong style="color:#002b63;">$${Number(total).toFixed(2)}</strong> has been issued for order <strong style="color:#111111;">${escHtml(order_number)}</strong>. The funds will be returned to your <strong style="color:#111111;">${escHtml(method)}</strong> account.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafc;border:1px solid #d9dde5;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:20px 26px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:12px;color:#9aa0aa;font-weight:700;letter-spacing:3px;margin-bottom:12px;">REFUND DETAILS</div>
      <table width="100%" role="presentation">
        <tr><td style="color:#6b6f76;font-size:14px;padding:4px 0;width:140px;">Order</td><td style="color:#111111;font-weight:700;font-size:14px;">${escHtml(order_number)}</td></tr>
        <tr><td style="color:#6b6f76;font-size:14px;padding:4px 0;">Refund Amount</td><td style="color:#157347;font-weight:800;font-size:16px;">$${Number(total).toFixed(2)}</td></tr>
        <tr><td style="color:#6b6f76;font-size:14px;padding:4px 0;">Via</td><td style="color:#111111;font-size:14px;">${escHtml(method)}</td></tr>
      </table>
    </td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffaf0;border:1px solid #d6a72a;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:18px 24px;font-family:Arial,Helvetica,sans-serif;">
      <div style="color:#9a7b1f;font-size:13px;font-weight:800;margin-bottom:4px;">⏱ Processing Time</div>
      <div style="color:#b38620;font-size:13px;line-height:1.55;">Refunds are processed within 1–2 business days on our end. Depending on your <strong>${escHtml(method)}</strong> account and bank, it may take an additional <strong>3–5 business days</strong> to fully reflect in your balance.</div>
    </td></tr></table>
    ${itemsTableSlip(items, 'en')}
    <p style="margin:0 0 4px 0;font-size:15px;line-height:1.6;color:#8a8f99;font-family:Arial,Helvetica,sans-serif;">Questions about your refund? Email <strong style="color:#333333;">support@prymelabs.net</strong> or call <strong style="color:#333333;">346-550-9100</strong>.</p>`
  return prymeEmailShell({ lang: 'en', rightLabel: 'REFUND ISSUED', preheader: `A $${Number(total).toFixed(2)} refund was issued for order ${order_number}.`, body })
}

export function refundedNotificationHtmlEs({ order_number, customer_name, items, total, payment_method }) {
  const method = PAYMENT_LABEL[payment_method] || payment_method
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3fb;border:1px solid #cdd9ee;border-radius:14px;margin:0 0 26px 0;"><tr><td align="center" style="padding:22px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:34px;line-height:1;margin-bottom:6px;">💸</div>
      <div style="color:#002b63;font-size:20px;font-weight:800;letter-spacing:1px;">REEMBOLSO EMITIDO</div>
    </td></tr></table>
    ${slipH1('Tu reembolso está en camino')}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Hola ${escHtml(customer_name)}, se ha emitido un reembolso de <strong style="color:#002b63;">$${Number(total).toFixed(2)}</strong> para el pedido <strong style="color:#111111;">${escHtml(order_number)}</strong>. Los fondos serán devueltos a tu cuenta de <strong style="color:#111111;">${escHtml(method)}</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafc;border:1px solid #d9dde5;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:20px 26px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:12px;color:#9aa0aa;font-weight:700;letter-spacing:3px;margin-bottom:12px;">DETALLES DEL REEMBOLSO</div>
      <table width="100%" role="presentation">
        <tr><td style="color:#6b6f76;font-size:14px;padding:4px 0;width:140px;">Pedido</td><td style="color:#111111;font-weight:700;font-size:14px;">${escHtml(order_number)}</td></tr>
        <tr><td style="color:#6b6f76;font-size:14px;padding:4px 0;">Monto</td><td style="color:#157347;font-weight:800;font-size:16px;">$${Number(total).toFixed(2)}</td></tr>
        <tr><td style="color:#6b6f76;font-size:14px;padding:4px 0;">Vía</td><td style="color:#111111;font-size:14px;">${escHtml(method)}</td></tr>
      </table>
    </td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffaf0;border:1px solid #d6a72a;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:18px 24px;font-family:Arial,Helvetica,sans-serif;">
      <div style="color:#9a7b1f;font-size:13px;font-weight:800;margin-bottom:4px;">⏱ Tiempo de Procesamiento</div>
      <div style="color:#b38620;font-size:13px;line-height:1.55;">Procesamos el reembolso en 1–2 días hábiles. Dependiendo de tu cuenta de <strong>${escHtml(method)}</strong> y tu banco, puede tardar <strong>3–5 días hábiles adicionales</strong> en reflejarse en tu saldo.</div>
    </td></tr></table>
    ${itemsTableSlip(items, 'es')}
    <p style="margin:0 0 4px 0;font-size:15px;line-height:1.6;color:#8a8f99;font-family:Arial,Helvetica,sans-serif;">¿Preguntas sobre tu reembolso? Escribe a <strong style="color:#333333;">support@prymelabs.net</strong> o llama al <strong style="color:#333333;">346-550-9100</strong>.</p>`
  return prymeEmailShell({ lang: 'es', rightLabel: 'REEMBOLSO EMITIDO', preheader: `Se emitió un reembolso de $${Number(total).toFixed(2)} para el pedido ${order_number}.`, body })
}

// ── Friendly payment reminder (order still pending / awaiting payment) ───────
export function paymentReminderHtml({ order_number, customer_name, items, subtotal, total, promo_code, discount_amount, shipping_cost, shipping_rate_name, tax_rate, tax_amount, payment_method, payment_handle, shipping }) {
  const method = PAYMENT_LABEL[payment_method] || payment_method
  const firstName = escHtml(String(customer_name || '').split(' ')[0] || 'there')
  const addr = shipping
    ? `${escHtml(shipping.address)}, ${escHtml(shipping.city)}, ${escHtml(shipping.state)} ${escHtml(shipping.zip)}`
    : 'Not provided'
  const body = `
    ${slipEyebrow('PAYMENT REMINDER')}
    ${slipH1(`Hi ${firstName}, your order is almost ready! 🎉`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">We noticed order <strong style="color:#111111;">${escHtml(order_number)}</strong> hasn't been paid yet, so we're holding your items. Complete payment below and we'll ship it right away. If you've already paid, please disregard — and thank you!</p>
    ${slipInfoBox('ORDER NUMBER', escHtml(order_number))}
    ${itemsTableSlip(items, 'en')}
    ${pricingBreakdownSlip({ subtotal: subtotal ?? total, promo_code, discount_amount: discount_amount ?? 0, shipping_cost: shipping_cost ?? 0, shipping_rate_name, tax_rate: tax_rate ?? 0, tax_amount: tax_amount ?? 0, total, lang: 'en' })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fd;border:1px solid #cdd9ee;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:13px;color:#002b63;font-weight:800;letter-spacing:2px;margin-bottom:16px;">COMPLETE YOUR PAYMENT</div>
      <div style="font-size:15px;color:#111111;margin-bottom:12px;"><strong style="color:#002b63;">1.</strong> Open <strong>${escHtml(method)}</strong> on your phone</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">2.</strong> Send <strong style="color:#002b63;">$${Number(total).toFixed(2)}</strong> to:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 14px 20px;color:#002b63;font-size:16px;font-weight:700;word-break:break-word;">${escHtml(payment_handle)}</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">3.</strong> Put your order number in the memo:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 0 20px;color:#157347;font-size:16px;font-weight:800;letter-spacing:1px;">${escHtml(order_number)}</div>
    </td></tr></table>
    ${slipInfoBox('SHIPPING TO', addr, '#111111')}
    <p style="margin:0;font-size:15px;line-height:1.6;color:#8a8f99;font-family:Arial,Helvetica,sans-serif;">Questions? Reply to this email or call <strong style="color:#333333;">346-550-9100</strong> — we're happy to help.</p>`
  return prymeEmailShell({ lang: 'en', rightLabel: 'PAYMENT REMINDER', preheader: `Order ${order_number} is held — complete payment to ship it.`, body })
}

export function paymentReminderHtmlEs({ order_number, customer_name, items, subtotal, total, promo_code, discount_amount, shipping_cost, shipping_rate_name, tax_rate, tax_amount, payment_method, payment_handle, shipping }) {
  const method = PAYMENT_LABEL[payment_method] || payment_method
  const first = String(customer_name || '').split(' ')[0]
  const greeting = first ? `¡Hola ${escHtml(first)}` : '¡Hola'
  const addr = shipping
    ? `${escHtml(shipping.address)}, ${escHtml(shipping.city)}, ${escHtml(shipping.state)} ${escHtml(shipping.zip)}`
    : 'No proporcionada'
  const body = `
    ${slipEyebrow('RECORDATORIO DE PAGO')}
    ${slipH1(`${greeting}, tu pedido casi está listo! 🎉`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Notamos que el pedido <strong style="color:#111111;">${escHtml(order_number)}</strong> aún no ha sido pagado, así que estamos reservando tus productos. Completa tu pago abajo y lo enviaremos de inmediato. Si ya pagaste, ignora este mensaje — ¡gracias!</p>
    ${slipInfoBox('NÚMERO DE PEDIDO', escHtml(order_number))}
    ${itemsTableSlip(items, 'es')}
    ${pricingBreakdownSlip({ subtotal: subtotal ?? total, promo_code, discount_amount: discount_amount ?? 0, shipping_cost: shipping_cost ?? 0, shipping_rate_name, tax_rate: tax_rate ?? 0, tax_amount: tax_amount ?? 0, total, lang: 'es' })}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fd;border:1px solid #cdd9ee;border-radius:14px;margin:0 0 24px 0;"><tr><td style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:13px;color:#002b63;font-weight:800;letter-spacing:2px;margin-bottom:16px;">COMPLETA TU PAGO</div>
      <div style="font-size:15px;color:#111111;margin-bottom:12px;"><strong style="color:#002b63;">1.</strong> Abre <strong>${escHtml(method)}</strong> en tu teléfono</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">2.</strong> Envía <strong style="color:#002b63;">$${Number(total).toFixed(2)}</strong> a:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 14px 20px;color:#002b63;font-size:16px;font-weight:700;word-break:break-word;">${escHtml(payment_handle)}</div>
      <div style="font-size:15px;color:#111111;margin-bottom:6px;"><strong style="color:#002b63;">3.</strong> Incluye tu número de pedido en el memo:</div>
      <div style="background:#ffffff;border:1px solid #cdd9ee;border-radius:8px;padding:12px 16px;margin:0 0 0 20px;color:#157347;font-size:16px;font-weight:800;letter-spacing:1px;">${escHtml(order_number)}</div>
    </td></tr></table>
    ${slipInfoBox('DIRECCIÓN DE ENVÍO', addr, '#111111')}
    <p style="margin:0;font-size:15px;line-height:1.6;color:#8a8f99;font-family:Arial,Helvetica,sans-serif;">¿Preguntas? Responde a este correo o llama al <strong style="color:#333333;">346-550-9100</strong> — con gusto te ayudamos.</p>`
  return prymeEmailShell({ lang: 'es', rightLabel: 'RECORDATORIO', preheader: `El pedido ${order_number} está reservado — completa el pago para enviarlo.`, body })
}

// ── Courtesy auto-cancellation (pending order expired without payment) ───────
export function paymentExpiredHtml({ order_number, customer_name, items, total }) {
  const firstName = escHtml(String(customer_name || '').split(' ')[0] || 'there')
  const body = `
    ${slipEyebrow('ORDER CANCELLED')}
    ${slipH1(`Hi ${firstName}, we released your order`)}
    <p style="margin:0 0 18px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">We held order <strong style="color:#111111;">${escHtml(order_number)}</strong> as long as we could, but since payment wasn't received it has been automatically cancelled and the items returned to stock. No charge was made and nothing further is needed.</p>
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Still want these items? You're always welcome to place a new order — we'd love to ship it out for you. 😊</p>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" class="pl-btn" style="margin:0 auto;"><tr><td align="center" style="background:#002b63;border-radius:12px;"><a href="https://prymelabs.cc/shop" style="display:inline-block;padding:16px 40px;color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;font-family:Arial,Helvetica,sans-serif;">Reorder Now &rarr;</a></td></tr></table>`
  return prymeEmailShell({ lang: 'en', rightLabel: 'ORDER CANCELLED', preheader: `Order ${order_number} was released — reorder anytime.`, body })
}

export function paymentExpiredHtmlEs({ order_number, customer_name, items, total }) {
  const first = String(customer_name || '').split(' ')[0]
  const greeting = first ? `Hola ${escHtml(first)}` : 'Hola'
  const body = `
    ${slipEyebrow('PEDIDO CANCELADO')}
    ${slipH1(`${greeting}, liberamos tu pedido`)}
    <p style="margin:0 0 18px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Mantuvimos el pedido <strong style="color:#111111;">${escHtml(order_number)}</strong> el mayor tiempo posible, pero como no recibimos el pago, ha sido cancelado automáticamente y los productos regresaron al inventario. No se realizó ningún cargo y no necesitas hacer nada más.</p>
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">¿Todavía los quieres? Siempre puedes hacer un nuevo pedido — con gusto te lo enviamos. 😊</p>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" class="pl-btn" style="margin:0 auto;"><tr><td align="center" style="background:#002b63;border-radius:12px;"><a href="https://prymelabs.cc/shop" style="display:inline-block;padding:16px 40px;color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;font-family:Arial,Helvetica,sans-serif;">Volver a Ordenar &rarr;</a></td></tr></table>`
  return prymeEmailShell({ lang: 'es', rightLabel: 'PEDIDO CANCELADO', preheader: `El pedido ${order_number} fue liberado — reordena cuando quieras.`, body })
}

// ── Back-in-stock notification ───────────────────────────────────────────────
export function backInStockHtml({ product_name, product_url }) {
  const body = `
    ${slipEyebrow('BACK IN STOCK')}
    ${slipH1(`${escHtml(product_name)} is available again! 🎉`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Good news — the item you asked about is back in stock. Quantities can move fast, so grab yours before it's gone.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" class="pl-btn" style="margin:0 auto;"><tr><td align="center" style="background:#002b63;border-radius:12px;"><a href="${product_url}" style="display:inline-block;padding:16px 40px;color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;font-family:Arial,Helvetica,sans-serif;">Shop Now &rarr;</a></td></tr></table>`
  return prymeEmailShell({ lang: 'en', rightLabel: 'BACK IN STOCK', preheader: `${product_name} is back in stock.`, body })
}

export function backInStockHtmlEs({ product_name, product_url }) {
  const body = `
    ${slipEyebrow('DE NUEVO EN STOCK')}
    ${slipH1(`¡${escHtml(product_name)} está disponible otra vez! 🎉`)}
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Buenas noticias — el producto que te interesaba volvió al inventario. Las cantidades se agotan rápido, así que consíguelo antes de que se acabe.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" class="pl-btn" style="margin:0 auto;"><tr><td align="center" style="background:#002b63;border-radius:12px;"><a href="${product_url}" style="display:inline-block;padding:16px 40px;color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;font-family:Arial,Helvetica,sans-serif;">Comprar Ahora &rarr;</a></td></tr></table>`
  return prymeEmailShell({ lang: 'es', rightLabel: 'EN STOCK', preheader: `${product_name} volvió al inventario.`, body })
}

// ── Post-delivery thank-you + review request ─────────────────────────────────
export function reviewRequestHtml({ customer_name, order_number, promo_code }) {
  const firstName = escHtml(String(customer_name || '').split(' ')[0] || 'there')
  const promoBlock = promo_code ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafc;border:2px dashed #cdd9ee;border-radius:14px;margin:0 0 26px 0;"><tr><td align="center" style="padding:20px;font-family:Arial,Helvetica,sans-serif;">
      <div style="color:#6b6f76;font-size:13px;margin-bottom:6px;">A little thank-you for your next order:</div>
      <div style="color:#002b63;font-size:22px;font-weight:800;letter-spacing:2px;">${escHtml(promo_code)}</div>
    </td></tr></table>` : ''
  const body = `
    ${slipEyebrow('THANK YOU')}
    ${slipH1(`How did we do, ${firstName}?`)}
    <p style="margin:0 0 26px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">Order <strong style="color:#111111;">${escHtml(order_number)}</strong> was delivered — we hope everything arrived perfectly. If you have a moment, we'd love to hear about your experience. Just reply to this email; your feedback helps us serve you better.</p>
    ${promoBlock}
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" class="pl-btn" style="margin:0 auto;"><tr><td align="center" style="background:#002b63;border-radius:12px;"><a href="https://prymelabs.cc/shop" style="display:inline-block;padding:16px 40px;color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;font-family:Arial,Helvetica,sans-serif;">Order Again &rarr;</a></td></tr></table>`
  return prymeEmailShell({ lang: 'en', rightLabel: 'THANK YOU', preheader: `How was order ${order_number}? We'd love your feedback.`, body })
}

export function reviewRequestHtmlEs({ customer_name, order_number, promo_code }) {
  const first = String(customer_name || '').split(' ')[0]
  const greeting = first ? `¿Cómo lo hicimos, ${escHtml(first)}?` : '¿Cómo lo hicimos?'
  const promoBlock = promo_code ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafc;border:2px dashed #cdd9ee;border-radius:14px;margin:0 0 26px 0;"><tr><td align="center" style="padding:20px;font-family:Arial,Helvetica,sans-serif;">
      <div style="color:#6b6f76;font-size:13px;margin-bottom:6px;">Un agradecimiento para tu próximo pedido:</div>
      <div style="color:#002b63;font-size:22px;font-weight:800;letter-spacing:2px;">${escHtml(promo_code)}</div>
    </td></tr></table>` : ''
  const body = `
    ${slipEyebrow('GRACIAS')}
    ${slipH1(greeting)}
    <p style="margin:0 0 26px 0;font-size:17px;line-height:1.65;color:#6b6f76;font-family:Arial,Helvetica,sans-serif;">El pedido <strong style="color:#111111;">${escHtml(order_number)}</strong> fue entregado — esperamos que todo haya llegado perfecto. Si tienes un momento, nos encantaría saber sobre tu experiencia. Solo responde a este correo; tus comentarios nos ayudan a mejorar.</p>
    ${promoBlock}
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" class="pl-btn" style="margin:0 auto;"><tr><td align="center" style="background:#002b63;border-radius:12px;"><a href="https://prymelabs.cc/shop" style="display:inline-block;padding:16px 40px;color:#ffffff;text-decoration:none;font-size:17px;font-weight:800;font-family:Arial,Helvetica,sans-serif;">Ordenar de Nuevo &rarr;</a></td></tr></table>`
  return prymeEmailShell({ lang: 'es', rightLabel: 'GRACIAS', preheader: `¿Cómo estuvo el pedido ${order_number}? Nos encantaría tu opinión.`, body })
}

// ── Daily owner digest ───────────────────────────────────────────────────────
export function ownerDigestHtml({ dateLabel, revenue, orderCount, awaitingPayment, pendingRevenue, toFulfill, shippedActive, deliveredYesterday, lowStock = [], outOfStock = [], quarterLabel, quarterRevenue, allTimeRevenue }) {
  const stat = (label, value, color) =>
    `<td style="padding:14px;background:#f8fbff;border:1px solid #d0dff8;border-radius:10px;text-align:center;width:25%"><div style="color:${color};font-size:26px;font-weight:800">${value}</div><div style="color:#1e3a4f;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-top:2px">${label}</div></td>`
  const lowStockRows = lowStock.length
    ? lowStock.map(p => `<tr><td style="padding:7px 10px;border-bottom:1px solid #eef2ff;color:#091a28;font-size:13px">${escHtml(p.name)}</td><td style="padding:7px 10px;border-bottom:1px solid #eef2ff;color:#b45309;font-weight:700;text-align:right;font-size:13px">${p.stock_qty} left</td></tr>`).join('')
    : `<tr><td style="padding:10px;color:#166534;font-size:13px">All products well stocked ✓</td></tr>`
  const outOfStockRows = outOfStock.length
    ? outOfStock.map(p => `<tr><td style="padding:7px 10px;border-bottom:1px solid #fee2e2;color:#091a28;font-size:13px">${escHtml(p.name)}</td><td style="padding:7px 10px;border-bottom:1px solid #fee2e2;color:#b91c1c;font-weight:700;text-align:right;font-size:13px">Out of stock</td></tr>`).join('')
    : `<tr><td style="padding:10px;color:#166534;font-size:13px">Everything in stock ✓</td></tr>`
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f0f6ff;font-family:Inter,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d0dff8;border-radius:16px;overflow:hidden">
    <div style="background:#e8f3ff;padding:20px 24px;border-bottom:1px solid #d0dff8">
      <span style="color:#091a28;font-size:18px;font-weight:800">📊 Daily Summary</span>
      <div style="color:#1e3a4f;font-size:13px;margin-top:2px">${dateLabel}</div>
    </div>
    <div style="padding:24px">
      <table width="100%" cellpadding="0" cellspacing="6" style="margin-bottom:8px"><tr>
        ${stat('Revenue 24h', '$' + Number(revenue).toFixed(0), '#0055bb')}
        ${stat('Orders 24h', orderCount, '#0055bb')}
        ${stat('To Verify', awaitingPayment, awaitingPayment > 0 ? '#b45309' : '#166534')}
        ${stat('To Fulfill', toFulfill, toFulfill > 0 ? '#b45309' : '#166534')}
      </tr></table>
      <p style="color:#64748b;font-size:11px;margin:0 0 8px;text-align:center">Revenue figures are <strong>paid (verified)</strong> orders only — pending is shown separately below.</p>
      <p style="color:#1e3a4f;font-size:13px;margin:14px 0 8px"><strong>${shippedActive}</strong> shipment(s) in transit · <strong>${deliveredYesterday}</strong> delivered yesterday</p>
      ${(quarterRevenue != null || allTimeRevenue != null) ? `<table width="100%" cellpadding="0" cellspacing="6" style="margin:8px 0"><tr>
        <td style="padding:12px;background:#f0fbf4;border:1px solid #bbf7d0;border-radius:10px;text-align:center;width:50%"><div style="color:#166534;font-size:22px;font-weight:800">$${Number(quarterRevenue || 0).toFixed(0)}</div><div style="color:#15803d;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-top:2px">${quarterLabel || 'This Quarter'} Revenue (paid)</div></td>
        <td style="padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;width:50%"><div style="color:#1d4ed8;font-size:22px;font-weight:800">$${Number(allTimeRevenue || 0).toFixed(0)}</div><div style="color:#1e40af;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;margin-top:2px">All-Time Revenue (paid)</div></td>
      </tr></table>` : ''}
      ${awaitingPayment > 0 ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin:12px 0;color:#856404;font-size:13px">⚡ <strong>$${Number(pendingRevenue || 0).toFixed(2)}</strong> pending across <strong>${awaitingPayment}</strong> unpaid order(s) awaiting your payment verification.</div>` : ''}
      <h3 style="color:#091a28;font-size:14px;margin:20px 0 8px">Low Stock${lowStock.length ? ` (${lowStock.length})` : ''}</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef2ff;border-radius:8px;overflow:hidden">${lowStockRows}</table>
      <h3 style="color:#091a28;font-size:14px;margin:20px 0 8px">Out of Stock${outOfStock.length ? ` (${outOfStock.length})` : ''}</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fee2e2;border-radius:8px;overflow:hidden">${outOfStockRows}</table>
      <div style="margin-top:22px;text-align:center"><a href="https://prymelabs.cc/admin" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:12px 26px;border-radius:8px;text-decoration:none;font-size:14px">Open Dashboard →</a></div>
    </div>
  </div>
</body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD RESET
// ─────────────────────────────────────────────────────────────────────────────

// Shared "packing-slip" email shell: white card on light-gray, PRYME LABS
// wordmark + navy right-label, tagline rules, contact footer, navy bottom bar.
// Pass the inner body HTML; footer labels localize by `lang`.
function prymeEmailShell({ lang = 'en', rightLabel = '', preheader = '', body = '' }) {
  const F = lang === 'es'
    ? { website: 'Sitio Web', email: 'Correo de Soporte', phone: 'Número de Soporte' }
    : { website: 'Website', email: 'Support Email', phone: 'Support Message Number' }
  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>Pryme Labs</title>
<!--[if mso]><style>* {font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<style>
  body{margin:0;padding:0;}
  a{text-decoration:none;}
  img{border:0;line-height:100%;outline:none;}
  @media only screen and (max-width:480px){
    .pl-pad{padding-left:24px !important;padding-right:24px !important;}
    .pl-logo{font-size:26px !important;}
    .pl-h1{font-size:28px !important;}
    .pl-label{padding:9px 14px !important;font-size:12px !important;}
    .pl-rule{display:none !important;}
    .pl-tag{padding:0 !important;font-size:11px !important;letter-spacing:3px !important;}
    .pl-btn a{padding:16px 34px !important;font-size:17px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#111111;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f5f9;font-size:1px;line-height:1px;">${escHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;">
    <tr><td align="center" style="padding:30px 12px;">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:4px;overflow:hidden;border:1px solid #d9dde5;">
        <!-- Header -->
        <tr><td class="pl-pad" style="padding:32px 40px 18px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td class="pl-logo" valign="middle">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td valign="middle" style="padding-right:8px;"><img src="https://prymelabs.cc/logo-mark-email.png" width="26" height="28" alt="" style="display:block;" /></td>
                <td valign="middle" style="font-size:34px;font-weight:800;letter-spacing:3px;color:#111111;font-family:Arial,Helvetica,sans-serif;">PRYME<span style="color:#4f7fd9;">LABS</span></td>
              </tr></table>
            </td>
            <td align="right" valign="middle"><span class="pl-label" style="display:inline-block;background:#002b63;color:#ffffff;padding:12px 22px;font-size:14px;font-weight:700;letter-spacing:1px;font-family:Arial,Helvetica,sans-serif;">${rightLabel}</span></td>
          </tr></table>
          <div style="margin-top:18px;line-height:1;">
            <span class="pl-rule" style="border-top:3px solid #002b63;width:60px;display:inline-block;vertical-align:middle;"></span>
            <span class="pl-tag" style="display:inline-block;padding:0 14px;font-size:13px;letter-spacing:4px;color:#111111;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;">PRECISION. PURITY. PERFORMANCE.</span>
            <span class="pl-rule" style="border-top:3px solid #002b63;width:60px;display:inline-block;vertical-align:middle;"></span>
          </div>
        </td></tr>
        <tr><td style="border-top:1px solid #d9dde5;font-size:0;line-height:0;">&nbsp;</td></tr>
        <!-- Body -->
        <tr><td class="pl-pad" style="padding:40px;font-family:Arial,Helvetica,sans-serif;">${body}</td></tr>
        <!-- Footer -->
        <tr><td class="pl-pad" style="padding:28px 40px;border-top:2px solid #111111;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:18px;font-weight:800;letter-spacing:3px;color:#002b63;margin-bottom:12px;">PRYME LABS</div>
          <div style="font-size:14px;line-height:1.9;color:#111111;">
            <strong>${F.website}:</strong> <a href="https://prymelabs.cc/shop" style="color:#111111;text-decoration:none;">prymelabs.cc/shop</a><br>
            <strong>${F.email}:</strong> <a href="mailto:support@prymelabs.net" style="color:#111111;text-decoration:none;">support@prymelabs.net</a><br>
            <strong>${F.phone}:</strong> 346-550-9100
          </div>
        </td></tr>
        <!-- Bottom bar -->
        <tr><td align="center" style="background:#002b63;color:#ffffff;padding:16px;font-size:13px;font-weight:700;letter-spacing:5px;font-family:Arial,Helvetica,sans-serif;">RESEARCH&nbsp;&nbsp;&bull;&nbsp;&nbsp;QUALITY&nbsp;&nbsp;&bull;&nbsp;&nbsp;INTEGRITY</td></tr>
      </table>
      <div style="font-size:12px;color:#a0a5ad;margin-top:18px;font-family:Arial,Helvetica,sans-serif;">© ${new Date().getFullYear()} Pryme Labs</div>
    </td></tr>
  </table>
</body>
</html>`
}

export function passwordResetHtml({ customer_name, username, reset_url, expires_minutes = 30 }) {
  const first = String(customer_name || '').trim().split(/\s+/)[0]
  const firstName = escHtml(first || 'there')
  const body = `
    <div style="font-size:14px;color:#4f7fd9;font-weight:800;letter-spacing:4px;margin-bottom:16px;">PASSWORD RESET</div>
    <h1 class="pl-h1" style="margin:0 0 18px 0;font-size:34px;line-height:1.15;color:#222222;font-weight:800;">Reset your password</h1>
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;">Hi ${firstName}, we received a request to reset the password for your Pryme Labs account. Click the button below to choose a new one.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafc;border:1px solid #d9dde5;border-radius:14px;margin:0 0 32px 0;"><tr><td style="padding:24px 30px;">
      <div style="font-size:13px;color:#9aa0aa;font-weight:700;letter-spacing:4px;margin-bottom:10px;">YOUR USERNAME</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:2px;color:#002b63;word-break:break-word;">${escHtml(username)}</div>
    </td></tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" class="pl-btn" style="margin:0 auto 34px auto;"><tr>
      <td align="center" style="background:#002b63;border-radius:12px;">
        <a href="${reset_url}" style="display:inline-block;padding:18px 48px;color:#ffffff;text-decoration:none;font-size:18px;font-weight:800;font-family:Arial,Helvetica,sans-serif;">Reset Password &rarr;</a>
      </td>
    </tr></table>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#8a8f99;">This link expires in <strong style="color:#333333;">${expires_minutes} minutes</strong> and can only be used once.</p>
    <p style="margin:0 0 26px 0;font-size:15px;line-height:1.6;color:#8a8f99;">If the button does not work, copy and paste this link into your browser:<br><a href="${reset_url}" style="color:#4f7fd9;word-break:break-all;">${escHtml(reset_url)}</a></p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffaf0;border:1px solid #d6a72a;border-radius:14px;"><tr><td style="padding:22px 28px;font-size:15px;line-height:1.6;color:#b38620;">If you did not request this, you can safely ignore this email — your password will not change. For help, contact <strong>support@prymelabs.net</strong>.</td></tr></table>`
  return prymeEmailShell({ lang: 'en', rightLabel: 'PASSWORD RESET', preheader: `Reset your Pryme Labs password — link expires in ${expires_minutes} minutes.`, body })
}

export function passwordResetHtmlEs({ customer_name, username, reset_url, expires_minutes = 30 }) {
  const first = String(customer_name || '').trim().split(/\s+/)[0]
  const greeting = first ? `Hola ${escHtml(first)}` : 'Hola'
  const body = `
    <div style="font-size:14px;color:#4f7fd9;font-weight:800;letter-spacing:4px;margin-bottom:16px;">RESTABLECER CONTRASEÑA</div>
    <h1 class="pl-h1" style="margin:0 0 18px 0;font-size:34px;line-height:1.15;color:#222222;font-weight:800;">Restablece tu contraseña</h1>
    <p style="margin:0 0 28px 0;font-size:17px;line-height:1.65;color:#6b6f76;">${greeting}, recibimos una solicitud para restablecer la contraseña de tu cuenta de Pryme Labs. Haz clic en el botón para elegir una nueva.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafc;border:1px solid #d9dde5;border-radius:14px;margin:0 0 32px 0;"><tr><td style="padding:24px 30px;">
      <div style="font-size:13px;color:#9aa0aa;font-weight:700;letter-spacing:4px;margin-bottom:10px;">TU USUARIO</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:2px;color:#002b63;word-break:break-word;">${escHtml(username)}</div>
    </td></tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" class="pl-btn" style="margin:0 auto 34px auto;"><tr>
      <td align="center" style="background:#002b63;border-radius:12px;">
        <a href="${reset_url}" style="display:inline-block;padding:18px 48px;color:#ffffff;text-decoration:none;font-size:18px;font-weight:800;font-family:Arial,Helvetica,sans-serif;">Restablecer Contraseña &rarr;</a>
      </td>
    </tr></table>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#8a8f99;">Este enlace caduca en <strong style="color:#333333;">${expires_minutes} minutos</strong> y solo puede usarse una vez.</p>
    <p style="margin:0 0 26px 0;font-size:15px;line-height:1.6;color:#8a8f99;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${reset_url}" style="color:#4f7fd9;word-break:break-all;">${escHtml(reset_url)}</a></p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffaf0;border:1px solid #d6a72a;border-radius:14px;"><tr><td style="padding:22px 28px;font-size:15px;line-height:1.6;color:#b38620;">Si no solicitaste esto, puedes ignorar este correo — tu contraseña no cambiará. Para ayuda, escribe a <strong>support@prymelabs.net</strong>.</td></tr></table>`
  return prymeEmailShell({ lang: 'es', rightLabel: 'RESTABLECER', preheader: `Restablece tu contraseña de Pryme Labs — el enlace caduca en ${expires_minutes} minutos.`, body })
}

// sendSMS(env, { message, to })
// - to: recipient phone; normalized to E.164 before sending
//        defaults to env.OWNER_PHONE if omitted (owner alert)
export async function sendSMS(env, { message, to } = {}) {
  if (!env.QUO_API_KEY || !env.QUO_PHONE_NUMBER) return { skipped: true }
  const recipient = smsPhone(to || env.OWNER_PHONE)
  const content = String(message || '')
  if (!recipient || !/^\+\d{10,15}$/.test(recipient)) return { skipped: true, error: 'Invalid SMS recipient phone number' }
  if (!content.trim()) return { skipped: true, error: 'Missing SMS message content' }
  if (content.length > 1600) return { error: 'SMS message exceeds provider limit' }
  const res = await fetch('https://api.openphone.com/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': env.QUO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.QUO_PHONE_NUMBER,
      to: [recipient],
      content,
    }),
  })
  if (res.ok) return { ok: true, status: res.status }
  const detail = await res.text()
  console.error('SMS failed', { status: res.status, detail })
  return { error: detail, status: res.status }
}

export async function sendEmail(env, { to, subject, html, fromEmail, fromName }) {
  if (!env.BREVO_API_KEY) return { skipped: true }
  const recipients = (Array.isArray(to) ? to : [to]).map(email => ({ email }))
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: fromName || env.STORE_NAME || 'Pryme Labs',
        email: fromEmail || env.FROM_EMAIL || 'orders@prymelabs.net',
      },
      to: recipients,
      subject,
      htmlContent: html,
    }),
  })
  return res.ok ? { ok: true } : { error: await res.text() }
}
