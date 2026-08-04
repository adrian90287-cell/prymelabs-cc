-- v14: per-product shipping weight (ounces) to auto-fill label parcel weight
ALTER TABLE products ADD COLUMN weight_oz REAL DEFAULT 0;
