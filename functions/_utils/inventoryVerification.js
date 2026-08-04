// Inventory verification utility - verify stock before fulfillment
export async function verifyInventoryForOrder(env, order) {
  try {
    if (!order.items_json) return { verified: false, errors: ['No items in order'] }

    const items = JSON.parse(order.items_json)
    const errors = []
    const missingItems = []

    for (const item of items) {
      // Find product by code or name
      const product = await env.DB.prepare(
        'SELECT id, code, name, stock_qty, in_stock FROM products WHERE code = ? OR name = ?'
      ).bind(item.code, item.name).first()

      if (!product) {
        errors.push(`Product not found: ${item.name || item.code}`)
        continue
      }

      if (!product.in_stock) {
        missingItems.push(`${product.name} is out of stock`)
        continue
      }

      if (product.stock_qty < item.qty) {
        missingItems.push(`${product.name}: Only ${product.stock_qty} available, ${item.qty} requested`)
        continue
      }
    }

    if (missingItems.length > 0) {
      errors.push(...missingItems)
    }

    const verified = errors.length === 0

    return {
      verified,
      errors,
      items_checked: items.length,
      issues_found: errors.length
    }
  } catch (e) {
    console.error('Inventory verification error:', e)
    return {
      verified: false,
      errors: [`Inventory check failed: ${e.message}`]
    }
  }
}

export async function reserveInventoryForOrder(env, orderId) {
  try {
    const order = await env.DB.prepare('SELECT items_json FROM orders WHERE id = ?').bind(orderId).first()
    if (!order) return { success: false, error: 'Order not found' }

    const items = JSON.parse(order.items_json)

    for (const item of items) {
      const product = await env.DB.prepare(
        'SELECT id FROM products WHERE code = ? OR name = ?'
      ).bind(item.code, item.name).first()

      if (product) {
        // Decrement stock
        await env.DB.prepare(
          'UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?'
        ).bind(item.qty, product.id).run()

        // Log to inventory ledger
        await env.DB.prepare(
          'INSERT INTO inventory_ledger (product_id, adjustment_qty, reason, order_id) VALUES (?, ?, ?, ?)'
        ).bind(product.id, -item.qty, 'order_fulfillment', orderId).run()
      }
    }

    return { success: true }
  } catch (e) {
    console.error('Failed to reserve inventory:', e)
    return { success: false, error: e.message }
  }
}

export async function releaseInventoryForOrder(env, orderId) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT product_id, adjustment_qty FROM inventory_ledger WHERE order_id = ? AND adjustment_qty < 0'
    ).bind(orderId).all()

    if (!results) return { success: true }

    for (const row of results) {
      // Reverse the adjustment
      await env.DB.prepare(
        'UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?'
      ).bind(-row.adjustment_qty, row.product_id).run()
    }

    return { success: true }
  } catch (e) {
    console.error('Failed to release inventory:', e)
    return { success: false, error: e.message }
  }
}
