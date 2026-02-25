import type { ParserConfig, SnapshotConfig, ExtractedFeed } from "../../utils/schema";
import { detectChange } from "../../utils/change-detector";

type FeedFormat = "atom" | "rss";

function parseIdAndFormat(raw: string): { id: string; format: FeedFormat } {
  if (raw.endsWith(".atom")) {
    return { id: raw.replace(/\.atom$/, ""), format: "atom" };
  }
  if (raw.endsWith(".rss") || raw.endsWith(".xml")) {
    return { id: raw.replace(/\.(rss|xml)$/, ""), format: "rss" };
  }
  return { id: raw, format: "atom" };
}

function contentTypeForFormat(_format: FeedFormat): string {
  // Must use application/xml so browsers render the XSL stylesheet
  // instead of triggering a download (application/atom+xml or
  // application/rss+xml cause browsers to download the file).
  return "application/xml; charset=utf-8";
}

function extensionForFormat(format: FeedFormat): string {
  return format === "atom" ? ".atom" : ".rss";
}

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, "id");
  if (!raw) {
    throw createError({ statusCode: 400, statusMessage: "Missing feed ID" });
  }

  const { id, format } = parseIdAndFormat(raw);

  const feed = await getFeed(id);

  // If not a web-scrape feed, check if it's a newsletter feed
  if (!feed) {
    const newsletterFeed = await getNewsletterFeed(id);
    if (!newsletterFeed) {
      return new Response("Feed not found", { status: 404 });
    }

    return await serveNewsletterFeed(event, id, newsletterFeed, format);
  }

  // Log fetch for popularity tracking (fire-and-forget)
  const ctx = (event as any).context?.cloudflare?.context;
  if (ctx?.waitUntil) {
    ctx.waitUntil(logFeedFetch(id));
  } else {
    logFeedFetch(id).catch(() => {});
  }

  // Check cache
  const cached = await getCachedFeed(id, format);
  if (cached) {
    setResponseHeaders(event, {
      "Content-Type": contentTypeForFormat(format),
      "Cache-Control": "public, max-age=900",
    });
    return cached;
  }

  // Fetch, parse, generate
  try {
    const html = await fetchPage(feed.url);

    if (feed.type === "snapshot") {
      return await serveSnapshotFeed(event, feed, html, id, format);
    }

    const config: ParserConfig = JSON.parse(feed.parser_config);
    let extracted = parseHtml(html, config, feed.url);

    // Stale selector detection: 0 items means selectors likely broke
    if (extracted.items.length === 0) {
      const result = await attemptRegeneration(feed, html);
      if (result.status === "success" && result.extracted) {
        extracted = result.extracted;
      }
    }

    const host = getRequestHeader(event, "host") || "localhost";
    const proto = getRequestHeader(event, "x-forwarded-proto") || "https";
    const baseUrl = `${proto}://${host}`;
    const selfUrl = `${baseUrl}/feed/${id}${extensionForFormat(format)}`;
    const xml =
      format === "atom"
        ? generateAtomXml(extracted, selfUrl, baseUrl)
        : generateRssXml(extracted, selfUrl, baseUrl);

    await setCachedFeed(id, xml, format);

    setResponseHeaders(event, {
      "Content-Type": contentTypeForFormat(format),
      "Cache-Control": "public, max-age=900",
    });
    return xml;
  } catch (err: unknown) {
    console.error(`Feed ${id} fetch error:`, err);
    throw createError({ statusCode: 502, statusMessage: "Failed to fetch source page", cause: err });
  }
});

async function serveSnapshotFeed(
  event: any,
  feed: { url: string; title: string | null; parser_config: string },
  html: string,
  feedId: string,
  format: FeedFormat
) {
  const config: SnapshotConfig = JSON.parse(feed.parser_config);

  // Get latest snapshot for comparison
  const latestSnapshot = await getLatestSnapshot(feedId);

  // Detect changes
  const result = await detectChange(
    html,
    config,
    latestSnapshot?.contentText ?? null,
    latestSnapshot?.contentHash ?? null
  );

  // If changed, create a new feed item and update snapshot
  if (result.changed) {
    const now = new Date();
    const title = `Update \u2014 ${now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}, ${now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;

    await saveFeedItem(
      feedId,
      title,
      feed.url,
      result.summary || "Page content was updated.",
      result.currentHash
    );

    await saveSnapshot(feedId, result.currentText, result.currentHash);

    // Prune old data (fire-and-forget)
    const ctx = (event as any).context?.cloudflare?.context;
    const pruneWork = Promise.all([
      pruneSnapshots(feedId, 3),
      pruneFeedItems(feedId, 50),
    ]);
    if (ctx?.waitUntil) {
      ctx.waitUntil(pruneWork);
    } else {
      pruneWork.catch(() => {});
    }
  }

  // Build feed from stored items
  const items = await getFeedItems(feedId, 50);
  const extracted: ExtractedFeed = {
    title: config.feedTitle || feed.title || "Page Changes",
    description: `Monitoring ${feed.url} for changes`,
    link: feed.url,
    items: items.map((item) => ({
      title: item.title,
      link: item.link,
      description: item.description || undefined,
      pubDate: item.detectedAt,
    })),
  };

  const host = getRequestHeader(event, "host") || "localhost";
  const proto = getRequestHeader(event, "x-forwarded-proto") || "https";
  const baseUrl = `${proto}://${host}`;
  const selfUrl = `${baseUrl}/feed/${feedId}${extensionForFormat(format)}`;
  const xml =
    format === "atom"
      ? generateAtomXml(extracted, selfUrl, baseUrl)
      : generateRssXml(extracted, selfUrl, baseUrl);

  await setCachedFeed(feedId, xml, format);

  setResponseHeaders(event, {
    "Content-Type": contentTypeForFormat(format),
    "Cache-Control": "public, max-age=900",
  });
  return xml;
}

async function serveNewsletterFeed(
  event: any,
  id: string,
  newsletterFeed: { id: string; title: string; email_address: string },
  format: FeedFormat
) {
  // Check cache first
  const cached = await getCachedFeed(id, format);
  if (cached) {
    setResponseHeaders(event, {
      "Content-Type": contentTypeForFormat(format),
      "Cache-Control": "public, max-age=900",
    });
    return cached;
  }

  const items = await getNewsletterItems(id);
  const host = getRequestHeader(event, "host") || "localhost";
  const proto = getRequestHeader(event, "x-forwarded-proto") || "https";
  const baseUrl = `${proto}://${host}`;
  const selfUrl = `${baseUrl}/feed/${id}${extensionForFormat(format)}`;

  const extracted: ExtractedFeed = {
    title: newsletterFeed.title,
    description: `${newsletterFeed.title} — Newsletter feed powered by RSS-O-Matic`,
    link: `${baseUrl}/feed/${id}${extensionForFormat(format)}`,
    items: items.map((item) => ({
      title: item.title,
      link: `${baseUrl}/newsletter/${id}/${item.id}`,
      description: item.content_text
        ? item.content_text.slice(0, 500)
        : undefined,
      pubDate: item.received_at,
      author: item.author_name || item.author_email || undefined,
    })),
  };

  const xml =
    format === "atom"
      ? generateAtomXml(extracted, selfUrl)
      : generateRssXml(extracted, selfUrl);

  await setCachedFeed(id, xml, format);

  setResponseHeaders(event, {
    "Content-Type": contentTypeForFormat(format),
    "Cache-Control": "public, max-age=900",
  });
  return xml;
}
