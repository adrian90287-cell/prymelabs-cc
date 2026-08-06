-- Enforce one customer account per normalized phone number.
-- If this unique index fails to apply, historical duplicate phones must be
-- reviewed/merged first; the app already blocks new duplicates.

ALTER TABLE users ADD COLUMN phone_norm TEXT;
ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0;

UPDATE users
   SET phone_norm = CASE
     WHEN phone IS NULL OR trim(phone) = '' THEN NULL
     WHEN length(replace(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')) = 11
       AND substr(replace(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), 1, 1) = '1'
       THEN substr(replace(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), 2)
     ELSE replace(replace(replace(replace(replace(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
   END
 WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_norm_unique
  ON users(phone_norm)
  WHERE phone_norm IS NOT NULL AND phone_norm != '';
