import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const feeds = sqliteTable(
  "feeds",
  {
    id: text().primaryKey(),
    url: text().notNull(),
    title: text(),
    parserConfig: text("parser_config").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_feeds_url").on(table.url)]
);
