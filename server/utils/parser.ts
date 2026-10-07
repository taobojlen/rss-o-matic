import * as cheerio from "cheerio";
import type {
  ParserConfig,
  FieldSelector,
  FeedItem,
  ExtractedFeed,
} from "./schema";

/**
 * Execute a parser config against HTML to extract a feed.
 */
export function parseHtml(
  html: string,
  config: ParserConfig,
  sourceUrl: string
): ExtractedFeed {
  const $ = cheerio.load(html);

  const title = resolveFieldOrLiteral($, $.root(), config.feed.title, "Atom Feed");
  const description = config.feed.description
    ? resolveFieldOrLiteral($, $.root(), config.feed.description, "")
    : "";
  const link = config.feed.link
    ? resolveFieldOrLiteral($, $.root(), config.feed.link, sourceUrl)
    : sourceUrl;

  const items: FeedItem[] = [];
  $(config.itemSelector).each((_, el) => {
    const $item = $(el);

    const itemTitle = extractField($, $item, config.fields.title);
    const itemLink = extractField($, $item, config.fields.link);

    // Skip items missing required fields
    if (!itemTitle || !itemLink) return;

    const item: FeedItem = {
      title: itemTitle,
      link: resolveUrl(itemLink, sourceUrl),
    };

    if (config.fields.description) {
      const v = extractField($, $item, config.fields.description);
      if (v) item.description = v;
    }
    if (config.fields.pubDate) {
      const v = extractField($, $item, config.fields.pubDate);
      if (v) item.pubDate = v;
    }
    if (config.fields.author) {
      const v = extractField($, $item, config.fields.author);
      if (v) item.author = v;
    }
    if (config.fields.category) {
      const v = extractField($, $item, config.fields.category);
      if (v) item.category = v;
    }
    if (config.fields.image) {
      const v = extractField($, $item, config.fields.image);
      if (v) item.image = resolveUrl(v, sourceUrl);
    }

    items.push(item);
  });

  return { title, description, link, icon: extractFavicon($, sourceUrl), items };
}

/** Discover a web icon without fetching additional resources. */
export function extractFavicon(
  $: cheerio.CheerioAPI,
  sourceUrl: string,
  documentUrl = sourceUrl
): string {
  let baseUrl = documentUrl;
  try {
    baseUrl = new URL($("base[href]").first().attr("href") || documentUrl, documentUrl).href;
  } catch {
    // Invalid document bases do not prevent source-relative icon discovery.
  }

  let icon: string | undefined;
  let pngIcon: string | undefined;
  let touchIcon: string | undefined;
  $("link[rel][href]").each((_, el) => {
    const link = $(el);
    const rel = link.attr("rel")!.toLowerCase().split(/\s+/);
    const href = link.attr("href")?.trim();
    if (!href) return;

    try {
      const url = new URL(href, baseUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      if (rel.includes("icon")) {
        icon ??= url.href;
        if (link.attr("type")?.toLowerCase() === "image/png" || url.pathname.toLowerCase().endsWith(".png")) {
          pngIcon ??= url.href;
        }
      } else if (rel.includes("apple-touch-icon")) {
        touchIcon ??= url.href;
      }
    } catch {
      // Ignore malformed icon URLs and continue looking for a usable icon.
    }
  });

  return pngIcon ?? icon ?? touchIcon ?? new URL("/favicon.ico", sourceUrl).href;
}

function extractField(
  $: cheerio.CheerioAPI,
  $context: cheerio.Cheerio<any>,
  field: FieldSelector
): string | undefined {
  const target = field.selector
    ? $context.find(field.selector).first()
    : $context;

  if (!target.length) return undefined;

  if (field.attr) {
    return target.attr(field.attr)?.trim();
  }
  if (field.html) {
    return target.html()?.trim();
  }
  return target.text()?.trim() || undefined;
}

function resolveFieldOrLiteral(
  $: cheerio.CheerioAPI,
  $root: cheerio.Cheerio<any>,
  field: FieldSelector | string,
  fallback: string
): string {
  if (typeof field === "string") return field;
  return extractField($, $root, field) || fallback;
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
