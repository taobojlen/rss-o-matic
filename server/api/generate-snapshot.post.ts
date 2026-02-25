import { nanoid } from "nanoid";
import type { SnapshotConfig } from "../utils/schema";
import { extractContentText, hashContent } from "../utils/snapshot";

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    url?: string;
    contentSelector?: string;
    suggestedTitle?: string;
  }>(event);

  if (!body?.url || typeof body.url !== "string") {
    throw createError({ statusCode: 400, statusMessage: "url is required" });
  }
  if (!body.contentSelector || typeof body.contentSelector !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "contentSelector is required",
    });
  }

  let normalized: string;
  try {
    normalized = normalizeUrl(body.url);
  } catch {
    throw createError({ statusCode: 400, statusMessage: "Invalid URL" });
  }

  // Check if a feed already exists for this URL
  const existing = await getFeedByUrl(normalized);
  if (existing) {
    return {
      type: "generated" as const,
      feedId: existing.id,
      feedUrl: `/feed/${existing.id}.xml`,
      feedType: "snapshot" as const,
      preview: {
        title: existing.title || "Page Changes",
        description: `Monitoring ${normalized} for changes`,
        link: normalized,
        items: [],
      },
    };
  }

  const snapshotConfig: SnapshotConfig = {
    contentSelector: body.contentSelector,
    feedTitle:
      body.suggestedTitle || `Changes to ${new URL(normalized).hostname}`,
  };

  // Fetch page and take initial snapshot
  const html = await fetchPage(normalized);
  const contentText = extractContentText(html, snapshotConfig);
  const contentHash = await hashContent(contentText);

  // Save feed
  const feedId = nanoid(12);
  await saveFeed(
    feedId,
    normalized,
    snapshotConfig.feedTitle,
    JSON.stringify(snapshotConfig),
    "snapshot"
  );

  // Save initial snapshot
  await saveSnapshot(feedId, contentText, contentHash);

  // Create initial feed item so the feed isn't empty
  const now = new Date();
  const itemTitle = `Initial snapshot — ${now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
  const itemDescription =
    contentText.length > 500
      ? contentText.slice(0, 497) + "..."
      : contentText;
  await saveFeedItem(feedId, itemTitle, normalized, itemDescription, contentHash);

  const feedUrl = `/feed/${feedId}.xml`;
  capturePostHogEvent(event, "feed_generated", {
    outcome: "snapshot_created",
    url: normalized,
  });

  return {
    type: "generated" as const,
    feedId,
    feedUrl,
    feedType: "snapshot" as const,
    preview: {
      title: snapshotConfig.feedTitle,
      description: `Monitoring ${normalized} for changes`,
      link: normalized,
      items: [
        {
          title: itemTitle,
          link: normalized,
          description: itemDescription,
        },
      ],
    },
  };
});
