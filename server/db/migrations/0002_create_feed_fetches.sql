CREATE TABLE IF NOT EXISTS feed_fetches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id TEXT NOT NULL REFERENCES feeds(id),
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feed_fetches_feed_id ON feed_fetches(feed_id);
CREATE INDEX IF NOT EXISTS idx_feed_fetches_fetched_at ON feed_fetches(fetched_at);
