interface CacheEntry {
  xml: string;
  cachedAt: number;
}

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const cache = new Map<string, CacheEntry>();

export function getCachedFeed(feedId: string): string | null {
  const entry = cache.get(feedId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(feedId);
    return null;
  }
  return entry.xml;
}

export function setCachedFeed(feedId: string, xml: string): void {
  cache.set(feedId, { xml, cachedAt: Date.now() });
}

/** Periodically prune expired entries. Call once at startup. */
export function startCacheCleanup(intervalMs = 5 * 60 * 1000): void {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now - entry.cachedAt > TTL_MS) {
        cache.delete(key);
      }
    }
  }, intervalMs);
}
