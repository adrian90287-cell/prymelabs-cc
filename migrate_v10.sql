-- Migration v10: Add fields for improved order workflow
-- Adds: ready_after timestamp, payment_reminders_sent counter, inventory_verified_at, tracking columns

-- Add new columns to orders table
ALTER TABLE orders ADD COLUMN ready_after INTEGER DEFAULT NULL;
ALTER TABLE orders ADD COLUMN payment_reminders_sent INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN inventory_verified_at INTEGER DEFAULT NULL;
ALTER TABLE orders ADD COLUMN is_will_call INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN is_local_delivery INTEGER DEFAULT 0;

-- Create notification log table (for tracking sent emails/SMS)
CREATE TABLE IF NOT EXISTS order_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  notification_type TEXT NOT NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  status TEXT DEFAULT 'sent',
  sent_at INTEGER DEFAULT (unixepoch()),
  error_message TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Create order events log (for audit trail)
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Create inventory ledger (track stock reservations)
CREATE TABLE IF NOT EXISTS inventory_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  adjustment_qty INTEGER NOT NULL,
  reason TEXT,
  order_id INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_orders_ready_after ON orders(ready_after);
CREATE INDEX IF NOT EXISTS idx_order_notifications_order ON order_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);
