import type { ParserConfig } from "./schema";
import { validateParserConfig } from "./validate";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function buildPrompt(trimmedHtml: string, url: string): string {
  return `You are an expert web scraper. Given the HTML of a web page, produce a JSON configuration that describes how to extract an RSS-like feed of items from the page.

The page URL is: ${url}

Analyze the HTML below and identify the repeating pattern of content items (articles, posts, links, products, etc.). Then produce a JSON object matching this exact TypeScript interface:

interface FieldSelector {
  selector: string;  // CSS selector relative to the item element
  attr?: string;     // attribute to extract (e.g. "href"); omit for textContent
  html?: boolean;    // true to extract innerHTML instead of textContent
}

interface ParserConfig {
  feed: {
    title: FieldSelector | string;
    description?: FieldSelector | string;
    link?: FieldSelector | string;
  };
  itemSelector: string;  // CSS selector matching each repeating item
  fields: {
    title: FieldSelector;
    link: FieldSelector;
    description?: FieldSelector;
    pubDate?: FieldSelector;
    author?: FieldSelector;
    category?: FieldSelector;
    image?: FieldSelector;
  };
}

Rules:
1. itemSelector MUST match multiple elements on the page (the repeating items).
2. All selectors in fields are RELATIVE to each matched item element.
3. For links, always use { "selector": "a", "attr": "href" } or similar to get the href attribute.
4. For images, use { "selector": "img", "attr": "src" } or similar.
5. For dates, look for <time> elements with datetime attributes: { "selector": "time", "attr": "datetime" }.
6. If a field is not available on the page, omit it from fields.
7. Prefer specific selectors (classes, data attributes) over generic tag selectors.
8. feed.title can be a literal string if there's no good selector.
9. Return ONLY the JSON object. No markdown fences, no explanation.

HTML:
${trimmedHtml}`;
}

export async function generateParserConfig(
  trimmedHtml: string,
  url: string
): Promise<ParserConfig> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in environment");

  const model = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4";

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://rss-o-matic.com",
      "X-Title": "RSS-O-Matic",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildPrompt(trimmedHtml, url) }],
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from AI");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`AI returned invalid JSON: ${content.slice(0, 200)}`);
  }

  return validateParserConfig(parsed);
}
