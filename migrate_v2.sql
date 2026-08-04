-- Run this against your D1 database:
-- npx wrangler d1 execute prymelabs-db --remote --file=migrate_v2.sql

CREATE TABLE IF NOT EXISTS promo_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'promo',
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value REAL NOT NULL DEFAULT 0,
  min_order_amount REAL DEFAULT 0,
  max_uses INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  expires_at INTEGER DEFAULT NULL,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS shipping_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  min_days INTEGER DEFAULT NULL,
  max_days INTEGER DEFAULT NULL,
  is_active INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 999
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('free_shipping_threshold', '0'),
  ('tax_rate', '0'),
  ('tax_label', 'Tax');

ALTER TABLE orders ADD COLUMN promo_code TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN shipping_rate_name TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN shipping_cost REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN tax_rate REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN tax_amount REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN order_total REAL DEFAULT 0;
