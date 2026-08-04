-- Migration v4: push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint          TEXT UNIQUE NOT NULL,
  subscription_json TEXT NOT NULL,
  created_at        INTEGER DEFAULT (unixepoch())
);
