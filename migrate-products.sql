-- Migrate existing products from prymelabs-db to prymelabs-unified
-- This is a one-time migration script

INSERT INTO products (
  code, name, size, tagline, description, description_es,
  price, compare_at_price, image_url, category,
  stock_qty, low_stock_threshold, batch_number, in_stock,
  source_site, created_at, updated_at
)
SELECT
  code, name, size, tagline, description, '',
  price, compare_at_price, image_url, COALESCE(category, 'General'),
  COALESCE(stock_qty, 0), 5, batch_number, in_stock,
  'cc', unixepoch(), unixepoch()
FROM prymelabs-db.products
WHERE NOT EXISTS (
  SELECT 1 FROM products WHERE products.code = prymelabs-db.products.code
);

-- If the above doesn't work due to cross-database limitations,
-- run this alternative after exporting from the old database:
-- (This will be provided as a separate import file)
