// Public order tracking endpoint - allows customers to check order status
// Security: requires both order_number and email for access

import { json } from '../../_utils/cors.js'
import { checkRateLimit, rateLimitKey } from '../../_utils/rateLimit.js'

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // Rate-limit by IP — prevents brute-forcing order_number/email combos
  // to pull another customer's name and shipping address.
  const rlKey = rateLimitKey(request, 'track-order')
  const rl = await checkRateLimit(env, rlKey)
  if (rl.blocked) {
    return json({ error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60)} minute(s).` }, 429)
  }

  try {
    const url = new URL(request.url)
    const orderNumber = url.searchParams.get('order_number')
    const customerEmail = url.searchParams.get('email')

    if (!orderNumber || !customerEmail) {
      return json({
        error: 'Missing required parameters: order_number and email'
      }, 400)
    }

    // Find order (verify email matches)
    const order = await env.DB.prepare(
      'SELECT * FROM orders WHERE order_number = ? AND customer_email = ?'
    ).bind(orderNumber, customerEmail).first()

    if (!order) {
      return json({
        error: 'Order not found. Please check your order number and email.'
      }, 404)
    }

    // Build customer-safe response (no sensitive data)
    const items = JSON.parse(order.items_json || '[]')
    const shipping = JSON.parse(order.shipping_json || '{}')

    // Status timeline
    const timeline = buildTimeline(order)

    // Pickup info for will-call
    let pickupInfo = null
    if (order.is_will_call && order.ready_after) {
      pickupInfo = {
        ready_after: order.ready_after,
        ready_date: new Date(order.ready_after * 1000).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        instructions: 'Your order is ready for pickup at our store.'
      }
    }

    // Tracking info for shipped
    let trackingInfo = null
    if (order.tracking) {
      const tracking = typeof order.tracking === 'string' ? JSON.parse(order.tracking) : order.tracking
      if (tracking.number) {
        trackingInfo = {
          number: tracking.number,
          carrier: tracking.carrier || 'Unknown',
          url: tracking.url || null
        }
      }
    }

    return json({
      order: {
        order_number: order.order_number,
        status: order.status,
        created_at: order.created_at,
        items,
        subtotal: order.subtotal,
        shipping_cost: order.shipping_cost,
        tax_amount: order.tax_amount,
        order_total: order.order_total
      },
      timeline,
      tracking: trackingInfo,
      pickup: pickupInfo,
      shipping: {
        name: shipping.name,
        address: shipping.address,
        city: shipping.city,
        state: shipping.state,
        zip: shipping.zip,
        country: shipping.country
      },
      last_updated: order.updated_at
    })
  } catch (e) {
    console.error('Error fetching order:', e)
    return json({ error: 'Failed to retrieve order' }, 500)
  }
}

function buildTimeline(order) {
  const timeline = []

  // Order created
  timeline.push({
    status: 'created',
    timestamp: order.created_at,
    label: 'Order Received',
    description: 'Your order has been received and is being processed.'
  })

  // Payment verified
  if (order.payment_verified_at) {
    timeline.push({
      status: 'payment_verified',
      timestamp: order.payment_verified_at,
      label: order.is_will_call ? 'Payment Verified' : 'Payment Received',
      description: order.is_will_call
        ? 'Your payment has been verified. We are preparing your order.'
        : 'Your payment has been received. Your order is being prepared.'
    })
  }

  // Ready for pickup (will-call only)
  if (order.is_will_call && order.ready_after) {
    timeline.push({
      status: 'ready_for_pickup',
      timestamp: order.ready_after,
      label: 'Ready for Pickup',
      description: `Your order is ready to pick up. Available from: ${new Date(order.ready_after * 1000).toLocaleDateString()}`
    })
  }

  // Shipped
  if (order.shipped_at) {
    timeline.push({
      status: 'shipped',
      timestamp: order.shipped_at,
      label: 'Shipped',
      description: 'Your order has been shipped. Use the tracking number to monitor delivery.'
    })
  }

  // Completed
  if (order.status === 'completed' || order.status === 'refunded') {
    if (order.is_will_call) {
      timeline.push({
        status: 'completed',
        timestamp: order.updated_at,
        label: 'Picked Up',
        description: 'Thank you for your purchase!'
      })
    } else {
      timeline.push({
        status: 'completed',
        timestamp: order.updated_at,
        label: 'Delivered',
        description: 'Your order has been delivered. Thank you for your purchase!'
      })
    }
  }

  // Cancelled
  if (order.status === 'cancelled') {
    timeline.push({
      status: 'cancelled',
      timestamp: order.updated_at,
      label: 'Cancelled',
      description: 'This order has been cancelled.'
    })
  }

  // Refunded
  if (order.status === 'refunded') {
    timeline.push({
      status: 'refunded',
      timestamp: order.updated_at,
      label: 'Refunded',
      description: 'Your refund has been processed.'
    })
  }

  return timeline
}
