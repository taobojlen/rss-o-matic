import { and, count, desc, eq, gte, notInArray } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";
import type { FeedRecord } from "./schema";

export async function saveFeed(
  id: string,
  url: string,
  title: string | null,
  parserConfig: string,
  type: "selector" | "snapshot" = "selector"
): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(schema.feeds).values({
    id,
    url,
    title,
    type,
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
    type: (row.type as "selector" | "snapshot") ?? "selector",
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
    type: (row.type as "selector" | "snapshot") ?? "selector",
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
      type: schema.feeds.type,
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
    type: (row.type as "selector" | "snapshot") ?? "selector",
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
    type: (row.type as "selector" | "snapshot") ?? "selector",
    parser_config: row.parserConfig,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

// --- Snapshots ---

export async function getLatestSnapshot(feedId: string) {
  const rows = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.feedId, feedId))
    .orderBy(desc(schema.snapshots.capturedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveSnapshot(
  feedId: string,
  contentText: string,
  contentHash: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(schema.snapshots).values({
    feedId,
    contentText,
    contentHash,
    capturedAt: now,
  });
}

export async function pruneSnapshots(
  feedId: string,
  keep: number = 3
): Promise<void> {
  const toKeep = await db
    .select({ id: schema.snapshots.id })
    .from(schema.snapshots)
    .where(eq(schema.snapshots.feedId, feedId))
    .orderBy(desc(schema.snapshots.capturedAt))
    .limit(keep);

  if (toKeep.length < keep) return;

  const keepIds = toKeep.map((r) => r.id);
  await db
    .delete(schema.snapshots)
    .where(
      and(
        eq(schema.snapshots.feedId, feedId),
        notInArray(schema.snapshots.id, keepIds)
      )
    );
}

// --- Feed Items (for snapshot feeds) ---

export async function getFeedItems(feedId: string, limit: number = 50) {
  return db
    .select()
    .from(schema.feedItems)
    .where(eq(schema.feedItems.feedId, feedId))
    .orderBy(desc(schema.feedItems.detectedAt))
    .limit(limit);
}

export async function saveFeedItem(
  feedId: string,
  title: string,
  link: string,
  description: string | null,
  contentHash: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(schema.feedItems).values({
    feedId,
    title,
    link,
    description,
    contentHash,
    detectedAt: now,
  });
}

export async function pruneFeedItems(
  feedId: string,
  keep: number = 50
): Promise<void> {
  const toKeep = await db
    .select({ id: schema.feedItems.id })
    .from(schema.feedItems)
    .where(eq(schema.feedItems.feedId, feedId))
    .orderBy(desc(schema.feedItems.detectedAt))
    .limit(keep);

  if (toKeep.length < keep) return;

  const keepIds = toKeep.map((r) => r.id);
  await db
    .delete(schema.feedItems)
    .where(
      and(
        eq(schema.feedItems.feedId, feedId),
        notInArray(schema.feedItems.id, keepIds)
      )
    );
}
