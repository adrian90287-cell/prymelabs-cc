import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import '../styles/OrderTrackingPage.css'

export default function OrderTrackingPage() {
  const [searchParams] = useSearchParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const orderNumber = searchParams.get('order')
  const email = searchParams.get('email')

  useEffect(() => {
    if (!orderNumber || !email) {
      setError('Please provide order number and email')
      setLoading(false)
      return
    }

    const fetchOrder = async () => {
      try {
        const res = await fetch(
          `/api/orders/track?order_number=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`
        )
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Order not found')
        }
        const data = await res.json()
        setOrder(data)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
  }, [orderNumber, email])

  if (loading) {
    return (
      <div className="tracking-container">
        <div className="loading">Loading order details...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="tracking-container">
        <div className="error-box">
          <h2>Order Not Found</h2>
          <p>{error}</p>
          <p>Please double-check your order number and email address.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tracking-container" data-build="cache-bust-2">
      <div className="tracking-header">
        <h1>Order Status</h1>
        <p className="order-number">Order #{order.order.order_number}</p>
      </div>

      {/* Status Timeline */}
      <div className="timeline-section">
        <h2>Order Timeline</h2>
        <div className="timeline">
          {order.timeline.map((step, idx) => (
            <div key={idx} className="timeline-item">
              <div className="timeline-marker">
                <div className="marker-circle"></div>
                {idx < order.timeline.length - 1 && <div className="marker-line"></div>}
              </div>
              <div className="timeline-content">
                <h3>{step.label}</h3>
                <p className="timestamp">
                  {new Date(step.timestamp * 1000).toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                <p className="description">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shipping Info */}
      {order.shipping && (
        <div className="shipping-section">
          <h2>Shipping Address</h2>
          <div className="shipping-info">
            <p>{order.shipping.name}</p>
            <p>{order.shipping.address}</p>
            <p>{order.shipping.city}, {order.shipping.state} {order.shipping.zip}</p>
            <p>{order.shipping.country}</p>
          </div>
        </div>
      )}

      {/* Tracking Info */}
      {order.tracking && (
        <div className="tracking-section">
          <h2>Tracking Information</h2>
          <div className="tracking-info">
            <p><strong>Carrier:</strong> {order.tracking.carrier}</p>
            <p><strong>Tracking Number:</strong> {order.tracking.number}</p>
            {order.tracking.url && (
              <p>
                <a href={order.tracking.url} target="_blank" rel="noopener noreferrer">
                  Track Your Package →
                </a>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Pickup Info */}
      {order.pickup && (
        <div className="pickup-section">
          <h2>Pickup Information</h2>
          <div className="pickup-info">
            <p className="ready-date">
              <strong>Ready After:</strong> {order.pickup.ready_date}
            </p>
            <p>{order.pickup.instructions}</p>
          </div>
        </div>
      )}

      {/* Order Summary */}
      <div className="order-summary-section">
        <h2>Order Summary</h2>
        <div className="items">
          {order.order.items.map((item, idx) => (
            <div key={idx} className="order-item">
              <span>{item.name}</span>
              <span>× {item.qty}</span>
            </div>
          ))}
        </div>
        <div className="totals">
          <div className="total-row">
            <span>Subtotal</span>
            <span>${(order.order.subtotal / 100).toFixed(2)}</span>
          </div>
          <div className="total-row">
            <span>Shipping</span>
            <span>${(order.order.shipping_cost / 100).toFixed(2)}</span>
          </div>
          <div className="total-row">
            <span>Tax</span>
            <span>${(order.order.tax_amount / 100).toFixed(2)}</span>
          </div>
          <div className="total-row final">
            <span>Total</span>
            <span>${(order.order.order_total / 100).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Help Text */}
      <div className="help-section">
        <p>Questions about your order? Contact us for support.</p>
      </div>
    </div>
  )
}
