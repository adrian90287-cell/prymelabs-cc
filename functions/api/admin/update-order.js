import { adminAuth } from '../../_utils/legacyAdminAuth.js'
import { corsHeaders, json } from '../../_utils/cors.js'
import {
  sendEmail, sendSMS,
  trackingNotificationHtml, trackingNotificationHtmlEs,
  paidConfirmationHtml, paidConfirmationHtmlEs,
  cancelledNotificationHtml, cancelledNotificationHtmlEs,
  refundedNotificationHtml, refundedNotificationHtmlEs,
  willCallReadyHtml, willCallReadyHtmlEs,
  willCallPickedUpHtml, willCallPickedUpHtmlEs,
} from '../../_utils/email.js'
import { uploadToOneDrive } from '../../_utils/onedrive.js'
import { statusUpdateHtml, orderReceiptHtml, isWillCall } from '../../_utils/documents.js'


export async function onRequestPost({ request, env, waitUntil }) {
  if (!await adminAuth(request, env)) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { order_id, status, tracking, notes, reship, ready_after } = body
  if (!order_id || !status) return json({ error: 'order_id and status required' }, 400)

  const validStatuses = ['pending', 'paid', 'fulfilled', 'shipped', 'completed', 'cancelled', 'refunded']
  if (!validStatuses.includes(status)) return json({ error: 'Invalid status' }, 400)

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order_id).first()
  if (!order) return json({ error: 'Order not found' }, 404)

  const now = Math.floor(Date.now() / 1000)

  // ── Reship: archive the current label + reset live tracking ────────────────
  // When a package is re-sent (e.g. carrier misdelivery), the old tracking_json
  // is pushed into tracking_history_json so it isn't lost, and the live-tracking
  // fields are cleared so the NEW label starts tracking fresh instead of showing
  // the previous (delivered/returned) status.
  if (reship && tracking?.number) {
    let history = []
    try { history = JSON.parse(order.tracking_history_json || '[]') } catch {}
    let current = null
    try { current = JSON.parse(order.tracking_json || 'null') } catch {}
    if (current?.number && current.number !== tracking.number) {
      history.push({
        ...current,
        tracking_status: order.tracking_status || '',
        delivered_at:    order.delivered_at || null,
        archived_at:     now,
        reason:          'reship',
      })
    }
    await env.DB.prepare(
      `UPDATE orders SET tracking_history_json = ?, tracking_status = '', tracking_events_json = '[]', tracking_checked_at = NULL, delivered_at = NULL WHERE id = ?`
    ).bind(JSON.stringify(history), order_id).run()
  }

  const trackingStr = tracking ? JSON.stringify(tracking) : null
  const timestampCol = status === 'paid' ? 'paid_at' : status === 'fulfilled' ? 'fulfilled_at' : status === 'shipped' ? 'shipped_at' : null

  // Build the SET clause from whichever optional fields were actually provided —
  // avoids the combinatorial if/else branching this used to need per field.
  const cols = ['status = ?']
  const params = [status]
  if (timestampCol) { cols.push(`${timestampCol} = ?`); params.push(now) }
  if (trackingStr != null) { cols.push('tracking_json = ?'); params.push(trackingStr) }
  if (notes != null) { cols.push('notes = ?'); params.push(notes) }
  if (ready_after != null) { cols.push('ready_after = ?'); params.push(ready_after) }
  params.push(order_id)

  await env.DB.prepare(`UPDATE orders SET ${cols.join(', ')} WHERE id = ?`).bind(...params).run()

  // Restore stock when cancelling or refunding a non-cancelled/refunded order
  const wasActive = !['cancelled', 'refunded'].includes(order.status)
  const isNowInactive = ['cancelled', 'refunded'].includes(status)

  if (wasActive && isNowInactive) {
    const items = JSON.parse(order.items_json || '[]')
    const restoreUpdates = items
      .filter(i => i.product_id)
      .map(i => env.DB.prepare(
        // Only restore tracked products (stock_qty > 0 = has stock, OR in_stock = 0 = was fully depleted by this order)
        // Skips unlimited products (stock_qty = 0 AND in_stock = 1) so they stay untracked
        'UPDATE products SET stock_qty = stock_qty + ?, in_stock = 1 WHERE id = ? AND (stock_qty > 0 OR in_stock = 0)'
      ).bind(i.qty, i.product_id))
    if (restoreUpdates.length > 0) await env.DB.batch(restoreUpdates)
  }

  // ── Low-stock check when fulfilled (admin is physically picking the items) ──
  if (status === 'fulfilled') {
    const items = JSON.parse(order.items_json || '[]')
    const trackedItems = items.filter(i => i.product_id)
    if (trackedItems.length > 0) {
      const alertProducts = []
      for (const item of trackedItems) {
        const p = await env.DB.prepare(
          'SELECT name, stock_qty, low_stock_threshold FROM products WHERE id = ?'
        ).bind(item.product_id).first()
        if (p && p.stock_qty > 0 && p.low_stock_threshold > 0 && p.stock_qty <= p.low_stock_threshold) {
          alertProducts.push({ name: p.name, qty: p.stock_qty, threshold: p.low_stock_threshold })
        }
      }
      if (alertProducts.length > 0) {
        const alertRows = alertProducts.map(p =>
          `<tr><td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;color:#e4e4e7">${p.name}</td><td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;color:#f59e0b;font-weight:700;text-align:center">${p.qty}</td><td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;color:#71717a;text-align:center">${p.threshold}</td></tr>`
        ).join('')
        if (env.OWNER_EMAIL) {
          waitUntil(sendEmail(env, {
            to: env.OWNER_EMAIL,
            subject: `⚠️ Low Stock Alert — ${alertProducts.length} item${alertProducts.length > 1 ? 's' : ''} running low (order ${order.order_number})`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#09090b;font-family:Inter,Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:32px 16px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td style="background:#12121f;border-radius:16px 16px 0 0;padding:24px 32px;border-bottom:1px solid #1e1e2e"><img src="https://prymelabs.cc/logo-mark.png" alt="" width="17" height="18" style="vertical-align:middle;margin-right:6px" /><span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.12em;vertical-align:middle">PRYME<span style="color:#3b82f6">LABS</span></span></td></tr><tr><td style="background:#12121f;padding:32px"><p style="color:#f59e0b;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;margin:0 0 8px">⚠️ Low Stock Alert</p><h2 style="color:#fff;font-size:20px;margin:0 0 8px">Products need restocking</h2><p style="color:#71717a;font-size:14px;margin:0 0 20px">Triggered when fulfilling order ${order.order_number}</p><table width="100%" cellpadding="0" cellspacing="0"><thead><tr><th style="padding:8px 12px;background:#1a1a2e;color:#71717a;font-size:11px;text-transform:uppercase;text-align:left">Product</th><th style="padding:8px 12px;background:#1a1a2e;color:#71717a;font-size:11px;text-transform:uppercase;text-align:center">Qty Left</th><th style="padding:8px 12px;background:#1a1a2e;color:#71717a;font-size:11px;text-transform:uppercase;text-align:center">Alert At</th></tr></thead><tbody>${alertRows}</tbody></table><div style="margin-top:24px"><a href="https://prymelabs.cc/admin" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px">View Inventory →</a></div></td></tr></table></td></tr></table></body></html>`,
          }).catch(() => {}))
        }
        waitUntil(sendSMS(env, {
          message: `⚠️ Low Stock on order ${order.order_number}:\n${alertProducts.map(p => `• ${p.name}: ${p.qty} left`).join('\n')}\nRestock needed.`,
        }).catch(() => {}))
      }
    }
  }

  // ── Customer notifications — resolve shared context once for all statuses ──
  const custItems       = JSON.parse(order.items_json || '[]')
  const custShipping    = JSON.parse(order.shipping_json || '{}')
  const custPhone       = custShipping?.phone?.trim()
  const custFirstName   = (order.customer_name || '').split(' ')[0]
  const custTotal       = Number(order.order_total || order.subtotal || 0)

  let userLang = 'en'
  if (order.user_id) {
    const userRow = await env.DB.prepare('SELECT lang FROM users WHERE id = ?').bind(order.user_id).first()
    userLang = userRow?.lang || 'en'
  }
  const isEs = userLang === 'es'

  // ── Paid: payment verified ─────────────────────────────────────────────────
  if (status === 'paid' && order.customer_email) {
    waitUntil(sendEmail(env, {
      to: order.customer_email,
      subject: isEs
        ? `✅ Pago Confirmado — ${order.order_number}`
        : `✅ Payment Confirmed — ${order.order_number}`,
      html: isEs
        ? paidConfirmationHtmlEs({ order_number: order.order_number, customer_name: order.customer_name, items: custItems, total: custTotal, payment_method: order.payment_method })
        : paidConfirmationHtml({ order_number: order.order_number, customer_name: order.customer_name, items: custItems, total: custTotal, payment_method: order.payment_method }),
    }).catch(() => {}))
    if (custPhone) {
      waitUntil(sendSMS(env, {
        to: custPhone,
        message: isEs
          ? `✅ ¡Hola ${custFirstName}! Tu pago de $${custTotal.toFixed(2)} para el pedido ${order.order_number} ha sido confirmado. Estamos preparando tu pedido. 🙌`
          : `✅ Hi ${custFirstName}! Your payment of $${custTotal.toFixed(2)} for order ${order.order_number} has been confirmed. We're getting your order ready! 🙌`,
      }).catch(() => {}))
    }
  }

  // ── Will Call: ready for pickup (fulfilled) ────────────────────────────────
  if (status === 'fulfilled' && isWillCall(order) && order.customer_email) {
    waitUntil(sendEmail(env, {
      to: order.customer_email,
      subject: isEs ? `🏷️ Listo para recoger — ${order.order_number}` : `🏷️ Ready for Pickup — ${order.order_number}`,
      html: isEs
        ? willCallReadyHtmlEs({ order_number: order.order_number, customer_name: order.customer_name, items: custItems, total: custTotal })
        : willCallReadyHtml({ order_number: order.order_number, customer_name: order.customer_name, items: custItems, total: custTotal }),
    }).catch(() => {}))
    if (custPhone) {
      waitUntil(sendSMS(env, {
        to: custPhone,
        message: isEs
          ? `🏷️ ¡Hola ${custFirstName}! Tu pedido de Pryme Labs ${order.order_number} está listo para recoger en la tienda. ¡Te esperamos!`
          : `🏷️ Hi ${custFirstName}! Your Pryme Labs order ${order.order_number} is ready for pickup at the store. See you soon!`,
      }).catch(() => {}))
    }
  }

  // ── Will Call: picked up (completed) ───────────────────────────────────────
  if (status === 'completed' && isWillCall(order) && order.customer_email) {
    waitUntil(sendEmail(env, {
      to: order.customer_email,
      subject: isEs ? `✅ Pedido recogido — ${order.order_number}` : `✅ Order Picked Up — ${order.order_number}`,
      html: isEs
        ? willCallPickedUpHtmlEs({ order_number: order.order_number, customer_name: order.customer_name, items: custItems, total: custTotal })
        : willCallPickedUpHtml({ order_number: order.order_number, customer_name: order.customer_name, items: custItems, total: custTotal }),
    }).catch(() => {}))
    if (custPhone) {
      waitUntil(sendSMS(env, {
        to: custPhone,
        message: isEs
          ? `✅ ${custFirstName}, gracias por recoger tu pedido de Pryme Labs ${order.order_number}. ¡Hasta la próxima!`
          : `✅ ${custFirstName}, thanks for picking up your Pryme Labs order ${order.order_number}. See you next time!`,
      }).catch(() => {}))
    }
  }

  // ── Cancelled ──────────────────────────────────────────────────────────────
  if (status === 'cancelled' && order.customer_email) {
    waitUntil(sendEmail(env, {
      to: order.customer_email,
      subject: isEs
        ? `❌ Pedido Cancelado — ${order.order_number}`
        : `❌ Order Cancelled — ${order.order_number}`,
      html: isEs
        ? cancelledNotificationHtmlEs({ order_number: order.order_number, customer_name: order.customer_name, items: custItems, total: custTotal })
        : cancelledNotificationHtml({ order_number: order.order_number, customer_name: order.customer_name, items: custItems, total: custTotal }),
    }).catch(() => {}))
    if (custPhone) {
      waitUntil(sendSMS(env, {
        to: custPhone,
        message: isEs
          ? `❌ ${custFirstName}, tu pedido de Pryme Labs ${order.order_number} ha sido cancelado. ¿Preguntas? Llámanos al (346) 550-9100`
          : `❌ ${custFirstName}, your Pryme Labs order ${order.order_number} has been cancelled. Questions? Call us at (346) 550-9100`,
      }).catch(() => {}))
    }
  }

  // ── Refunded ───────────────────────────────────────────────────────────────
  if (status === 'refunded' && order.customer_email) {
    waitUntil(sendEmail(env, {
      to: order.customer_email,
      subject: isEs
        ? `💸 Reembolso Emitido — ${order.order_number}`
        : `💸 Refund Issued — ${order.order_number}`,
      html: isEs
        ? refundedNotificationHtmlEs({ order_number: order.order_number, customer_name: order.customer_name, items: custItems, total: custTotal, payment_method: order.payment_method })
        : refundedNotificationHtml({ order_number: order.order_number, customer_name: order.customer_name, items: custItems, total: custTotal, payment_method: order.payment_method }),
    }).catch(() => {}))
    if (custPhone) {
      waitUntil(sendSMS(env, {
        to: custPhone,
        message: isEs
          ? `💸 ${custFirstName}, tu reembolso de $${custTotal.toFixed(2)} para el pedido ${order.order_number} ha sido emitido. Puede tardar 3–5 días hábiles en reflejarse en tu cuenta.`
          : `💸 ${custFirstName}, your refund of $${custTotal.toFixed(2)} for order ${order.order_number} has been issued. Please allow 3–5 business days to reflect in your account.`,
      }).catch(() => {}))
    }
  }

  // ── Shipped: tracking notification ────────────────────────────────────────
  if (status === 'shipped' && tracking?.number) {
    // Email notification — use waitUntil so Cloudflare keeps the Worker alive
    if (order.customer_email) {
      waitUntil(sendEmail(env, {
        to: order.customer_email,
        subject: isEs
          ? `📦 Tu Pedido Ha Sido Enviado — ${order.order_number}`
          : `📦 Your Order Has Shipped — ${order.order_number}`,
        html: isEs
          ? trackingNotificationHtmlEs({
              order_number: order.order_number,
              customer_name: order.customer_name,
              items: custItems,
              total: order.subtotal,
              carrier: tracking.carrier,
              tracking_number: tracking.number,
            })
          : trackingNotificationHtml({
              order_number: order.order_number,
              customer_name: order.customer_name,
              items: custItems,
              total: order.subtotal,
              carrier: tracking.carrier,
              tracking_number: tracking.number,
            }),
      }).catch(() => {}))
    }

    // SMS notification (if customer provided phone)
    if (custPhone) {
      waitUntil(sendSMS(env, {
        to: custPhone,
        message: isEs
          ? `${custFirstName}, ¡tu pedido de Pryme Labs ${order.order_number} ha sido enviado vía ${tracking.carrier || 'carrier'}! Rastreo: ${tracking.number}`
          : `${custFirstName}, your Pryme Labs order ${order.order_number} has shipped via ${tracking.carrier || 'carrier'}! Tracking: ${tracking.number}`,
      }).catch(() => {}))
    }
  }

  // ── OneDrive backup ───────────────────────────────────────────────────────
  // Numbered folder paths — match physical OneDrive structure exactly
  const backupDate = new Date()
  const monthKey   = `${backupDate.getFullYear()}-${String(backupDate.getMonth() + 1).padStart(2, '0')}`
  const dateStr    = backupDate.toISOString().slice(0, 10)
  const safeNum    = (order.order_number || '').replace(/[^a-zA-Z0-9-]/g, '')
  const capStatus  = status.charAt(0).toUpperCase() + status.slice(1)

  // Map each status to its numbered stage folder
  const STAGE_FOLDER = {
    paid:      '02 Paid Orders',
    fulfilled: '03 Fulfilled Orders',
    shipped:   '04 Shipped Orders',
    completed: '05 Completed Orders',
    cancelled: '06 Cancelled & Refunded Orders',
    refunded:  '06 Cancelled & Refunded Orders',
  }

  const stageFolder = STAGE_FOLDER[status]
  const updatedDoc  = { ...order, status, tracking: tracking || JSON.parse(order.tracking_json || 'null') }
  // Will Call orders are filed into a matching "Will Call" subfolder at each
  // stage so the pickup lifecycle stays organized alongside the storefront one.
  const wcSuffix    = isWillCall(order) ? '/Will Call' : ''

  // 1. Admin status log — always saved for every change → 13 Admin/Status Logs
  waitUntil(uploadToOneDrive(env, {
    folderPath: `prymelabs-cc/Store Operations/13 Admin/Status Logs/${monthKey}${wcSuffix}`,
    filename:   `${safeNum} - ${capStatus} - ${dateStr}.html`,
    content:    statusUpdateHtml(order, status, tracking),
  }).catch(() => {}))

  // 2. Save full order receipt to the appropriate stage folder
  if (stageFolder) {
    waitUntil(uploadToOneDrive(env, {
      folderPath: `prymelabs-cc/Store Operations/${stageFolder}/${monthKey}${wcSuffix}`,
      filename:   `${safeNum} - ${capStatus} - ${dateStr}.html`,
      content:    orderReceiptHtml(updatedDoc),
    }).catch(() => {}))
  }

  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
