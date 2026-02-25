import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const newsletterFeeds = sqliteTable(
  "newsletter_feeds",
  {
    id: text().primaryKey(),
    title: text().notNull(),
    emailAddress: text("email_address").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_newsletter_feeds_email").on(table.emailAddress),
  ]
);

export const newsletterItems = sqliteTable(
  "newsletter_items",
  {
    id: text().primaryKey(),
    feedId: text("feed_id").notNull(),
    title: text().notNull(),
    authorName: text("author_name"),
    authorEmail: text("author_email"),
    contentHtml: text("content_html"),
    contentText: text("content_text"),
    receivedAt: text("received_at").notNull(),
    messageId: text("message_id"),
  },
  (table) => [
    index("idx_newsletter_items_feed_id").on(table.feedId),
    uniqueIndex("idx_newsletter_items_message_id").on(table.messageId),
    index("idx_newsletter_items_received_at").on(table.receivedAt),
  ]
);
