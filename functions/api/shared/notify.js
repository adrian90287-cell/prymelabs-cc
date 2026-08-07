// Unified notification system for both prymelabs.cc and prymelabs.store
// Handles email, SMS, and web push notifications for orders
import { isSyncAuthed } from '../../_utils/syncAuth.js';
import { sendSMS } from '../../_utils/email.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  // Gate the outbound email/SMS sender — server-to-server only, never public.
  if (!isSyncAuthed(request, env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, order_id, order_number, customer_email, customer_phone, customer_name, data = {} } = body;

    // Route notification based on type
    switch (type) {
      case 'order_confirmed':
        return await notifyOrderConfirmed(env, { order_id, order_number, customer_email, customer_phone, customer_name, ...data });

      case 'payment_confirmed':
        return await notifyPaymentConfirmed(env, { order_id, order_number, customer_email, customer_phone, customer_name, ...data });

      case 'order_shipped':
        return await notifyOrderShipped(env, { order_id, order_number, customer_email, customer_phone, customer_name, ...data });

      case 'order_delivered':
        return await notifyOrderDelivered(env, { order_id, order_number, customer_email, customer_phone, customer_name, ...data });

      case 'low_stock':
        return await notifyLowStock(env, data);

      case 'admin_alert':
        return await notifyAdmin(env, data);

      default:
        return Response.json({ error: 'Unknown notification type' }, { status: 400 });
    }

  } catch (e) {
    console.error('Notification error:', e);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function notifyOrderConfirmed(env, { order_id, order_number, customer_email, customer_phone, customer_name, items, subtotal, tax_amount, shipping_cost, total }) {
  const tasks = [];
  const first_name = customer_name?.split(' ')[0] || 'Customer';

  // Email
  if (customer_email && env.BREVO_API_KEY) {
    tasks.push(
      sendEmail(env, {
        to: customer_email,
        subject: `Order Confirmed: ${order_number}`,
        html: buildOrderConfirmationEmail(order_number, first_name, items, subtotal, tax_amount, shipping_cost, total)
      })
    );
  }

  // SMS
  if (customer_phone && env.QUO_API_KEY) {
    const message = `Hi ${first_name}! Your Pryme Labs order ${order_number} has been placed ($${total}). We'll text you when it ships!`;
    tasks.push(sendSMS(env, { to: customer_phone, message }));
  }

  // Push notification to admin
  tasks.push(notifyAdminNewOrder(env, { order_number, customer_name, total }));

  const results = await Promise.allSettled(tasks);
  const failed = results.filter(r => r.status === 'rejected');

  return Response.json({
    success: failed.length === 0,
    message: `Order confirmation sent via ${results.length} channels`,
    failed: failed.length
  });
}

async function notifyPaymentConfirmed(env, { order_id, order_number, customer_email, customer_phone, customer_name, total }) {
  const tasks = [];
  const first_name = customer_name?.split(' ')[0] || 'Customer';

  // Email
  if (customer_email && env.BREVO_API_KEY) {
    tasks.push(
      sendEmail(env, {
        to: customer_email,
        subject: `Payment Confirmed: ${order_number}`,
        html: buildPaymentConfirmedEmail(order_number, first_name, total)
      })
    );
  }

  // SMS
  if (customer_phone && env.QUO_API_KEY) {
    const message = `✅ Hi ${first_name}! Your payment of $${total} for order ${order_number} has been confirmed. We're getting your order ready! 🙌`;
    tasks.push(sendSMS(env, { to: customer_phone, message }));
  }

  const results = await Promise.allSettled(tasks);
  return Response.json({ success: results.every(r => r.status === 'fulfilled') });
}

async function notifyOrderShipped(env, { order_id, order_number, customer_email, customer_phone, customer_name, carrier, tracking_number }) {
  const tasks = [];
  const first_name = customer_name?.split(' ')[0] || 'Customer';

  // Email
  if (customer_email && env.BREVO_API_KEY) {
    tasks.push(
      sendEmail(env, {
        to: customer_email,
        subject: `Order Shipped: ${order_number}`,
        html: buildShippingNotificationEmail(order_number, first_name, carrier, tracking_number)
      })
    );
  }

  // SMS
  if (customer_phone && env.QUO_API_KEY) {
    const message = `${first_name}, your Pryme Labs order ${order_number} has shipped via ${carrier}! Tracking: ${tracking_number}`;
    tasks.push(sendSMS(env, { to: customer_phone, message }));
  }

  const results = await Promise.allSettled(tasks);
  return Response.json({ success: results.every(r => r.status === 'fulfilled') });
}

async function notifyOrderDelivered(env, { order_id, order_number, customer_email, customer_phone, customer_name }) {
  const tasks = [];
  const first_name = customer_name?.split(' ')[0] || 'Customer';

  // Email
  if (customer_email && env.BREVO_API_KEY) {
    tasks.push(
      sendEmail(env, {
        to: customer_email,
        subject: `Order Delivered: ${order_number}`,
        html: buildDeliveredEmail(order_number, first_name)
      })
    );
  }

  // SMS
  if (customer_phone && env.QUO_API_KEY) {
    const message = `📬 ${first_name}, your Pryme Labs order ${order_number} has been delivered! Thanks for your purchase. 🙌`;
    tasks.push(sendSMS(env, { to: customer_phone, message }));
  }

  const results = await Promise.allSettled(tasks);
  return Response.json({ success: results.every(r => r.status === 'fulfilled') });
}

async function notifyLowStock(env, { product_code, product_name, stock_qty, threshold }) {
  if (!env.BREVO_API_KEY || !env.OWNER_EMAIL) return Response.json({ success: false });

  const html = `<h3>⚠️ Low Stock Alert</h3><p><strong>${product_name}</strong> (${product_code})</p><p>Current stock: <strong>${stock_qty}</strong> (threshold: ${threshold})</p>`;

  await sendEmail(env, {
    to: env.OWNER_EMAIL,
    subject: `Low Stock: ${product_name}`,
    html
  });

  if (env.QUO_API_KEY && env.OWNER_PHONE) {
    const message = `⚠️ Low Stock: ${product_name} has ${stock_qty} units left (threshold: ${threshold})`;
    await sendSMS(env, { to: env.OWNER_PHONE, message });
  }

  return Response.json({ success: true });
}

async function notifyAdminNewOrder(env, { order_number, customer_name, total }) {
  if (!env.OWNER_EMAIL && !env.OWNER_PHONE) return;

  const tasks = [];

  // Email alert
  if (env.BREVO_API_KEY && env.OWNER_EMAIL) {
    tasks.push(
      sendEmail(env, {
        to: env.OWNER_EMAIL,
        subject: `🛒 New Order: ${order_number}`,
        html: `<h3>New Order Received</h3><p><strong>${customer_name}</strong> placed order <strong>${order_number}</strong></p><p>Total: <strong>$${total}</strong></p><p><a href="https://prymelabs.cc/admin">View in Admin</a></p>`
      })
    );
  }

  // SMS alert
  if (env.QUO_API_KEY && env.OWNER_PHONE) {
    const message = `🛒 New Order ${order_number} — $${total} from ${customer_name}`;
    tasks.push(sendSMS(env, { to: env.OWNER_PHONE, message }));
  }

  await Promise.allSettled(tasks);
}

// ============ Email Functions ============

async function sendEmail(env, { to, subject, html }) {
  if (!env.BREVO_API_KEY) return;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'Pryme Labs', email: 'orders@prymelabs.net' },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });

  if (!response.ok) throw new Error(`Email failed: ${response.status}`);
  return await response.json();
}

