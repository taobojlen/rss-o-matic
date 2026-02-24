import type { ExtractedFeed, FeedItem } from "./schema";

/**
 * Generate RSS 2.0 XML from an extracted feed.
 */
export function generateRssXml(feed: ExtractedFeed, selfUrl: string): string {
  const items = feed.items.map((item) => buildItem(item)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(feed.title)}</title>
    <link>${esc(feed.link)}</link>
    <description>${esc(feed.description)}</description>
    <atom:link href="${esc(selfUrl)}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>RSS-O-Matic</generator>
${items}
  </channel>
</rss>`;
}

function buildItem(item: FeedItem): string {
  let xml = "    <item>\n";
  xml += `      <title>${esc(item.title)}</title>\n`;
  xml += `      <link>${esc(item.link)}</link>\n`;
  xml += `      <guid isPermaLink="true">${esc(item.link)}</guid>\n`;

  if (item.description) {
    xml += `      <description>${esc(item.description)}</description>\n`;
  }
  if (item.pubDate) {
    const date = tryParseDate(item.pubDate);
    if (date) {
      xml += `      <pubDate>${date.toUTCString()}</pubDate>\n`;
    }
  }
  if (item.author) {
    xml += `      <author>${esc(item.author)}</author>\n`;
  }
  if (item.category) {
    xml += `      <category>${esc(item.category)}</category>\n`;
  }
  if (item.image) {
    xml += `      <enclosure url="${esc(item.image)}" type="image/jpeg" length="0"/>\n`;
  }

  xml += "    </item>";
  return xml;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tryParseDate(str: string): Date | null {
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
