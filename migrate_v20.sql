-- Run: npx wrangler d1 execute prymelabs-db --remote --file=migrate_v20.sql
-- Case / bundle products: a "case" is priced as a fixed wholesale product, is
-- exempt from all discounts (global sale, master adjust, promo codes), and draws
-- its inventory from a parent single-vial product (bundle_qty vials per case).

ALTER TABLE products ADD COLUMN bundle_of_product_id INTEGER DEFAULT NULL;
ALTER TABLE products ADD COLUMN bundle_qty INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN no_discount INTEGER DEFAULT 0;

-- 3ml Case of 10 → draws 10 vials from BA03 (id 53). Fixed $70, no discounts.
INSERT INTO products
  (code, name, size, tagline, description, description_es, price, image_url, category,
   in_stock, display_order, stock_qty, low_stock_threshold, weight_oz,
   bundle_of_product_id, bundle_qty, no_discount)
SELECT
  'BA03C', name, '3ml - Case of 10', tagline, description, description_es, 70, image_url, category,
  1, 53, 0, 0, weight_oz,
  53, 10, 1
FROM products WHERE id = 53;

-- 10ml Case of 10 → draws 10 vials from BA10 (id 54). Fixed $110, no discounts.
INSERT INTO products
  (code, name, size, tagline, description, description_es, price, image_url, category,
   in_stock, display_order, stock_qty, low_stock_threshold, weight_oz,
   bundle_of_product_id, bundle_qty, no_discount)
SELECT
  'BA10C', name, '10ml - Case of 10', tagline, description, description_es, 110, image_url, category,
  1, 54, 0, 0, weight_oz,
  54, 10, 1
FROM products WHERE id = 54;
