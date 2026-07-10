import * as cheerio from "cheerio";
import { parseFeed } from "feedsmith";
import type { DiscoveredFeed, DiscoveredFeedItem } from "./schema";

const FEED_TYPES: Record<string, DiscoveredFeed["feedType"]> = {
  "application/rss+xml": "rss",
  "application/atom+xml": "atom",
  "application/feed+json": "json",
};

/**
 * Scan HTML for <link rel="alternate"> tags that advertise existing RSS, Atom,
 * or JSON feeds. Returns an array of discovered feed URLs.
 * Must be called on raw HTML (before trimHtml strips tags).
 */
export function detectExistingFeeds(
  html: string,
  sourceUrl: string
): DiscoveredFeed[] {
  const $ = cheerio.load(html);
  const feeds: DiscoveredFeed[] = [];

  $('link[rel="alternate"]').each((_, el) => {
    const type = $(el).attr("type");
    if (!type) return;

    const feedType = FEED_TYPES[type];
    if (!feedType) return;

    const href = $(el).attr("href");
    if (!href) return;

    const title = $(el).attr("title") || undefined;

    let url: string;
    try {
      url = new URL(href, sourceUrl).toString();
    } catch {
      return;
    }

    feeds.push({ url, title, feedType });
  });

  return feeds;
}

const PREVIEW_ITEM_LIMIT = 3;

function absoluteUrl(value: string | undefined, baseUrl?: string): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function createPreviewItem(
  title: string | undefined,
  link?: string,
  pubDate?: string,
  baseUrl?: string
): DiscoveredFeedItem | null {
  if (!title) return null;
  const absoluteLink = absoluteUrl(link, baseUrl);

  return {
    title,
    ...(absoluteLink ? { link: absoluteLink } : {}),
    ...(pubDate ? { pubDate } : {}),
  };
}

function previewItems<T>(
  items: T[] | undefined,
  getItem: (item: T) => DiscoveredFeedItem | null
): DiscoveredFeedItem[] {
  return (items || [])
    .slice(0, PREVIEW_ITEM_LIMIT)
    .map(getItem)
    .filter((item): item is DiscoveredFeedItem => item !== null);
}

/**
 * Extract a small, display-only sample from a discovered RSS, Atom, or JSON
 * feed. Invalid feeds intentionally produce no preview rather than blocking
 * the option to use the feed itself.
 */
export function parseExistingFeedItems(
  feedContent: string,
  _feedType: DiscoveredFeed["feedType"],
  baseUrl?: string
): DiscoveredFeedItem[] {
  try {
    const parsed = parseFeed(feedContent, { maxItems: PREVIEW_ITEM_LIMIT });

    switch (parsed.format) {
      case "rss":
      case "rdf":
        return previewItems(parsed.feed.items, (item) =>
          createPreviewItem(item.title, item.link, item.pubDate, baseUrl)
        );
      case "atom":
        return previewItems(parsed.feed.entries, (entry) => {
          const link =
            entry.links?.find((candidate) => candidate.rel === "alternate")?.href ||
            entry.links?.[0]?.href;
          return createPreviewItem(
            entry.title?.value,
            link,
            entry.published || entry.updated,
            baseUrl
          );
        });
      case "json":
        return previewItems(parsed.feed.items, (item) =>
          createPreviewItem(
            item.title,
            item.url || item.external_url,
            item.date_published || item.date_modified,
            baseUrl
          )
        );
    }
  } catch {
    return [];
  }
}

/**
 * Fetch a short preview for each discovered feed. This is deliberately
 * best-effort: an unavailable or malformed feed should not hide the original
 * feed link or prevent the user from choosing AI generation.
 */
export async function getExistingFeedPreviews(
  feeds: DiscoveredFeed[]
): Promise<DiscoveredFeed[]> {
  return Promise.all(
    feeds.map(async (feed) => {
      try {
        const content = await fetchPage(
          feed.url,
          "application/rss+xml, application/atom+xml, application/feed+json, application/json, text/xml, application/xml;q=0.9, */*;q=0.8"
        );
        return {
          ...feed,
          items: parseExistingFeedItems(content, feed.feedType, feed.url),
        };
      } catch {
        return feed;
      }
    })
  );
}
