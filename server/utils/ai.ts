import type { ParserConfig } from "./schema";
import { validateParserConfig } from "./validate";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const FIELD_SELECTOR_SCHEMA = {
  type: "object",
  properties: {
    selector: { type: "string" },
    attr: { type: "string" },
    html: { type: "boolean" },
  },
  required: ["selector"],
  additionalProperties: false,
};

const FIELD_SELECTOR_OR_STRING_SCHEMA = {
  oneOf: [{ type: "string" }, FIELD_SELECTOR_SCHEMA],
};

const PARSER_CONFIG_SCHEMA = {
  type: "object",
  properties: {
    feed: {
      type: "object",
      properties: {
        title: FIELD_SELECTOR_OR_STRING_SCHEMA,
        description: FIELD_SELECTOR_OR_STRING_SCHEMA,
        link: FIELD_SELECTOR_OR_STRING_SCHEMA,
      },
      required: ["title"],
      additionalProperties: false,
    },
    itemSelector: { type: "string" },
    fields: {
      type: "object",
      properties: {
        title: FIELD_SELECTOR_SCHEMA,
        link: FIELD_SELECTOR_SCHEMA,
        description: FIELD_SELECTOR_SCHEMA,
        pubDate: FIELD_SELECTOR_SCHEMA,
        author: FIELD_SELECTOR_SCHEMA,
        category: FIELD_SELECTOR_SCHEMA,
        image: FIELD_SELECTOR_SCHEMA,
      },
      required: ["title", "link"],
      additionalProperties: false,
    },
  },
  required: ["feed", "itemSelector", "fields"],
  additionalProperties: false,
};

function buildPrompt(trimmedHtml: string, url: string): string {
  return `You are an expert web scraper. Given the HTML of a web page, produce a JSON configuration that describes how to extract an RSS-like feed of items from the page.

The page URL is: ${url}

Analyze the HTML below and identify the repeating pattern of content items (articles, posts, links, products, etc.).

Rules:
1. itemSelector MUST match multiple elements on the page (the repeating items).
2. All selectors in fields are RELATIVE to each matched item element.
3. For links, always use { "selector": "a", "attr": "href" } or similar to get the href attribute.
4. For images, use { "selector": "img", "attr": "src" } or similar.
5. For dates, look for <time> elements with datetime attributes: { "selector": "time", "attr": "datetime" }.
6. If a field is not available on the page, omit it from fields.
7. Prefer specific selectors (classes, data attributes) over generic tag selectors.
8. feed.title can be a literal string if there's no good selector.

HTML:
${trimmedHtml}`;
}

export async function generateParserConfig(
  trimmedHtml: string,
  url: string,
  apiKey: string,
  model: string
): Promise<ParserConfig> {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in environment");

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
      provider: { require_parameters: true },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "parser_config",
          strict: true,
          schema: PARSER_CONFIG_SCHEMA,
        },
      },
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
  if (!content) {
    console.error("Empty AI response, full data:", JSON.stringify(data));
    throw new Error("Empty response from AI");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`AI returned invalid JSON: ${content.slice(0, 200)}`);
  }

  return validateParserConfig(parsed);
}
