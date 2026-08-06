-- Migration: indexed tracking lookup columns on orders
-- EasyPost and Uber webhooks previously found the matching order by pulling
-- the last 25/200 orders and JSON-parsing tracking_json in JS to find a
-- match — a full scan on every webhook call, and one that could silently
-- miss a legitimate webhook once order volume exceeds that row window.
-- These denormalized, indexed columns are kept in sync with tracking_json
-- at every write site; the webhooks query them directly, with the old
-- scan kept as a fallback for any order these haven't been backfilled to.
ALTER TABLE orders ADD COLUMN tracking_number TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN uber_delivery_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_orders_uber_delivery_id ON orders(uber_delivery_id);

UPDATE orders SET tracking_number = json_extract(tracking_json, '$.number')
  WHERE tracking_json IS NOT NULL AND json_extract(tracking_json, '$.number') IS NOT NULL;
UPDATE orders SET uber_delivery_id = json_extract(tracking_json, '$.uber_delivery_id')
  WHERE tracking_json IS NOT NULL AND json_extract(tracking_json, '$.uber_delivery_id') IS NOT NULL;
