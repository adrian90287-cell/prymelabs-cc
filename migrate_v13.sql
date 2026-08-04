-- v13: back-in-stock waitlist + post-delivery review-request tracking

CREATE TABLE IF NOT EXISTS stock_notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL,
  email       TEXT NOT NULL,
  created_at  INTEGER DEFAULT (unixepoch()),
  notified_at INTEGER DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_notif_product ON stock_notifications(product_id, notified_at);

-- Dedupe one-time review/thank-you email after delivery
ALTER TABLE orders ADD COLUMN review_request_sent_at INTEGER DEFAULT NULL;
