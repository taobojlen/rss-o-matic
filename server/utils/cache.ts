import { kv } from '@nuxthub/kv'
import type { ExtractedFeed } from './schema'

const CACHE_TTL_SECONDS = 15 * 60; // 15 minutes

export async function getCachedFeed(
  feedId: string
): Promise<string | null> {
  const cached = await kv.get<string>(`feed:${feedId}`);
  return cached ?? null;
}

export async function setCachedFeed(
  feedId: string,
  xml: string
): Promise<void> {
  await kv.set(`feed:${feedId}`, xml, { ttl: CACHE_TTL_SECONDS });
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
