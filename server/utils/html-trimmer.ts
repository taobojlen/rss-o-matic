import * as cheerio from "cheerio";

const REMOVE_ELEMENTS = [
  "script",
  "style",
  "svg",
  "noscript",
  "iframe",
  "link[rel=stylesheet]",
  "meta",
];

const REMOVE_ATTRS = [
  "style",
  "onclick",
  "onload",
  "onerror",
  "onmouseover",
  "onmouseout",
  "onfocus",
  "onblur",
];

const MAX_TEXT_LENGTH = 200;
const MAX_OUTPUT_LENGTH = 30_000;

/**
 * Strip HTML down to a structural skeleton suitable for an LLM to analyze.
 * Removes scripts, styles, SVGs, noisy attributes, and truncates long text.
 * Caps total output at ~30KB.
 */
export function trimHtml(rawHtml: string): string {
  const $ = cheerio.load(rawHtml);

  // Remove noisy elements
  for (const sel of REMOVE_ELEMENTS) {
    $(sel).remove();
  }

  // Remove noisy attributes
  $("*").each((_, el) => {
    const elem = $(el);
    for (const attr of REMOVE_ATTRS) {
      elem.removeAttr(attr);
    }
    // Remove data-* attributes except data-testid
    const attribs = (el as unknown as { attribs?: Record<string, string> }).attribs || {};
    for (const key of Object.keys(attribs)) {
      if (key.startsWith("data-") && key !== "data-testid") {
        elem.removeAttr(key);
      }
    }

  });

  // Truncate long text nodes
  $("*")
    .contents()
    .each((_, node) => {
      if (node.type === "text") {
        const textNode = node as unknown as { data: string };
        const trimmed = textNode.data.trim();
        if (trimmed.length > MAX_TEXT_LENGTH) {
          textNode.data = trimmed.slice(0, 80) + "...";
        }
      }
    });

  let html = $.html();

  if (html.length > MAX_OUTPUT_LENGTH) {
    html = html.slice(0, MAX_OUTPUT_LENGTH);
  }

  return html;
}
