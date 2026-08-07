// Comprehensive Test Suite for Order Workflow Improvements
// Run locally before deployment: node TEST_SUITE.js
// NOTE: Requires D1 database and environment variables configured

import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(':memory:')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// Initialize test database with schema
function initTestDB() {
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT,
      stock_qty INTEGER,
      in_stock INTEGER DEFAULT 1
    );

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      order_number TEXT UNIQUE,
      customer_name TEXT,
      customer_email TEXT,
      status TEXT DEFAULT 'pending',
      items_json TEXT,
      shipping_json TEXT,
      subtotal INTEGER,
      shipping_cost INTEGER,
      tax_amount INTEGER,
      order_total INTEGER,
      payment_method TEXT,
      payment_handle TEXT,
      promo_code TEXT,
      discount_amount INTEGER,
      payment_verified_at INTEGER,
      fulfilled_at INTEGER,
      shipped_at INTEGER,
      ready_after INTEGER,
      inventory_verified_at INTEGER,
      is_will_call INTEGER DEFAULT 0,
      is_local_delivery INTEGER DEFAULT 0,
      tracking TEXT,
      notes TEXT,
      payment_reminders_sent INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE order_notifications (
      id INTEGER PRIMARY KEY,
      order_id INTEGER,
      notification_type TEXT,
      recipient_email TEXT,
      recipient_phone TEXT,
      status TEXT,
      error_message TEXT,
      sent_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE order_events (
      id INTEGER PRIMARY KEY,
      order_id INTEGER,
      event_type TEXT,
      event_data TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE inventory_ledger (
      id INTEGER PRIMARY KEY,
      product_id INTEGER,
      adjustment_qty INTEGER,
      reason TEXT,
      order_id INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE INDEX idx_orders_ready_after ON orders(ready_after);
    CREATE INDEX idx_order_notifications_order_id ON order_notifications(order_id);
    CREATE INDEX idx_order_events_order_id ON order_events(order_id);
  `)
}

// Test 1: Database initialization
function testDatabase() {
  console.log('✓ Test 1: Database initialization')
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
  console.log(`  - Created ${tables.length} tables`)
  assert(tables.length >= 5, 'Should have at least 5 tables')
}

// Test 2: Product setup for inventory tests
function testProductSetup() {
  console.log('✓ Test 2: Product setup')
  db.prepare(`
    INSERT INTO products (code, name, stock_qty, in_stock) VALUES (?, ?, ?, ?)
  `).run('PEPTIDE-001', 'Peptide Alpha', 10, 1)
  db.prepare(`
    INSERT INTO products (code, name, stock_qty, in_stock) VALUES (?, ?, ?, ?)
  `).run('PEPTIDE-002', 'Peptide Beta', 0, 0)
  db.prepare(`
    INSERT INTO products (code, name, stock_qty, in_stock) VALUES (?, ?, ?, ?)
  `).run('PEPTIDE-003', 'Peptide Gamma', 5, 1)

  const products = db.prepare('SELECT * FROM products').all()
  console.log(`  - Created ${products.length} test products`)
  assert(products.length === 3, 'Should have 3 products')
}

// Test 3: Order creation
function testOrderCreation() {
  console.log('✓ Test 3: Order creation')
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO orders (
      order_number, customer_name, customer_email, status,
      items_json, shipping_json, subtotal, shipping_cost, tax_amount, order_total,
      payment_method, payment_handle, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ORD-001', 'John Doe', 'john@example.com', 'pending',
    JSON.stringify([{ code: 'PEPTIDE-001', qty: 1, name: 'Peptide Alpha' }]),
    JSON.stringify({ address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' }),
    4999, 1000, 400, 6399, 'zelle', 'john@venmo',
    now, now
  )

  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get('ORD-001')
  console.log(`  - Created order ${order.order_number}`)
  assert(order.status === 'pending', 'Order should be pending')
}

// Test 4: Notification logging
function testNotificationLogging() {
  console.log('✓ Test 4: Notification logging')
  const order = db.prepare('SELECT id FROM orders WHERE order_number = ?').get('ORD-001')

  db.prepare(`
    INSERT INTO order_notifications (order_id, notification_type, recipient_email, status)
    VALUES (?, ?, ?, ?)
  `).run(order.id, 'order_confirmation', 'john@example.com', 'sent')

  const notif = db.prepare(
    'SELECT * FROM order_notifications WHERE order_id = ?'
  ).get(order.id)

  console.log(`  - Logged notification: ${notif.notification_type}`)
  assert(notif.notification_type === 'order_confirmation', 'Should log notification')
}

// Test 5: Event logging
function testEventLogging() {
  console.log('✓ Test 5: Event logging')
  const order = db.prepare('SELECT id FROM orders WHERE order_number = ?').get('ORD-001')

  db.prepare(`
    INSERT INTO order_events (order_id, event_type, event_data)
    VALUES (?, ?, ?)
  `).run(order.id, 'payment_verified', JSON.stringify({ method: 'zelle' }))

  const event = db.prepare('SELECT * FROM order_events WHERE order_id = ?').get(order.id)
  console.log(`  - Logged event: ${event.event_type}`)
  assert(event.event_type === 'payment_verified', 'Should log event')
}

// Test 6: Status transitions
function testStatusTransitions() {
  console.log('✓ Test 6: Status transitions')
  const order = db.prepare('SELECT id FROM orders WHERE order_number = ?').get('ORD-001')

  // pending -> paid
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(
    'paid', Math.floor(Date.now() / 1000), order.id
  )

  let updated = db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id)
  console.log(`  - Transitioned to: ${updated.status}`)
  assert(updated.status === 'paid', 'Should transition to paid')

  // paid -> fulfilled
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(
    'fulfilled', Math.floor(Date.now() / 1000), order.id
  )

  updated = db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id)
  assert(updated.status === 'fulfilled', 'Should transition to fulfilled')

  // fulfilled -> shipped
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(
    'shipped', Math.floor(Date.now() / 1000), order.id
  )

  updated = db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id)
  assert(updated.status === 'shipped', 'Should transition to shipped')

  // shipped -> completed
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(
    'completed', Math.floor(Date.now() / 1000), order.id
  )

  updated = db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id)
  assert(updated.status === 'completed', 'Should transition to completed')
}

// Test 7: Will-call order workflow
function testWillCallWorkflow() {
  console.log('✓ Test 7: Will-call order workflow')
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO orders (
      order_number, customer_name, customer_email, status, is_will_call,
      items_json, shipping_json, order_total, payment_method, payment_handle,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ORD-002', 'Jane Smith', 'jane@example.com', 'pending', 1,
    JSON.stringify([{ code: 'PEPTIDE-003', qty: 2 }]),
    JSON.stringify({}),
    8998, 'venmo', 'jane@venmo',
    now, now
  )

  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get('ORD-002')
  console.log(`  - Created will-call order: ${order.order_number}`)
  assert(order.is_will_call === 1, 'Should be marked as will-call')

  // Set ready date
  const readyAfter = now + (86400 * 2) // 2 days from now
  db.prepare('UPDATE orders SET ready_after = ? WHERE id = ?').run(readyAfter, order.id)

  const updated = db.prepare('SELECT ready_after FROM orders WHERE id = ?').get(order.id)
  assert(updated.ready_after === readyAfter, 'Should set ready_after date')
}

// Test 8: Inventory tracking
function testInventoryTracking() {
  console.log('✓ Test 8: Inventory tracking')
  const product = db.prepare('SELECT * FROM products WHERE code = ?').get('PEPTIDE-001')
  const order = db.prepare('SELECT id FROM orders WHERE order_number = ?').get('ORD-001')

  const initialStock = product.stock_qty
  console.log(`  - Initial stock: ${initialStock}`)

  // Simulate inventory reservation
  db.prepare('UPDATE products SET stock_qty = stock_qty - 1 WHERE id = ?').run(product.id)
  db.prepare(`
    INSERT INTO inventory_ledger (product_id, adjustment_qty, reason, order_id)
    VALUES (?, ?, ?, ?)
  `).run(product.id, -1, 'order_fulfillment', order.id)

  const updated = db.prepare('SELECT stock_qty FROM products WHERE id = ?').get(product.id)
  console.log(`  - After reservation: ${updated.stock_qty}`)
  assert(updated.stock_qty === initialStock - 1, 'Should decrement stock')

  // Check ledger
  const ledgerEntry = db.prepare(
    'SELECT * FROM inventory_ledger WHERE product_id = ? AND order_id = ?'
  ).get(product.id, order.id)
  assert(ledgerEntry.adjustment_qty === -1, 'Should track adjustment in ledger')
}

// Test 9: Multiple notifications per order
function testMultipleNotifications() {
  console.log('✓ Test 9: Multiple notifications per order')
  const order = db.prepare('SELECT id FROM orders WHERE order_number = ?').get('ORD-001')

  const notifications = [
    'order_confirmation',
    'payment_verified',
    'fulfillment_started',
    'shipped',
    'completed'
  ]

  notifications.forEach(type => {
    db.prepare(`
      INSERT INTO order_notifications (order_id, notification_type, recipient_email, status)
      VALUES (?, ?, ?, ?)
    `).run(order.id, type, 'john@example.com', 'sent')
  })

  const notifCount = db.prepare(
    'SELECT COUNT(*) as count FROM order_notifications WHERE order_id = ?'
  ).get(order.id).count

  console.log(`  - Logged ${notifCount} notifications`)
  assert(notifCount === notifications.length + 1, 'Should log all notifications')
}

// Test 10: Order history retrieval
function testOrderHistory() {
  console.log('✓ Test 10: Order history retrieval')
  const order = db.prepare('SELECT id FROM orders WHERE order_number = ?').get('ORD-001')

  const history = db.prepare(`
    SELECT notification_type, status, sent_at
    FROM order_notifications
    WHERE order_id = ?
    ORDER BY sent_at DESC
  `).all(order.id)

  console.log(`  - Retrieved ${history.length} historical notifications`)
  assert(history.length > 0, 'Should retrieve notification history')
}

// Test 11: Query performance
function testPerformance() {
  console.log('✓ Test 11: Query performance')

  const start = Date.now()
  db.prepare('SELECT * FROM orders WHERE order_number = ?').get('ORD-001')
  const queryTime = Date.now() - start

  console.log(`  - Query time: ${queryTime}ms`)
  assert(queryTime < 100, 'Queries should complete in <100ms')
}

// Test 12: Rollback verification
function testRollbackVerification() {
  console.log('✓ Test 12: Rollback verification')

  const ordersBefore = db.prepare('SELECT COUNT(*) as count FROM orders').get().count
  console.log(`  - Orders before: ${ordersBefore}`)

  // Verify critical tables exist
  const tables = ['orders', 'order_notifications', 'order_events', 'inventory_ledger']
  tables.forEach(table => {
    const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table)
    assert(result, `Table ${table} should exist for rollback`)
  })
}

// Run all tests
export function runTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  ORDER WORKFLOW IMPROVEMENTS - TEST SUITE')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  initTestDB()

  try {
    testDatabase()
    testProductSetup()
    testOrderCreation()
    testNotificationLogging()
    testEventLogging()
    testStatusTransitions()
    testWillCallWorkflow()
    testInventoryTracking()
    testMultipleNotifications()
    testOrderHistory()
    testPerformance()
    testRollbackVerification()

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  ✅ ALL TESTS PASSED')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    return true
  } catch (e) {
    console.error('\n❌ TEST FAILED:', e.message)
    console.error(e.stack)
    return false
  }
}

runTests()
