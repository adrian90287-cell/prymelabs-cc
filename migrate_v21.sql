-- Run: npx wrangler d1 execute prymelabs-db --remote --file=migrate_v21.sql
-- v21: free-shipping promo codes.
-- A code with free_shipping = 1 waives the carrier shipping cost at checkout.
-- Combine with one_use_per_user = 1 for "free shipping, once per customer".
ALTER TABLE promo_codes ADD COLUMN free_shipping INTEGER DEFAULT 0;
