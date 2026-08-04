-- Run this against your D1 database:
-- npx wrangler d1 execute prymelabs-db --remote --file=migrate_v8.sql
--
-- Catch-up migration: these columns are referenced throughout functions/**
-- but were only ever added to the production database ad hoc — no migration
-- file in the repo created them, so a fresh database built from schema.sql +
-- migrate_v2..v7 fails (e.g. "D1_ERROR: no such column: deleted_at").
--
-- ⚠ Production already has all of these. Running this remotely will error
-- with "duplicate column name" on the first statement — that is expected;
-- this file exists so FRESH (local/dev) databases match the code.

-- Soft-delete (trash) for orders — delete-order.js, trash-orders.js,
-- dashboard.js, my-orders/*
ALTER TABLE orders ADD COLUMN deleted_at INTEGER DEFAULT NULL;

-- Email marketing opt-out — my/preferences.js, unsubscribe.js, announce.js,
-- subscribers.js
ALTER TABLE users ADD COLUMN email_unsubscribed INTEGER DEFAULT 0;

-- Inventory tracking + admin product form fields — admin/products.js,
-- orders/index.js, admin/update-order.js, admin/delete-order.js
-- (stock_qty = 0 with in_stock = 1 means "untracked/unlimited")
ALTER TABLE products ADD COLUMN stock_qty INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER DEFAULT 5;
ALTER TABLE products ADD COLUMN compare_at_price REAL DEFAULT NULL;
ALTER TABLE products ADD COLUMN batch_number TEXT DEFAULT NULL;

-- No-tax flag on promo codes — admin/promos.js, promo/validate.js
-- (migrate_v3 noted it was "already applied manually" and skipped it)
ALTER TABLE promo_codes ADD COLUMN no_tax INTEGER DEFAULT 0;

-- Per-user push subscriptions — subscribers.js deletes by user_id
ALTER TABLE push_subscriptions ADD COLUMN user_id INTEGER DEFAULT NULL;
