-- Run: npx wrangler d1 execute prymelabs-db --remote --file=migrate_v23.sql
-- v23: product Collections — multi-value sub-category memberships within a
-- department (e.g. a facial soap can be in both "Face Care" and "Soaps").
-- Stored as a JSON array of collection names. Empty by default; assign from the
-- admin Products tab. "Shop All" and "New Arrivals" are computed, not stored.
ALTER TABLE products ADD COLUMN collections TEXT DEFAULT '[]';
UPDATE products SET collections = '[]' WHERE collections IS NULL;
