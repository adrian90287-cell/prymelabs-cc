Production D1 migration status
==============================

The old SQL files in this folder were removed after production was verified on
August 7, 2026.

Why:

- Cloudflare showed the old files as pending.
- Production already had the intended schema changes from those files.
- Several old files used plain `ALTER TABLE ... ADD COLUMN ...`, which would
  fail if someone later ran `wrangler d1 migrations apply`.

Verified live on `prymelabs-db`:

- `users.token_version`
- `users.phone_norm`
- `users.phone_verified`
- unique partial index `idx_users_phone_norm_unique`
- `admin_users.token_version`
- admin user / audit / reset tables are also created defensively by runtime
  startup code.
- order tracking lookup columns and indexes
- product `batch_number`

For future database changes:

1. Add a new migration file only for new schema changes.
2. Prefer defensive/idempotent runtime guards for optional compatibility work.
3. Check production schema before applying migrations.
4. Do not restore and apply the removed legacy migrations unless the production
   database has first been reviewed manually.
