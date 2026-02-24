import { consola } from "consola";
import type { ParserConfig } from "./schema";
import { validateParserConfig } from "./validate";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const logger = consola.withTag("ai");

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

Example: for a page with <ul class="PostList-module__abc123__list"><li class="PostList-module__abc123__item"><a href="/post/1"><span>Title</span><time>Jan 1</time></a></li>...</ul>, the output should be:
{"feed":{"title":"My Blog"},"itemSelector":"[class*='PostList'][class*='list'] > li","fields":{"title":{"selector":"span"},"link":{"selector":"a","attr":"href"},"pubDate":{"selector":"time"}}}

Rules:
1. itemSelector MUST match multiple elements (the repeating items).
2. All field selectors are RELATIVE to each matched item.
3. For links: { "selector": "a", "attr": "href" }. For images: { "selector": "img", "attr": "src" }. For dates: { "selector": "time" }.
4. Omit optional fields that don't exist on the page.
5. NEVER use full CSS class names that contain hashes or look auto-generated. CSS Modules classes like "Component-module__hash__element" change on every deploy and will break.
6. Instead, use [class*='ComponentName'] partial matches to target the stable part of CSS class names. For example, for class="PublicationList-module-scss-module__KxYrHG__list", use [class*='PublicationList'][class*='list'].
7. Each selector MUST be a single valid CSS selector. No pipes (|), no XPath.
8. Keep selectors short and simple.
9. feed.title should be a literal string.

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

  const prompt = buildPrompt(trimmedHtml, url);
  logger.info(
    { url, model, promptChars: prompt.length },
    "Sending request to LLM"
  );
  const start = Date.now();

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
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 4000,
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
    logger.error({ data: JSON.stringify(data) }, "Empty AI response");
    throw new Error("Empty response from AI");
  }

  const durationMs = Date.now() - start;
  logger.info(
    { url, model, durationMs, responseChars: content.length },
    "LLM response received"
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`AI returned invalid JSON: ${content.slice(0, 200)}`);
  }

  return validateParserConfig(parsed);
}
