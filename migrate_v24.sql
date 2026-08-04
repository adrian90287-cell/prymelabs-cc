-- Run: npx wrangler d1 execute prymelabs-db --remote --file=migrate_v24.sql
-- v24: rename departments — "Skin Care" → "Beauty & Grooming",
-- "Supplements" → "Health & Wellness". (Peptides unchanged.) Idempotent.
UPDATE products SET department = 'Beauty & Grooming' WHERE department = 'Skin Care';
UPDATE products SET department = 'Health & Wellness' WHERE department = 'Supplements';
