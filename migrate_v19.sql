-- Run: npx wrangler d1 execute prymelabs-db --remote --file=migrate_v19.sql
-- v19: reship support + internal (admin-only) notes
--
-- tracking_history_json: archive of previous labels/tracking. When an order is
-- reshipped, the current tracking_json is pushed here before the new label
-- overwrites it, so we never lose the record of the first (mis-delivered) label.
ALTER TABLE orders ADD COLUMN tracking_history_json TEXT DEFAULT '[]';
--
-- internal_notes: admin-only notes that are NEVER printed on the packing slip.
-- (The existing `notes` column stays customer-facing — it prints on the slip.)
ALTER TABLE orders ADD COLUMN internal_notes TEXT DEFAULT NULL;
