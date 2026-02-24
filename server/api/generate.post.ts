import { nanoid } from "nanoid";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ url?: string }>(event);

  if (!body?.url || typeof body.url !== "string") {
    throw createError({ statusCode: 400, statusMessage: "url is required" });
  }

  let normalized: string;
  try {
    normalized = normalizeUrl(body.url);
  } catch {
    throw createError({ statusCode: 400, statusMessage: "Invalid URL" });
  }

  const config = useRuntimeConfig();

  try {
    // 0. Check if a feed already exists for this URL — return cached preview if available
    const existing = await getFeedByUrl(normalized);
    if (existing) {
      const parserConfig = JSON.parse(existing.parser_config);
      const cachedPreview = await getCachedPreview(existing.id);
      capturePostHogEvent(event, "feed_generated", { outcome: "existing", url: normalized });
      if (cachedPreview) {
        return {
          type: "generated" as const,
          feedId: existing.id,
          feedUrl: `/feed/${existing.id}.xml`,
          preview: cachedPreview,
          parserConfig,
        };
      }
      // Cache miss — fetch the page and parse with existing config
      const html = await fetchPage(normalized);
      const preview = parseHtml(html, parserConfig, normalized);
      await setCachedPreview(existing.id, preview);
      return {
        type: "generated" as const,
        feedId: existing.id,
        feedUrl: `/feed/${existing.id}.xml`,
        preview,
        parserConfig,
      };
    }

    // 1. Fetch the page
    const html = await fetchPage(normalized);

    // 2. Check for existing RSS/Atom feeds advertised in the HTML
    const existingFeeds = detectExistingFeeds(html, normalized);
    if (existingFeeds.length > 0) {
      capturePostHogEvent(event, "feed_generated", { outcome: "existing_feed", url: normalized });
      return {
        type: "existing_feed" as const,
        existingFeeds,
      };
    }

    // 3. Trim HTML for AI
    const trimmed = trimHtml(html);

    // 4. Generate parser config via AI
    const aiResult = await generateParserConfig(
      trimmed,
      normalized,
      config.openrouterApiKey,
      config.openrouterModel
    );

    // 5. Check if AI flagged the page as unsuitable
    if (aiResult.unsuitable) {
      capturePostHogEvent(event, "feed_generated", { outcome: "unsuitable", url: normalized });
      return {
        type: "unsuitable" as const,
        reason: aiResult.reason,
      };
    }

    const parserConfig = aiResult.config;

    // 6. Validate by running the parser against the actual HTML
    const preview = parseHtml(html, parserConfig, normalized);
    if (preview.items.length === 0) {
      throw createError({
        statusCode: 422,
        statusMessage:
          "AI-generated config found no items on the page. Try a different URL.",
      });
    }

    // 7. Save to database and cache preview
    const feedId = nanoid(12);
    await saveFeed(
      feedId,
      normalized,
      preview.title,
      JSON.stringify(parserConfig)
    );
    await setCachedPreview(feedId, preview);

    // 8. Return preview
    const feedUrl = `/feed/${feedId}.xml`;
    capturePostHogEvent(event, "feed_generated", { outcome: "created", url: normalized });
    return {
      type: "generated" as const,
      feedId,
      feedUrl,
      preview,
      parserConfig,
    };
  } catch (err: unknown) {
    capturePostHogEvent(event, "feed_generated", { outcome: "error", url: normalized });
    // Re-throw if already an H3Error
    if (err && typeof err === "object" && "statusCode" in err) {
      throw err;
    }
    console.error("Generate error:", err);
    throw createError({ statusCode: 500, statusMessage: "Failed to create feed", cause: err });
  }
});
