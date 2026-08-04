-- v11: local delivery support + dashboard performance indexes

-- Flag orders placed for same-day local (Uber Direct) delivery
ALTER TABLE orders ADD COLUMN local_delivery INTEGER DEFAULT 0;

-- Speed up the admin dashboard (WHERE deleted_at IS NULL ORDER BY created_at DESC)
-- and the status-filtered batch tracking/refresh queries.
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_deleted ON orders(deleted_at);
