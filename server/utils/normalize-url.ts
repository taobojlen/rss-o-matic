/**
 * Normalize a URL for deduplication:
 * - Lowercase scheme and hostname
 * - Remove default ports (80 for http, 443 for https)
 * - Remove trailing slash (unless path is just "/")
 * - Sort query parameters
 * - Remove fragment
 */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw);

  // Remove fragment
  url.hash = "";

  // Remove default ports
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  // Sort query parameters
  url.searchParams.sort();

  // Build the normalized string — URL constructor already lowercases scheme + host
  let normalized = url.toString();

  // Remove trailing slash unless the path is exactly "/"
  if (url.pathname !== "/" && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}
