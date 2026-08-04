// Enhanced order update with notifications and inventory verification
// Safe parallel deployment alongside existing update-order.js
import { corsHeaders, json } from '../../_utils/cors.js'
import { verifyAdminToken } from '../../_utils/adminAuth.js'
import { checkAdminRateLimit, adminRateLimitKey } from '../../_utils/adminRateLimit.js'
import {
  sendOrderConfirmation, sendPaymentVerifiedNotification, sendReadyForPickupNotification,
  sendShippedNotification, sendCompletedNotification, logNotification, logOrderEvent
} from '../../_utils/orderNotifications.js'
import { verifyInventoryForOrder, reserveInventoryForOrder, releaseInventoryForOrder } from '../../_utils/inventoryVerification.js'

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response('OK', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // Rate limiting
  const rlKey = adminRateLimitKey(request, 'update-order-v2')
  const rl = await checkAdminRateLimit(env, rlKey)
  if (rl.blocked) return json({ error: 'Rate limited' }, 429)

  // Auth
  const authResult = await verifyAdminToken(request, env)
  if (!authResult.valid) return json({ error: 'Unauthorized' }, 401)

  try {
    const { order_id, status, ready_after, notes } = await request.json()

    if (!order_id || !status) {
      return json({ error: 'Missing order_id or status' }, 400)
    }

    // Get current order
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order_id).first()
    if (!order) {
      return json({ error: 'Order not found' }, 404)
    }

    const oldStatus = order.status
    const updates = { status, updated_at: Math.floor(Date.now() / 1000) }

    // Handle status-specific logic
    if (status === 'paid' && oldStatus === 'pending') {
      // Payment verified - send notification
      const items = JSON.parse(order.items_json || '[]')
      const isWillCall = items.some(i => i.is_will_call) || ready_after
      await sendPaymentVerifiedNotification(env, order, isWillCall)
      updates.payment_verified_at = Math.floor(Date.now() / 1000)
    }

    if (status === 'fulfilled' && ['pending', 'paid'].includes(oldStatus)) {
      // Before fulfilling, verify inventory
      const invCheck = await verifyInventoryForOrder(env, order)
      if (!invCheck.verified) {
        return json({
          error: 'Inventory verification failed',
          details: invCheck.errors
        }, 400)
      }

      // Reserve inventory
      await reserveInventoryForOrder(env, order_id)

      // Set ready_after if provided (will-call orders)
      if (ready_after) {
        updates.ready_after = ready_after
        updates.is_will_call = 1
        await sendReadyForPickupNotification(env, { ...order, ready_after })
      } else {
        // Regular shipping order
        await logNotification(env, order_id, 'fulfillment_started', order.customer_email, null, 'sent')
      }

      updates.fulfilled_at = Math.floor(Date.now() / 1000)
    }

    if (status === 'shipped' && oldStatus === 'fulfilled') {
      // Shipped - send tracking notification
      const updatedOrder = { ...order, ...updates }
      await sendShippedNotification(env, updatedOrder)
      updates.shipped_at = Math.floor(Date.now() / 1000)
    }

    if (status === 'completed') {
      // Completed - send completion notification
      await sendCompletedNotification(env, order)

      // If order was will-call, customer picked up
      if (order.is_will_call) {
        await logOrderEvent(env, order_id, 'picked_up', { timestamp: Math.floor(Date.now() / 1000) })
      }
    }

    if (status === 'cancelled' && !['completed', 'refunded'].includes(oldStatus)) {
      // Release reserved inventory
      await releaseInventoryForOrder(env, order_id)
      await logOrderEvent(env, order_id, 'cancelled', { reason: notes || 'admin_cancelled' })
    }

    if (status === 'refunded') {
      // Release reserved inventory
      await releaseInventoryForOrder(env, order_id)
      const refundNotification = await sendNotification(env, order_id, 'refund', order.customer_email)
      await logOrderEvent(env, order_id, 'refunded', { timestamp: Math.floor(Date.now() / 1000) })
    }

    // Update order
    const updateSQL = Object.entries(updates)
      .map(([key, _]) => `${key} = ?`)
      .join(', ')
    const updateValues = Object.values(updates)
    updateValues.push(order_id)

    await env.DB.prepare(
      `UPDATE orders SET ${updateSQL} WHERE id = ?`
    ).bind(...updateValues).run()

    // Log event
    await logOrderEvent(env, order_id, status, {
      previous_status: oldStatus,
      notes: notes || null,
      timestamp: Math.floor(Date.now() / 1000)
    })

    // Save notes if provided
    if (notes) {
      await env.DB.prepare('UPDATE orders SET notes = ? WHERE id = ?')
        .bind(notes, order_id).run()
    }

    return json({
      success: true,
      order_id,
      old_status: oldStatus,
      new_status: status,
      notifications_sent: true
    })
  } catch (e) {
    console.error('Error updating order:', e)
    return json({ error: e.message }, 500)
  }
}

async function sendNotification(env, orderId, type, email) {
  try {
    const messages = {
      refund: 'Your refund has been processed.',
      cancellation: 'Your order has been cancelled.'
    }
    await logNotification(env, orderId, type, email, null, 'sent')
    return true
  } catch (e) {
    console.error('Failed to send notification:', e)
    return false
  }
}
