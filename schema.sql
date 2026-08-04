CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  size TEXT,
  tagline TEXT,
  description TEXT,
  price REAL NOT NULL,
  image_url TEXT,
  category TEXT DEFAULT 'General',
  in_stock INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  items_json TEXT NOT NULL,
  shipping_json TEXT NOT NULL DEFAULT '{}',
  subtotal REAL NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  tracking_json TEXT DEFAULT '{}',
  notes TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch()),
  paid_at INTEGER,
  fulfilled_at INTEGER,
  shipped_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
