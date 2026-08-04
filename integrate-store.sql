-- Add tables to prymelabs-unified for email/SMS/notifications
-- These will be shared between prymelabs.cc and prymelabs.store

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  lang TEXT DEFAULT 'en',
  email_unsubscribed INTEGER DEFAULT 0,
  sms_unsubscribed INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(email)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT UNIQUE NOT NULL,
  subscription_json TEXT NOT NULL,
  user_id INTEGER,
  origin_site TEXT DEFAULT 'cc',
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  carrier TEXT,
  tracking_number TEXT,
  tracking_status TEXT,
  tracking_events_json TEXT DEFAULT '[]',
  est_delivery TEXT,
  tracking_checked_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  UNIQUE(order_id, tracking_number)
);

-- Add tracking fields to orders table if they don't exist
-- ALTER TABLE orders ADD COLUMN tracking_json TEXT DEFAULT '{}';
-- ALTER TABLE orders ADD COLUMN tracking_status TEXT;
-- ALTER TABLE orders ADD COLUMN shipped_at INTEGER;
-- ALTER TABLE orders ADD COLUMN delivered_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_unsubscribed ON users(email_unsubscribed);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_tracking_order ON tracking(order_id);
CREATE INDEX IF NOT EXISTS idx_tracking_status ON tracking(tracking_status);
