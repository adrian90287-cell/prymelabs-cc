-- Run this against your D1 database:
-- npx wrangler d1 execute prymelabs-db --remote --file=migrate_v7.sql

-- Live carrier tracking (normalized status pulled from USPS/UPS/FedEx APIs)
ALTER TABLE orders ADD COLUMN tracking_status TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN tracking_events_json TEXT DEFAULT '[]';
ALTER TABLE orders ADD COLUMN tracking_checked_at INTEGER;
ALTER TABLE orders ADD COLUMN delivered_at INTEGER;
