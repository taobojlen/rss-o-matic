import { consola } from "consola";

const USER_AGENT =
  "Mozilla/5.0 (compatible; RSS-O-Matic/1.0; +https://rss-o-matic.com)";

const logger = consola.withTag("fetch-page");

/**
 * Fetch the HTML of a URL. Follows redirects. Timeout after 15 seconds.
 */
export async function fetchPage(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  logger.info({ url }, "Fetching page");
  const start = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const durationMs = Date.now() - start;
    logger.info(
      { url, status: response.status, durationMs, bytes: html.length },
      "Page fetched"
    );
    return html;
  } finally {
    clearTimeout(timeout);
  }
}
