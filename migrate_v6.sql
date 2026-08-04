-- Run this against your D1 database:
-- npx wrangler d1 execute prymelabs-db --remote --file=migrate_v6.sql

ALTER TABLE users ADD COLUMN sms_unsubscribed INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN lang TEXT DEFAULT 'en';
