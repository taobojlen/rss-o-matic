import { chromium, type Browser } from "playwright";
import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (compatible; RSS-O-Matic/1.0; +https://rss-o-matic.com)";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

/**
 * Detect whether raw HTML appears to be a JS-rendered SPA
 * that needs a headless browser to get meaningful content.
 */
function needsJsRendering(html: string): boolean {
  const spaMarkers = [
    "__NEXT_DATA__",
    "__next_f.push",
    "__NUXT__",
    "window.__data",
    "_app-data",
  ];
  const hasSpaMarkers = spaMarkers.some((m) => html.includes(m));
  if (!hasSpaMarkers) return false;

  // Check if there's meaningful text content in the HTML
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  const textBearingSelectors = "p, h1, h2, h3, h4, h5, h6, li, article, .post, .card";
  const textElements = $(textBearingSelectors).filter(
    (_, el) => ($(el).text().trim().length > 20)
  );

  // If SPA markers detected AND very few text-bearing elements, it's JS-rendered
  return textElements.length < 5;
}

/**
 * Fetch HTML with plain fetch. Returns the raw HTML string.
 */
async function fetchRaw(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

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

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Render a page with Playwright headless Chromium and return the fully rendered HTML.
 */
async function fetchWithBrowser(url: string): Promise<string> {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    return await page.content();
  } finally {
    await page.close();
  }
}

export interface FetchResult {
  html: string;
  needsJs: boolean;
}

/**
 * Fetch a page's HTML. Tries plain fetch first, falls back to Playwright
 * if the page appears to be a JS-rendered SPA.
 */
export async function fetchPage(url: string, forceJs?: boolean): Promise<FetchResult> {
  if (forceJs) {
    return { html: await fetchWithBrowser(url), needsJs: true };
  }

  const rawHtml = await fetchRaw(url);
  if (needsJsRendering(rawHtml)) {
    const renderedHtml = await fetchWithBrowser(url);
    return { html: renderedHtml, needsJs: true };
  }

  return { html: rawHtml, needsJs: false };
}
