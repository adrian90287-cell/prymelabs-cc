-- Migration: Add token_version to users, for session invalidation on password reset.
-- A customer JWT embeds the token_version it was issued at (tv); on every
-- verification we compare it against the user's current value. Bumping this
-- column instantly invalidates every previously-issued token for that user —
-- used when a password is reset, since JWTs are otherwise stateless and would
-- keep working (up to their 30-day expiry) even after the password changes.
-- Tokens issued before this migration have no `tv` claim and are treated as
-- version 0, matching the column default, so existing sessions are unaffected
-- until the next password reset for that account.
ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0;
