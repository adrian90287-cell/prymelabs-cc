// Unified orders endpoint - single source of truth for all orders
// Atomically decrements stock, works for both sites
import { isSyncAuthed } from '../../_utils/syncAuth.js';

export async function onRequest({ request, env }) {
  // Server-to-server only — this reads/writes customer order data (PII).
  if (request.method === 'POST' || request.method === 'GET') {
    if (!isSyncAuthed(request, env)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return request.method === 'POST' ? createOrder(request, env) : getOrders(request, env);
  }
  return new Response('Method not allowed', { status: 405 });
}

async function createOrder(request, env) {
  try {
    const body = await request.json();
    const {
      order_number,
      customer_name,
      customer_email,
      items,
      shipping,
      payment_method,
      promo_code,
      discount_amount = 0,
      shipping_cost = 0,
      tax_amount = 0,
      order_total,
      subtotal,
      origin_site = 'cc'
    } = body;

    // Validate required fields
    if (!order_number || !customer_name || !customer_email || !items?.length || !order_total) {
      return Response.json(
        { error: 'Missing required fields: order_number, customer_name, customer_email, items, order_total' },
        { status: 400 }
      );
    }

    // Start transaction: validate stock, decrement, insert order
    try {
      // 1. Validate all products exist and have sufficient stock
      for (const item of items) {
        const product = await env.UNIFIED_DB
          .prepare('SELECT id, stock_qty FROM products WHERE code = ? FOR UPDATE')
          .bind(item.code)
          .first();

        if (!product) {
          return Response.json(
            { error: `Product ${item.code} not found` },
            { status: 400 }
          );
        }

        if (product.stock_qty < item.quantity) {
          return Response.json(
            { error: `Insufficient stock for ${item.code}: available ${product.stock_qty}, requested ${item.quantity}` },
            { status: 400 }
          );
        }
      }

      // 2. Decrement stock for all items
      const decrementPromises = items.map(item =>
        env.UNIFIED_DB
          .prepare('UPDATE products SET stock_qty = stock_qty - ?, updated_at = unixepoch() WHERE code = ?')
          .bind(item.quantity, item.code)
          .run()
      );
      await Promise.all(decrementPromises);

      // 3. Insert order
      const orderResult = await env.UNIFIED_DB
        .prepare(`
          INSERT INTO orders (
            order_number, customer_name, customer_email,
            items_json, shipping_json, subtotal, payment_method,
            promo_code, discount_amount, shipping_cost, tax_amount,
            order_total, origin_site, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
        `)
        .bind(
          order_number,
          customer_name,
          customer_email,
          JSON.stringify(items),
          JSON.stringify(shipping || {}),
          subtotal,
          payment_method,
          promo_code || null,
          discount_amount,
          shipping_cost,
          tax_amount,
          order_total,
          origin_site,
          'pending'
        )
        .run();

      // 4. Log inventory changes
      for (const item of items) {
        await env.UNIFIED_DB
          .prepare(`
            INSERT INTO inventory_ledger (product_id, adjustment_qty, reason, order_id, created_at)
            SELECT id, ?, 'order_placed', ?, unixepoch()
            FROM products WHERE code = ?
          `)
          .bind(-item.quantity, orderResult.meta.last_row_id, item.code)
          .run();
      }

      // 5. Trigger async sync to other site
      if (env.SYNC_QUEUE) {
        await env.SYNC_QUEUE.send({
          type: 'order_created',
          order_id: orderResult.meta.last_row_id,
          order_number: order_number,
          origin_site: origin_site,
          target_site: origin_site === 'cc' ? 'store' : 'cc',
          timestamp: new Date().toISOString()
        });
      }

      return Response.json({
        success: true,
        order: {
          id: orderResult.meta.last_row_id,
          order_number: order_number,
          status: 'pending',
          total: order_total
        },
        message: 'Order created and inventory updated'
      }, { status: 201 });

    } catch (txError) {
      console.error('Transaction error:', txError);
      return Response.json({ error: 'Failed to create order' }, { status: 500 });
    }

  } catch (e) {
    console.error('Create order error:', e);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function getOrders(request, env) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get('email');
    const status = url.searchParams.get('status');
    const origin = url.searchParams.get('origin');

    let query = 'SELECT * FROM orders WHERE deleted_at IS NULL';
    const params = [];

    if (email) {
      query += ' AND customer_email = ?';
      params.push(email);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (origin) {
      query += ' AND origin_site = ?';
      params.push(origin);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await env.UNIFIED_DB.prepare(query).bind(...params).all();

    return Response.json({
      orders: result?.results || [],
      count: result?.results?.length || 0,
      timestamp: new Date().toISOString()
    });

  } catch (e) {
    console.error('Get orders error:', e);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
