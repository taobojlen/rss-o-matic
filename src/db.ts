import { Database } from "bun:sqlite";
import type { FeedRecord } from "./schema";

const db = new Database("rss-o-matic.sqlite", { create: true });

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

db.run(`
  CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT,
    parser_config TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
db.run(`CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url)`);

const insertFeed = db.prepare(
  `INSERT INTO feeds (id, url, title, parser_config) VALUES (?, ?, ?, ?)`
);

const getFeedById = db.prepare(`SELECT * FROM feeds WHERE id = ?`);

export function saveFeed(
  id: string,
  url: string,
  title: string | null,
  parserConfig: string
): void {
  insertFeed.run(id, url, title, parserConfig);
}

export function getFeed(id: string): FeedRecord | null {
  return (getFeedById.get(id) as FeedRecord) ?? null;
}
