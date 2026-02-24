import { desc, eq } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";
import type { FeedRecord } from "./schema";

export async function saveFeed(
  id: string,
  url: string,
  title: string | null,
  parserConfig: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(schema.feeds).values({
    id,
    url,
    title,
    parserConfig,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getFeedByUrl(url: string): Promise<FeedRecord | null> {
  const rows = await db
    .select()
    .from(schema.feeds)
    .where(eq(schema.feeds.url, url))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    parser_config: row.parserConfig,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function getRecentFeeds(limit: number = 5): Promise<FeedRecord[]> {
  const rows = await db
    .select()
    .from(schema.feeds)
    .orderBy(desc(schema.feeds.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    parser_config: row.parserConfig,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }));
}

export async function updateFeedConfig(
  id: string,
  parserConfig: string,
  title: string | null
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(schema.feeds)
    .set({
      parserConfig,
      title,
      updatedAt: now,
    })
    .where(eq(schema.feeds.id, id));
}

export async function getFeed(id: string): Promise<FeedRecord | null> {
  const rows = await db
    .select()
    .from(schema.feeds)
    .where(eq(schema.feeds.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    parser_config: row.parserConfig,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