function buildOrderConfirmationEmail(orderNumber, firstName, items, subtotal, tax, shipping, total) {
  return `
    <h2>Order Confirmation</h2>
    <p>Hi ${firstName},</p>
    <p>Thank you for your order! Here are your details:</p>
    <h3>Order #${orderNumber}</h3>
    <table style="width:100%; border-collapse:collapse;">
      <tr style="background:#f5f5f5;">
        <th style="padding:8px; text-align:left;">Product</th>
        <th style="padding:8px; text-align:left;">Qty</th>
        <th style="padding:8px; text-align:right;">Price</th>
      </tr>
      ${items.map(item => `
        <tr>
          <td style="padding:8px;">${item.name} (${item.size})</td>
          <td style="padding:8px;">${item.quantity}</td>
          <td style="padding:8px; text-align:right;">$${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
      `).join('')}
      <tr style="border-top:2px solid #ddd; font-weight:bold;">
        <td colspan="2" style="padding:8px; text-align:right;">Subtotal:</td>
        <td style="padding:8px; text-align:right;">$${subtotal.toFixed(2)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:8px; text-align:right;">Tax:</td>
        <td style="padding:8px; text-align:right;">$${tax.toFixed(2)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:8px; text-align:right;">Shipping:</td>
        <td style="padding:8px; text-align:right;">$${shipping.toFixed(2)}</td>
      </tr>
      <tr style="background:#e8f4f8; font-weight:bold; font-size:16px;">
        <td colspan="2" style="padding:8px; text-align:right;">TOTAL:</td>
        <td style="padding:8px; text-align:right;">$${total.toFixed(2)}</td>
      </tr>
    </table>
    <p>We'll notify you when your order ships!</p>
  `;
}

function buildPaymentConfirmedEmail(orderNumber, firstName, total) {
  return `<h2>Payment Confirmed</h2><p>Hi ${firstName},</p><p>Your payment of $${total} for order #${orderNumber} has been confirmed!</p><p>We're getting your order ready to ship.</p>`;
}

function buildShippingNotificationEmail(orderNumber, firstName, carrier, trackingNumber) {
  return `<h2>Your Order Has Shipped!</h2><p>Hi ${firstName},</p><p>Order #${orderNumber} has shipped via ${carrier}.</p><p><strong>Tracking Number:</strong> ${trackingNumber}</p>`;
}

function buildDeliveredEmail(orderNumber, firstName) {
  return `<h2>Order Delivered</h2><p>Hi ${firstName},</p><p>Your order #${orderNumber} has been delivered!</p><p>Thanks for your purchase! 🙌</p>`;
}
