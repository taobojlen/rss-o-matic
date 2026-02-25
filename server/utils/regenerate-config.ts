import { consola } from "consola";
import type { FeedRecord, ExtractedFeed } from "./schema";
import { invalidateCachedFeed } from "./cache";
import { generateParserConfig } from "./ai";
import { parseHtml } from "./parser";
import { trimHtml } from "./html-trimmer";
import { updateFeedConfig } from "./db";
import { captureServerException } from "./posthog";

const logger = consola.withTag("regenerate");

export interface RegenerationResult {
  status: "success" | "failed";
  extracted?: ExtractedFeed;
}

/**
 * Attempt to regenerate a feed's parser config using AI.
 * Returns the new config and extracted feed if successful.
 */
export async function attemptRegeneration(
  feed: FeedRecord,
  html: string
): Promise<RegenerationResult> {
  const config = useRuntimeConfig();

  try {
    const trimmed = trimHtml(html);
    logger.info({ feedId: feed.id, url: feed.url }, "Attempting config regeneration");

    const result = await generateParserConfig(
      trimmed,
      feed.url,
      config.openrouterApiKey,
      config.openrouterModel
    );

    if (result.unsuitable) {
      logger.warn({ feedId: feed.id, reason: result.reason }, "AI deemed page unsuitable");
      return { status: "failed" };
    }

    const newConfig = result.config;
    const extracted = parseHtml(html, newConfig, feed.url);
    if (extracted.items.length === 0) {
      logger.warn({ feedId: feed.id }, "Regenerated config also found 0 items");
      await captureServerException(
        new Error(`Regenerated config found 0 items for feed ${feed.id}`),
        { feedId: feed.id, url: feed.url }
      );
      return { status: "failed" };
    }

    await updateFeedConfig(feed.id, JSON.stringify(newConfig), extracted.title);
    await invalidateCachedFeed(feed.id);

    logger.info(
      { feedId: feed.id, itemCount: extracted.items.length },
      "Config regenerated successfully"
    );

    return { status: "success", extracted };
  } catch (err) {
    logger.error({ feedId: feed.id, error: String(err) }, "Config regeneration failed");
    await captureServerException(err instanceof Error ? err : new Error(String(err)), {
      feedId: feed.id,
      url: feed.url,
    });
    return { status: "failed" };
  }
}
