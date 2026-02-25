import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const feeds = sqliteTable(
  "feeds",
  {
    id: text().primaryKey(),
    url: text().notNull(),
    title: text(),
    type: text().notNull().default("selector"),
    parserConfig: text("parser_config").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_feeds_url").on(table.url)]
);

export const snapshots = sqliteTable(
  "snapshots",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    feedId: text("feed_id").notNull(),
    contentHash: text("content_hash").notNull(),
    contentText: text("content_text").notNull(),
    capturedAt: text("captured_at").notNull(),
  },
  (table) => [index("idx_snapshots_feed_id").on(table.feedId)]
);

export const feedItems = sqliteTable(
  "feed_items",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    feedId: text("feed_id").notNull(),
    title: text().notNull(),
    link: text().notNull(),
    description: text(),
    contentHash: text("content_hash").notNull(),
    detectedAt: text("detected_at").notNull(),
  },
  (table) => [
    index("idx_feed_items_feed_id").on(table.feedId),
    index("idx_feed_items_detected_at").on(table.detectedAt),
  ]
);

export const feedFetches = sqliteTable(
  "feed_fetches",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    feedId: text("feed_id").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    index("idx_feed_fetches_feed_id").on(table.feedId),
    index("idx_feed_fetches_fetched_at").on(table.fetchedAt),
  ]
);
