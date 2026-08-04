-- Run this against your D1 database:
-- npx wrangler d1 execute prymelabs-db --remote --file=migrate_v5.sql

ALTER TABLE users ADD COLUMN phone TEXT DEFAULT NULL;
