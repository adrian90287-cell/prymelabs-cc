// Order notification utilities - centralized notification handling
import { sendEmail, customerConfirmationHtml, customerConfirmationHtmlEs, paidConfirmationHtml, paidConfirmationHtmlEs, willCallReadyHtml, willCallReadyHtmlEs, trackingNotificationHtml, trackingNotificationHtmlEs, deliveredNotificationHtml, deliveredNotificationHtmlEs, willCallPickedUpHtml, willCallPickedUpHtmlEs } from './email.js'

export async function logNotification(env, orderId, notificationType, recipientEmail, recipientPhone, status = 'sent', errorMessage = null) {
  try {
    await env.DB.prepare(
      'INSERT INTO order_notifications (order_id, notification_type, recipient_email, recipient_phone, status, error_message) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(orderId, notificationType, recipientEmail, recipientPhone, status, errorMessage).run()
  } catch (e) {
    console.error('Failed to log notification:', e)
  }
}

export async function logOrderEvent(env, orderId, eventType, eventData = null) {
  try {
    await env.DB.prepare(
      'INSERT INTO order_events (order_id, event_type, event_data) VALUES (?, ?, ?)'
    ).bind(orderId, eventType, eventData ? JSON.stringify(eventData) : null).run()
  } catch (e) {
    console.error('Failed to log event:', e)
  }
}

export async function sendOrderConfirmation(env, order) {
  try {
    if (!order.customer_email) return { success: false, error: 'No customer email' }

    const user = await env.DB.prepare('SELECT lang FROM users WHERE email = ?').bind(order.customer_email).first()
    const isEs = user?.lang === 'es'

    const items = JSON.parse(order.items_json || '[]')
    const shipping = JSON.parse(order.shipping_json || '{}')

    const html = isEs
      ? customerConfirmationHtmlEs({
          order_number: order.order_number,
          customer_name: order.customer_name,
          items,
          subtotal: order.subtotal,
          total: order.order_total,
          promo_code: order.promo_code,
          discount_amount: order.discount_amount || 0,
          shipping_cost: order.shipping_cost || 0,
          shipping_rate_name: order.shipping_rate_name,
          tax_rate: order.tax_rate || 0,
          tax_amount: order.tax_amount || 0,
          payment_method: order.payment_method,
          payment_handle: order.payment_handle,
          shipping
        })
      : customerConfirmationHtml({
          order_number: order.order_number,
          customer_name: order.customer_name,
          items,
          subtotal: order.subtotal,
          total: order.order_total,
          promo_code: order.promo_code,
          discount_amount: order.discount_amount || 0,
          shipping_cost: order.shipping_cost || 0,
          shipping_rate_name: order.shipping_rate_name,
          tax_rate: order.tax_rate || 0,
          tax_amount: order.tax_amount || 0,
          payment_method: order.payment_method,
          payment_handle: order.payment_handle,
          shipping
        })

    const subject = isEs ? 'Confirmación de Pedido' : 'Order Confirmation'

    await sendEmail(env, {
      to: order.customer_email,
      subject,
      html
    })
    await logNotification(env, order.id, 'order_confirmation', order.customer_email, null, 'sent')

    return { success: true }
  } catch (e) {
    console.error('Failed to send order confirmation:', e)
    await logNotification(env, order.id, 'order_confirmation', order.customer_email, null, 'failed', e.message)
    return { success: false, error: e.message }
  }
}

export async function sendPaymentVerifiedNotification(env, order, isWillCall = false) {
  try {
    if (!order.customer_email) return { success: false, error: 'No customer email' }

    const user = await env.DB.prepare('SELECT lang FROM users WHERE email = ?').bind(order.customer_email).first()
    const isEs = user?.lang === 'es'

    const items = JSON.parse(order.items_json || '[]')

    const html = isEs
      ? paidConfirmationHtmlEs({
          order_number: order.order_number,
          customer_name: order.customer_name,
          items,
          total: order.order_total,
          payment_method: order.payment_method
        })
      : paidConfirmationHtml({
          order_number: order.order_number,
          customer_name: order.customer_name,
          items,
          total: order.order_total,
          payment_method: order.payment_method
        })

    const subject = isEs ? 'Pago Confirmado' : 'Payment Confirmed'

    await sendEmail(env, {
      to: order.customer_email,
      subject,
      html
    })
    await logNotification(env, order.id, 'payment_verified', order.customer_email, null, 'sent')

    return { success: true }
  } catch (e) {
    console.error('Failed to send payment verified notification:', e)
    await logNotification(env, order.id, 'payment_verified', order.customer_email, null, 'failed', e.message)
    return { success: false, error: e.message }
  }
}

export async function sendReadyForPickupNotification(env, order) {
  try {
    if (!order.customer_email) return { success: false, error: 'No customer email' }

    const user = await env.DB.prepare('SELECT lang FROM users WHERE email = ?').bind(order.customer_email).first()
    const isEs = user?.lang === 'es'

    const items = JSON.parse(order.items_json || '[]')

    const html = isEs
      ? willCallReadyHtmlEs({
          order_number: order.order_number,
          customer_name: order.customer_name,
          items,
          total: order.order_total
        })
      : willCallReadyHtml({
          order_number: order.order_number,
          customer_name: order.customer_name,
          items,
          total: order.order_total
        })

    const subject = isEs ? 'Listo para Recoger' : 'Ready for Pickup'

    await sendEmail(env, {
      to: order.customer_email,
      subject,
      html
    })
    await logNotification(env, order.id, 'ready_for_pickup', order.customer_email, null, 'sent')

    return { success: true }
  } catch (e) {
    console.error('Failed to send ready notification:', e)
    await logNotification(env, order.id, 'ready_for_pickup', order.customer_email, null, 'failed', e.message)
    return { success: false, error: e.message }
  }
}

export async function sendShippedNotification(env, order) {
  try {
    if (!order.customer_email) return { success: false, error: 'No customer email' }

    const user = await env.DB.prepare('SELECT lang FROM users WHERE email = ?').bind(order.customer_email).first()
    const isEs = user?.lang === 'es'

    const items = JSON.parse(order.items_json || '[]')
    const tracking = typeof order.tracking === 'string' ? JSON.parse(order.tracking) : order.tracking || {}

    const html = isEs
      ? trackingNotificationHtmlEs({
          order_number: order.order_number,
          customer_name: order.customer_name,
          items,
          total: order.order_total,
          carrier: tracking.carrier,
          tracking_number: tracking.number
        })
      : trackingNotificationHtml({
          order_number: order.order_number,
          customer_name: order.customer_name,
          items,
          total: order.order_total,
          carrier: tracking.carrier,
          tracking_number: tracking.number
        })

    const subject = isEs ? 'Tu Pedido Ha Sido Enviado' : 'Your Order Has Shipped'

    await sendEmail(env, {
      to: order.customer_email,
      subject,
      html
    })
    await logNotification(env, order.id, 'shipped', order.customer_email, null, 'sent')

    return { success: true }
  } catch (e) {
    console.error('Failed to send shipped notification:', e)
    await logNotification(env, order.id, 'shipped', order.customer_email, null, 'failed', e.message)
    return { success: false, error: e.message }
  }
}

export async function sendCompletedNotification(env, order) {
  try {
    if (!order.customer_email) return { success: false, error: 'No customer email' }

    const user = await env.DB.prepare('SELECT lang FROM users WHERE email = ?').bind(order.customer_email).first()
    const isEs = user?.lang === 'es'

    const items = JSON.parse(order.items_json || '[]')

    let html
    if (order.is_will_call) {
      html = isEs
        ? willCallPickedUpHtmlEs({
            order_number: order.order_number,
            customer_name: order.customer_name,
            items,
            total: order.order_total
          })
        : willCallPickedUpHtml({
            order_number: order.order_number,
            customer_name: order.customer_name,
            items,
            total: order.order_total
          })
    } else {
      html = isEs
        ? deliveredNotificationHtmlEs({
            order_number: order.order_number,
            customer_name: order.customer_name,
            items,
            total: order.order_total
          })
        : deliveredNotificationHtml({
            order_number: order.order_number,
            customer_name: order.customer_name,
            items,
            total: order.order_total
          })
    }

    const subject = isEs ? 'Pedido Completado' : 'Order Complete'

    await sendEmail(env, {
      to: order.customer_email,
      subject,
      html
    })
    await logNotification(env, order.id, 'completed', order.customer_email, null, 'sent')

    return { success: true }
  } catch (e) {
    console.error('Failed to send completed notification:', e)
    await logNotification(env, order.id, 'completed', order.customer_email, null, 'failed', e.message)
    return { success: false, error: e.message }
  }
}

export async function getNotificationHistory(env, orderId) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT notification_type, status, sent_at FROM order_notifications WHERE order_id = ? ORDER BY sent_at DESC'
    ).bind(orderId).all()
    return results || []
  } catch (e) {
    console.error('Failed to get notification history:', e)
    return []
  }
}

export async function getOrderEventHistory(env, orderId) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT event_type, event_data, created_at FROM order_events WHERE order_id = ? ORDER BY created_at DESC'
    ).bind(orderId).all()
    return results || []
  } catch (e) {
    console.error('Failed to get event history:', e)
    return []
  }
}
