import { nanoid } from "nanoid";
import { formatSSE } from "../utils/stream-events";
import type { StreamEvent } from "../utils/stream-events";

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

function friendlyErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "statusMessage" in err) {
    return (err as { statusMessage: string }).statusMessage;
  }

  const message = err instanceof Error ? err.message : String(err);

  const httpMatch = message.match(/^HTTP (\d{3})\b/);
  if (httpMatch) {
    return friendlyFetchError(Number(httpMatch[1]));
  }

  const causeCode =
    err instanceof Error &&
    err.cause &&
    typeof err.cause === "object" &&
    "code" in err.cause
      ? (err.cause as { code: string }).code
      : undefined;

  if (causeCode === "ENOTFOUND") {
    return "Hmm, that address doesn't exist — are you sure you typed it right?";
  }

  if (
    causeCode === "ECONNREFUSED" ||
    causeCode === "ECONNRESET" ||
    causeCode === "EHOSTUNREACH" ||
    message === "fetch failed"
  ) {
    return "We couldn't reach that website. It might be down — try again later!";
  }

  if (
    (err instanceof DOMException && err.name === "AbortError") ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return "That website took too long to respond — it might be asleep at the switch!";
  }

  if (
    message.includes("invalid JSON") ||
    message.includes("itemSelector") ||
    message.includes("feed metadata") ||
    message.includes("Empty response")
  ) {
    return "Our robots got their wires crossed! Give it another whirl — sometimes a second try does the trick.";
  }

  return "Failed to create feed";
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

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  function emit(evt: StreamEvent) {
    writer.write(encoder.encode(formatSSE(evt.event, evt.data))).catch(() => {
      // Client disconnected — ignore write errors
    });
  }

  // Run the pipeline asynchronously, writing SSE frames along the way
  (async () => {
    try {
      // 0. Check if a feed already exists for this URL
      const existing = await getFeedByUrl(normalized);
      if (existing) {
        const parserConfig = JSON.parse(existing.parser_config);
        const cachedPreview = await getCachedPreview(existing.id);
        capturePostHogEvent(event, "feed_generated", { outcome: "existing", url: normalized });
        if (cachedPreview) {
          emit({
            event: "result",
            data: {
              type: "generated",
              feedId: existing.id,
              feedUrl: `/feed/${existing.id}.atom`,
              rssUrl: `/feed/${existing.id}.rss`,
              preview: cachedPreview,
              parserConfig,
            },
          });
          return;
        }
        // Cache miss — fetch the page and parse with existing config
        emit({ event: "status", data: { phase: "fetch" } });
        const html = await fetchPage(normalized);
        const preview = parseHtml(html, parserConfig, normalized);
        await setCachedPreview(existing.id, preview);
        emit({
          event: "result",
          data: {
            type: "generated",
            feedId: existing.id,
            feedUrl: `/feed/${existing.id}.atom`,
            rssUrl: `/feed/${existing.id}.rss`,
            preview,
            parserConfig,
          },
        });
        return;
      }

      // 1. Fetch the page
      emit({ event: "status", data: { phase: "fetch" } });
      const html = await fetchPage(normalized);

      // 2. Check for existing RSS/Atom feeds advertised in the HTML
      const existingFeeds = detectExistingFeeds(html, normalized);
      if (existingFeeds.length > 0) {
        capturePostHogEvent(event, "feed_generated", { outcome: "existing_feed", url: normalized });
        emit({ event: "result", data: { type: "existing_feed", existingFeeds } });
        return;
      }

      // 3. Trim HTML for AI
      const trimmed = trimHtml(html);

      // 4. Generate parser config via AI (agentic tool-use loop with streaming events)
      const aiResult = await generateParserConfig(
        trimmed,
        normalized,
        config.openrouterApiKey,
        config.openrouterModel,
        emit
      );

      // 5. Handle unsuitable / snapshot-available results
      if (aiResult.unsuitable) {
        if (aiResult.snapshotSuitable && aiResult.contentSelector) {
          capturePostHogEvent(event, "feed_generated", { outcome: "snapshot_available", url: normalized });
          emit({
            event: "result",
            data: {
              type: "snapshot_available",
              reason: aiResult.reason,
              contentSelector: aiResult.contentSelector,
              suggestedTitle: aiResult.suggestedTitle || `Changes to ${new URL(normalized).hostname}`,
            },
          });
          return;
        }
        capturePostHogEvent(event, "feed_generated", { outcome: "unsuitable", url: normalized });
        emit({
          event: "result",
          data: { type: "unsuitable", reason: aiResult.reason },
        });
        return;
      }

      // 6. Parse HTML with the generated config
      const parserConfig = aiResult.config;
      const preview = parseHtml(html, parserConfig, normalized);

      // A single matched item + snapshotSuitable likely means the AI matched
      // the whole content block as one "item" — snapshot monitoring is better
      if (preview.items.length === 1 && aiResult.snapshotSuitable && aiResult.contentSelector) {
        capturePostHogEvent(event, "feed_generated", { outcome: "snapshot_available", url: normalized });
        emit({
          event: "result",
          data: {
            type: "snapshot_available",
            reason: "We couldn't find repeating items on this page, but it looks like it gets updated.",
            contentSelector: aiResult.contentSelector,
            suggestedTitle: aiResult.suggestedTitle || `Changes to ${new URL(normalized).hostname}`,
          },
        });
        return;
      }

      if (preview.items.length === 0) {
        if (aiResult.snapshotSuitable && aiResult.contentSelector) {
          capturePostHogEvent(event, "feed_generated", { outcome: "snapshot_available", url: normalized });
          emit({
            event: "result",
            data: {
              type: "snapshot_available",
              reason: "We couldn't find repeating items on this page, but it looks like it gets updated.",
              contentSelector: aiResult.contentSelector,
              suggestedTitle: aiResult.suggestedTitle || `Changes to ${new URL(normalized).hostname}`,
            },
          });
          return;
        }

        capturePostHogEvent(event, "feed_generated", { outcome: "error", url: normalized });
        emit({
          event: "error",
          data: { message: "AI-generated config found no items on the page. Try a different URL." },
        });
        return;
      }

      // 7. Save to database and cache preview
      const feedId = nanoid(12);
      await saveFeed(feedId, normalized, preview.title, JSON.stringify(parserConfig));
      await setCachedPreview(feedId, preview);

      // 8. Return preview
      capturePostHogEvent(event, "feed_generated", { outcome: "created", url: normalized });
      emit({
        event: "result",
        data: {
          type: "generated",
          feedId,
          feedUrl: `/feed/${feedId}.atom`,
          rssUrl: `/feed/${feedId}.rss`,
          preview,
          parserConfig,
        },
      });
    } catch (err: unknown) {
      capturePostHogEvent(event, "feed_generated", { outcome: "error", url: normalized });
      console.error("Generate error:", err);
      emit({ event: "error", data: { message: friendlyErrorMessage(err) } });
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
