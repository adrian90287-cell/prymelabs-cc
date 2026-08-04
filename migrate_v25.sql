-- Run: npx wrangler d1 execute prymelabs-db --remote --file=migrate_v25.sql
-- v25: multiple product photos. Stored as a JSON array of image data-URIs (or
-- URLs). The first entry mirrors image_url for backward compatibility.
ALTER TABLE products ADD COLUMN photos_json TEXT DEFAULT '[]';
UPDATE products SET photos_json = '[]' WHERE photos_json IS NULL;
