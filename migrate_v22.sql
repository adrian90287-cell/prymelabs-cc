-- Run: npx wrangler d1 execute prymelabs-db --remote --file=migrate_v22.sql
-- v22: product Department — the top-level storefront grouping used by the home
-- page tabs (Skin Care / Supplements / Peptides). Everything defaults to
-- 'Peptides'; re-tag Skin Care & Supplement items from the admin Inventory tab.
ALTER TABLE products ADD COLUMN department TEXT DEFAULT 'Peptides';

-- Backfill any existing NULLs (older rows) to the default.
UPDATE products SET department = 'Peptides' WHERE department IS NULL;
