import { nanoid } from "nanoid";

function friendlyFetchError(status: number): string {
  if (status === 403) {
    return "No dice — that website slammed the door on us! Some sites don't take kindly to automated visitors.";
  }
  if (status === 404) {
    return "We knocked, but nobody's home! Double-check that URL and give it another whirl.";
  }
  if (status === 429) {
    return "Whoa there — that website says we're coming in too hot! Give it a minute and try again.";
  }
  if (status >= 500) {
    return "Looks like that website blew a fuse on their end! Try again later once they've got things patched up.";
  }
  return `That website gave us the cold shoulder (HTTP ${status}). Try a different URL!`;
}

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
          feedUrl: `/feed/${existing.id}.atom`,
        rssUrl: `/feed/${existing.id}.rss`,
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
        feedUrl: `/feed/${existing.id}.atom`,
        rssUrl: `/feed/${existing.id}.rss`,
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

    // 4. Generate parser config via AI (uses an internal agentic tool-use loop)
    const aiResult = await generateParserConfig(
      trimmed,
      normalized,
      config.openrouterApiKey,
      config.openrouterModel
    );

    // 5. Handle unsuitable / snapshot-available results
    if (aiResult.unsuitable) {
      if (aiResult.snapshotSuitable && aiResult.contentSelector) {
        capturePostHogEvent(event, "feed_generated", { outcome: "snapshot_available", url: normalized });
        return {
          type: "snapshot_available" as const,
          reason: aiResult.reason,
          contentSelector: aiResult.contentSelector,
          suggestedTitle: aiResult.suggestedTitle || `Changes to ${new URL(normalized).hostname}`,
        };
      }
      capturePostHogEvent(event, "feed_generated", { outcome: "unsuitable", url: normalized });
      return {
        type: "unsuitable" as const,
        reason: aiResult.reason,
      };
    }

    // 6. Parse HTML with the generated config
    const parserConfig = aiResult.config;
    const preview = parseHtml(html, parserConfig, normalized);

    // A single matched item + snapshotSuitable likely means the AI matched
    // the whole content block as one "item" — snapshot monitoring is better
    if (preview.items.length === 1 && aiResult.snapshotSuitable && aiResult.contentSelector) {
      capturePostHogEvent(event, "feed_generated", { outcome: "snapshot_available", url: normalized });
      return {
        type: "snapshot_available" as const,
        reason: "We couldn't find repeating items on this page, but it looks like it gets updated.",
        contentSelector: aiResult.contentSelector,
        suggestedTitle: aiResult.suggestedTitle || `Changes to ${new URL(normalized).hostname}`,
      };
    }

    if (preview.items.length === 0) {
      // Fall back to snapshot monitoring if the AI flagged the page as suitable
      if (aiResult.snapshotSuitable && aiResult.contentSelector) {
        capturePostHogEvent(event, "feed_generated", { outcome: "snapshot_available", url: normalized });
        return {
          type: "snapshot_available" as const,
          reason: "We couldn't find repeating items on this page, but it looks like it gets updated.",
          contentSelector: aiResult.contentSelector,
          suggestedTitle: aiResult.suggestedTitle || `Changes to ${new URL(normalized).hostname}`,
        };
      }

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
    const feedUrl = `/feed/${feedId}.atom`;
    const rssUrl = `/feed/${feedId}.rss`;
    capturePostHogEvent(event, "feed_generated", { outcome: "created", url: normalized });
    return {
      type: "generated" as const,
      feedId,
      feedUrl,
      rssUrl,
      preview,
      parserConfig,
    };
  } catch (err: unknown) {
    capturePostHogEvent(event, "feed_generated", { outcome: "error", url: normalized });
    // Re-throw if already an H3Error
    if (err && typeof err === "object" && "statusCode" in err) {
      throw err;
    }

    const message =
      err instanceof Error ? err.message : String(err);
    console.error("Generate error:", err);

    // fetchPage throws "HTTP {status} {statusText}" for non-ok responses
    const httpMatch = message.match(/^HTTP (\d{3})\b/);
    if (httpMatch) {
      const status = Number(httpMatch[1]);
      throw createError({
        statusCode: 502,
        statusMessage: friendlyFetchError(status),
        cause: err,
      });
    }

    // DNS / connection / timeout errors from fetch
    const causeCode =
      err instanceof Error &&
      err.cause &&
      typeof err.cause === "object" &&
      "code" in err.cause
        ? (err.cause as { code: string }).code
        : undefined;

    if (causeCode === "ENOTFOUND") {
      throw createError({
        statusCode: 422,
        statusMessage:
          "Hmm, that address doesn't exist — are you sure you typed it right?",
        cause: err,
      });
    }

    if (
      causeCode === "ECONNREFUSED" ||
      causeCode === "ECONNRESET" ||
      causeCode === "EHOSTUNREACH" ||
      message === "fetch failed"
    ) {
      throw createError({
        statusCode: 502,
        statusMessage:
          "We couldn't reach that website. It might be down — try again later!",
        cause: err,
      });
    }

    if (
      (err instanceof DOMException && err.name === "AbortError") ||
      causeCode === "UND_ERR_CONNECT_TIMEOUT"
    ) {
      throw createError({
        statusCode: 504,
        statusMessage:
          "That website took too long to respond — it might be asleep at the switch!",
        cause: err,
      });
    }

    throw createError({ statusCode: 500, statusMessage: "Failed to create feed", cause: err });
  }
});
