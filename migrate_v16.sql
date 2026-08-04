-- v16: audit log of inbound payment-notification emails (auto-verify)
CREATE TABLE IF NOT EXISTS payment_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  provider     TEXT,
  order_number TEXT,
  amount       REAL,
  matched      INTEGER DEFAULT 0,
  note         TEXT,
  raw_from     TEXT,
  subject      TEXT,
  created_at   INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON payment_events(created_at DESC);
