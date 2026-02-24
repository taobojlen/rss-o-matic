import { count, desc, eq, gte } from "drizzle-orm";
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

export async function logFeedFetch(feedId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(schema.feedFetches).values({
    feedId,
    fetchedAt: now,
  });
}

export async function getPopularFeeds(
  limit: number = 5
): Promise<Array<FeedRecord & { fetch_count: number }>> {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const rows = await db
    .select({
      id: schema.feeds.id,
      url: schema.feeds.url,
      title: schema.feeds.title,
      parserConfig: schema.feeds.parserConfig,
      createdAt: schema.feeds.createdAt,
      updatedAt: schema.feeds.updatedAt,
      fetchCount: count(schema.feedFetches.id),
    })
    .from(schema.feedFetches)
    .innerJoin(schema.feeds, eq(schema.feedFetches.feedId, schema.feeds.id))
    .where(gte(schema.feedFetches.fetchedAt, sevenDaysAgo))
    .groupBy(schema.feedFetches.feedId)
    .orderBy(desc(count(schema.feedFetches.id)))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    parser_config: row.parserConfig,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    fetch_count: row.fetchCount,
  }));
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
