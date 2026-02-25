import { kv } from '@nuxthub/kv'
import type { ExtractedFeed } from './schema'

const CACHE_TTL_SECONDS = 15 * 60; // 15 minutes
export async function getCachedFeed(
  feedId: string,
  format: string = "rss"
): Promise<string | null> {
  const cached = await kv.get<string>(`feed:${feedId}:${format}`);
  return cached ?? null;
}

export async function setCachedFeed(
  feedId: string,
  xml: string,
  format: string = "rss"
): Promise<void> {
  await kv.set(`feed:${feedId}:${format}`, xml, { ttl: CACHE_TTL_SECONDS });
}

export async function getCachedPreview(
  feedId: string
): Promise<ExtractedFeed | null> {
  const cached = await kv.get<ExtractedFeed>(`preview:${feedId}`);
  return cached ?? null;
}

export async function setCachedPreview(
  feedId: string,
  preview: ExtractedFeed
): Promise<void> {
  await kv.set(`preview:${feedId}`, preview);
}

export async function invalidateCachedFeed(feedId: string): Promise<void> {
  await Promise.all([
    kv.del(`feed:${feedId}:rss`),
    kv.del(`feed:${feedId}:atom`),
  ]);
}
