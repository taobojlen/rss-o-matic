import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";

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
