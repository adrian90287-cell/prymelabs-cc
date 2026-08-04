-- Pryme Labs — Migration v3
-- Run with:
--   npx wrangler d1 execute prymelabs-db --remote --file=migrate_v3.sql

-- ─── Rate limiting (login/register brute-force protection) ────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  attempts     INTEGER DEFAULT 0,
  window_start INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);

-- ─── No-tax flag on promo codes ───────────────────────────────────────────────
-- Already applied manually — skipped to avoid duplicate column error.

-- ─── Spanish product descriptions (for auto-translated storefront) ────────────
ALTER TABLE products ADD COLUMN description_es TEXT DEFAULT NULL;

-- ─── Customer suggestions / feedback ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suggestions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  customer_name TEXT    NOT NULL DEFAULT '',
  message       TEXT    NOT NULL,
  is_read       INTEGER DEFAULT 0,
  created_at    INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_suggestions_created ON suggestions(created_at DESC);
