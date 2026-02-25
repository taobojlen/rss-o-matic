import { load } from "cheerio";

const DANGEROUS_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "style",
  "link",
  "meta",
  "base",
  "noscript",
];

const DANGEROUS_URL_SCHEMES = /^\s*(javascript|vbscript|data):/i;

/**
 * Sanitize email HTML for safe display.
 * Strips dangerous elements, event handlers, and tracking pixels.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html || !html.trim()) return "";

  // If there's no HTML tags at all, return as-is
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;

  const $ = load(html, { xml: false });

  // Remove dangerous tags entirely
  for (const tag of DANGEROUS_TAGS) {
    $(tag).remove();
  }

  // Process all elements
  $("*").each((_i, el) => {
    const $el = $(el);

    // Remove on* event handler attributes
    const attribs = (el as any).attribs || {};
    for (const attr of Object.keys(attribs)) {
      if (attr.toLowerCase().startsWith("on")) {
        $el.removeAttr(attr);
      }
    }

    // Remove dangerous URL schemes from href and src
    for (const urlAttr of ["href", "src", "action"]) {
      const val = $el.attr(urlAttr);
      if (val && DANGEROUS_URL_SCHEMES.test(val)) {
        $el.removeAttr(urlAttr);
      }
    }
  });

  // Remove tracking pixels: 1x1 images or hidden images
  $("img").each((_i, el) => {
    const $el = $(el);
    const width = $el.attr("width");
    const height = $el.attr("height");
    const style = ($el.attr("style") || "").toLowerCase();

    const isTrackingPixel =
      (width === "1" && height === "1") ||
      (width === "0" || height === "0") ||
      style.includes("display:none") ||
      style.includes("display: none") ||
      style.includes("visibility:hidden") ||
      style.includes("visibility: hidden");

    if (isTrackingPixel) {
      $el.remove();
    }
  });

  return $("body").html() || "";
}
