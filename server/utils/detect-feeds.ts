import * as cheerio from "cheerio";
import type { DiscoveredFeed } from "./schema";

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
