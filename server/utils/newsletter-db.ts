import { desc, eq, count, asc, sql } from "drizzle-orm";
import { db, schema } from "@nuxthub/db";

const MAX_ITEMS_PER_FEED = 100;

export interface NewsletterFeedRecord {
  id: string;
  title: string;
  email_address: string;
  created_at: string;
  updated_at: string;
}

export interface NewsletterItemRecord {
  id: string;
  feed_id: string;
  title: string;
  author_name: string | null;
  author_email: string | null;
  content_html: string | null;
  content_text: string | null;
  received_at: string;
  message_id: string | null;
}

export async function createNewsletterFeed(
  id: string,
  title: string,
  emailAddress: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(schema.newsletterFeeds).values({
    id,
    title,
    emailAddress,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getNewsletterFeed(
  id: string
): Promise<NewsletterFeedRecord | null> {
  const rows = await db
    .select()
    .from(schema.newsletterFeeds)
    .where(eq(schema.newsletterFeeds.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0]!;
  return {
    id: row.id,
    title: row.title,
    email_address: row.emailAddress,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function getNewsletterFeedByEmail(
  emailAddress: string
): Promise<NewsletterFeedRecord | null> {
  const rows = await db
    .select()
    .from(schema.newsletterFeeds)
    .where(sql`lower(${schema.newsletterFeeds.emailAddress}) = ${emailAddress.toLowerCase()}`)
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0]!;
  return {
    id: row.id,
    title: row.title,
    email_address: row.emailAddress,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function getNewsletterItemCount(feedId: string): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(schema.newsletterItems)
    .where(eq(schema.newsletterItems.feedId, feedId));
  return rows[0]?.count ?? 0;
}

export async function addNewsletterItem(
  id: string,
  feedId: string,
  title: string,
  authorName: string | null,
  authorEmail: string | null,
  contentHtml: string | null,
  contentText: string | null,
  messageId: string | null
): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(schema.newsletterItems).values({
    id,
    feedId,
    title,
    authorName,
    authorEmail,
    contentHtml,
    contentText,
    receivedAt: now,
    messageId,
  });

  // Prune: keep only the newest MAX_ITEMS_PER_FEED items
  await pruneNewsletterItems(feedId);
}

async function pruneNewsletterItems(feedId: string): Promise<void> {
  const itemCount = await getNewsletterItemCount(feedId);
  if (itemCount <= MAX_ITEMS_PER_FEED) return;

  // Find the oldest items beyond the limit
  const oldItems = await db
    .select({ id: schema.newsletterItems.id })
    .from(schema.newsletterItems)
    .where(eq(schema.newsletterItems.feedId, feedId))
    .orderBy(asc(schema.newsletterItems.receivedAt))
    .limit(itemCount - MAX_ITEMS_PER_FEED);

  for (const item of oldItems) {
    await db
      .delete(schema.newsletterItems)
      .where(eq(schema.newsletterItems.id, item.id));
  }
}

export async function getNewsletterItems(
  feedId: string,
  limit: number = 50
): Promise<NewsletterItemRecord[]> {
  const rows = await db
    .select()
    .from(schema.newsletterItems)
    .where(eq(schema.newsletterItems.feedId, feedId))
    .orderBy(desc(schema.newsletterItems.receivedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    feed_id: row.feedId,
    title: row.title,
    author_name: row.authorName,
    author_email: row.authorEmail,
    content_html: row.contentHtml,
    content_text: row.contentText,
    received_at: row.receivedAt,
    message_id: row.messageId,
  }));
}

export async function updateNewsletterFeedTitle(
  id: string,
  title: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(schema.newsletterFeeds)
    .set({ title, updatedAt: now })
    .where(eq(schema.newsletterFeeds.id, id));
}

export async function deleteNewsletterFeed(id: string): Promise<void> {
  await db
    .delete(schema.newsletterItems)
    .where(eq(schema.newsletterItems.feedId, id));
  await db
    .delete(schema.newsletterFeeds)
    .where(eq(schema.newsletterFeeds.id, id));
}

export async function getNewsletterItem(
  itemId: string
): Promise<NewsletterItemRecord | null> {
  const rows = await db
    .select()
    .from(schema.newsletterItems)
    .where(eq(schema.newsletterItems.id, itemId))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0]!;
  return {
    id: row.id,
    feed_id: row.feedId,
    title: row.title,
    author_name: row.authorName,
    author_email: row.authorEmail,
    content_html: row.contentHtml,
    content_text: row.contentText,
    received_at: row.receivedAt,
    message_id: row.messageId,
  };
}
