CREATE TABLE IF NOT EXISTS reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL,
  order_id      INTEGER,
  user_id       INTEGER,
  customer_name TEXT,
  rating        INTEGER NOT NULL,
  comment       TEXT,
  status        TEXT DEFAULT 'pending',
  created_at    INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
