-- Run this against your D1 database:
-- npx wrangler d1 execute prymelabs-db --remote --file=migrate_v9.sql

-- Certificates of Analysis (COA) — admin-uploaded photos/PDFs, auto-linked to
-- products by matching title, shown on the product detail modal in the shop.
CREATE TABLE IF NOT EXISTS coa_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  file_key TEXT NOT NULL,
  file_type TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
);

-- Global on/off switch for the whole COA feature (read via settings table)
INSERT OR IGNORE INTO settings (key, value) VALUES ('coa_enabled', '0');
