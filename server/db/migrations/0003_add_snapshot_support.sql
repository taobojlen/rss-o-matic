-- Add type column to feeds
ALTER TABLE feeds ADD COLUMN type TEXT NOT NULL DEFAULT 'selector';

-- Store page snapshots for comparison
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id TEXT NOT NULL REFERENCES feeds(id),
  content_hash TEXT NOT NULL,
  content_text TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_snapshots_feed_id ON snapshots(feed_id);

-- Persist RSS items for snapshot feeds (selector feeds don't use this)
CREATE TABLE IF NOT EXISTS feed_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id TEXT NOT NULL REFERENCES feeds(id),
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  description TEXT,
  content_hash TEXT NOT NULL,
  detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feed_items_feed_id ON feed_items(feed_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_detected_at ON feed_items(detected_at);
