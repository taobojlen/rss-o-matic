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
    // 0. Check if a feed already exists for this URL
    const existing = await getFeedByUrl(normalized);
    if (existing) {
      const parserConfig = JSON.parse(existing.parser_config);
      const html = await fetchPage(normalized);
      const preview = parseHtml(html, parserConfig, normalized);
      return {
        feedId: existing.id,
        feedUrl: `/feed/${existing.id}.xml`,
        preview,
        parserConfig,
      };
    }

    // 1. Fetch the page
    const html = await fetchPage(normalized);

    // 2. Trim HTML for AI
    const trimmed = trimHtml(html);

    // 3. Generate parser config via AI
    const parserConfig = await generateParserConfig(
      trimmed,
      normalized,
      config.openrouterApiKey,
      config.openrouterModel
    );

    // 4. Validate by running the parser against the actual HTML
    const preview = parseHtml(html, parserConfig, normalized);
    if (preview.items.length === 0) {
      throw createError({
        statusCode: 422,
        statusMessage:
          "AI-generated config found no items on the page. Try a different URL.",
      });
    }

    // 5. Save to database
    const feedId = nanoid(12);
    await saveFeed(
      feedId,
      normalized,
      preview.title,
      JSON.stringify(parserConfig)
    );

    // 6. Return preview
    const feedUrl = `/feed/${feedId}.xml`;
    return {
      feedId,
      feedUrl,
      preview,
      parserConfig,
    };
  } catch (err: unknown) {
    // Re-throw if already an H3Error
    if (err && typeof err === "object" && "statusCode" in err) {
      throw err;
    }
    console.error("Generate error:", err);
    throw createError({ statusCode: 500, statusMessage: "Failed to create feed", cause: err });
  }
});
