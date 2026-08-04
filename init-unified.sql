-- PRYMELABS UNIFIED DATABASE SCHEMA
-- Single source of truth for inventory and orders across both sites

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  size TEXT,
  tagline TEXT,
  description TEXT,
  description_es TEXT,
  price REAL NOT NULL,
  compare_at_price REAL DEFAULT NULL,
  image_url TEXT,
  photos_json TEXT DEFAULT '[]',
  category TEXT DEFAULT 'General',

  -- Inventory (atomic across both sites)
  stock_qty INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  batch_number TEXT DEFAULT NULL,
  in_stock INTEGER DEFAULT 1,

  -- Extended metadata
  research_area TEXT,
  handling_notes TEXT,
  documentation TEXT,
  cas_number TEXT,
  purity TEXT,
  storage TEXT,
  form TEXT,
  was_price REAL DEFAULT NULL,
  sale_badge TEXT,

  -- Source tracking
  source_site TEXT DEFAULT 'cc',
  synced_at INTEGER DEFAULT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  items_json TEXT NOT NULL,
  shipping_json TEXT NOT NULL,
  subtotal REAL NOT NULL,
  payment_method TEXT NOT NULL,
  promo_code TEXT DEFAULT NULL,
  discount_amount REAL DEFAULT 0,
  shipping_cost REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  order_total REAL NOT NULL,

  -- Status
  status TEXT DEFAULT 'pending',
  payment_verified_at INTEGER,
  shipped_at INTEGER,
  fulfilled_at INTEGER,

  -- Origin tracking (which site received it)
  origin_site TEXT DEFAULT 'cc',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  deleted_at INTEGER DEFAULT NULL
);

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

CREATE TABLE IF NOT EXISTS sync_status (
  id TEXT PRIMARY KEY,
  entity_type TEXT,
  entity_id INTEGER,
  target_site TEXT,
  last_synced_at INTEGER,
  sync_status TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source_site);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_origin ON orders(origin_site);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_product ON inventory_ledger(product_id);
CREATE INDEX IF NOT EXISTS idx_sync_status_entity ON sync_status(entity_type, entity_id);
