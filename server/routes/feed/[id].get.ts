import type { ParserConfig } from "../../utils/schema";

export default defineEventHandler(async (event) => {
  let id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing feed ID" });
  }

  // Strip .xml suffix if present
  id = id.replace(/\.xml$/, "");

  const feed = await getFeed(id);
  if (!feed) {
    return new Response("Feed not found", { status: 404 });
  }

  // Check cache
  const cached = await getCachedFeed(id);
  if (cached) {
    setResponseHeaders(event, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    });
    return cached;
  }

  // Fetch, parse, generate
  try {
    const html = await fetchPage(feed.url);
    const config: ParserConfig = JSON.parse(feed.parser_config);
    const extracted = parseHtml(html, config, feed.url);

    const host = getRequestHeader(event, "host") || "localhost";
    const proto = getRequestHeader(event, "x-forwarded-proto") || "https";
    const selfUrl = `${proto}://${host}/feed/${id}.xml`;
    const xml = generateRssXml(extracted, selfUrl);

    await setCachedFeed(id, xml);

    setResponseHeaders(event, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    });
    return xml;
  } catch (err: unknown) {
    console.error(`Feed ${id} fetch error:`, err);
    return new Response("Failed to fetch source page", { status: 502 });
  }
});
