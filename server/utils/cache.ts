import { kv } from "@nuxthub/kv";

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
