-- v12: track when a one-time payment reminder was sent to a pending order,
-- so the scheduled job never reminds the same customer twice.
ALTER TABLE orders ADD COLUMN reminder_sent_at INTEGER DEFAULT NULL;
