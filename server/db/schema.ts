import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const feeds = sqliteTable(
  "feeds",
  {
    id: text().primaryKey(),
    url: text().notNull(),
    title: text(),
    parserConfig: text("parser_config").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_feeds_url").on(table.url)]
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
