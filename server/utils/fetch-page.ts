import { consola } from "consola";

const USER_AGENT =
  "Mozilla/5.0 (compatible; RSS-O-Matic/1.0; +https://rss-o-matic.com)";

const logger = consola.withTag("fetch-page");

/**
 * Fetch the HTML of a URL. Follows redirects. Timeout after 15 seconds.
 */
export async function fetchPage(
  url: string,
  accept = "text/html,application/xhtml+xml"
): Promise<string> {
  return (await fetchPageDocument(url, accept)).html;
}

/** Fetch HTML and its final URL after redirects, with a 15-second timeout. */
export async function fetchPageDocument(
  url: string,
  accept = "text/html,application/xhtml+xml"
): Promise<{ html: string; url: string }> {
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
        Accept: accept,
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
    return { html, url: response.url };
  } finally {
    clearTimeout(timeout);
  }
}
