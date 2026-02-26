import { OpenAI } from "@posthog/ai/openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { consola } from "consola";
import type { ParserConfig } from "./schema";
import { validateParserConfig } from "./validate";
import { usePostHogClient } from "./posthog";

export type AiParserResult =
  | {
      unsuitable: false;
      config: ParserConfig;
      snapshotSuitable: boolean;
      contentSelector?: string;
      suggestedTitle?: string;
    }
  | {
      unsuitable: true;
      reason: string;
      snapshotSuitable: boolean;
      contentSelector?: string;
      suggestedTitle?: string;
    };

const logger = consola.withTag("ai");

const FIELD_SELECTOR_SCHEMA = {
  type: "object",
  properties: {
    selector: { type: "string" },
    attr: { anyOf: [{ type: "string" }, { type: "null" }] },
    html: { anyOf: [{ type: "boolean" }, { type: "null" }] },
  },
  required: ["selector", "attr", "html"],
  additionalProperties: false,
};

const NULLABLE_FIELD_SELECTOR_SCHEMA = {
  anyOf: [FIELD_SELECTOR_SCHEMA, { type: "null" }],
};

const PARSER_CONFIG_SCHEMA = {
  type: "object",
  properties: {
    unsuitable: { type: "boolean" },
    unsuitableReason: { type: "string" },
    snapshotSuitable: { type: "boolean" },
    contentSelector: { type: "string" },
    suggestedTitle: { type: "string" },
    feed: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: NULLABLE_FIELD_SELECTOR_SCHEMA,
        link: NULLABLE_FIELD_SELECTOR_SCHEMA,
      },
      required: ["title", "description", "link"],
      additionalProperties: false,
    },
    itemSelector: { type: "string" },
    fields: {
      type: "object",
      properties: {
        title: FIELD_SELECTOR_SCHEMA,
        link: FIELD_SELECTOR_SCHEMA,
        description: NULLABLE_FIELD_SELECTOR_SCHEMA,
        pubDate: NULLABLE_FIELD_SELECTOR_SCHEMA,
        author: NULLABLE_FIELD_SELECTOR_SCHEMA,
        category: NULLABLE_FIELD_SELECTOR_SCHEMA,
        image: NULLABLE_FIELD_SELECTOR_SCHEMA,
      },
      required: ["title", "link", "description", "pubDate", "author", "category", "image"],
      additionalProperties: false,
    },
  },
  required: ["unsuitable", "unsuitableReason", "snapshotSuitable", "contentSelector", "suggestedTitle", "feed", "itemSelector", "fields"],
  additionalProperties: false,
};

function buildPrompt(trimmedHtml: string, url: string): string {
  return `You are an expert web scraper. Given the HTML of a web page, produce a JSON configuration that describes how to extract an RSS-like feed of items from the page.

The page URL is: ${url}

First, assess whether this page is suitable for RSS feed generation. A page is suitable if it contains a repeating list of content items (blog posts, articles, news items, podcast episodes, etc.) that would make sense as an RSS feed. A page is NOT suitable if it is a single article/post, a landing page, a web store/product page, a login/signup form, a documentation page, or any page without a clear list of updatable content items.

If the page is NOT suitable, set "unsuitable" to true and "unsuitableReason" to a short explanation of why (e.g. "This appears to be a single blog post, not a listing page"). Still provide placeholder values for the other required fields.

If the page IS suitable, set "unsuitable" to false and "unsuitableReason" to an empty string, then analyze the HTML and identify the repeating pattern of content items.

Example: for a page with <ul class="PostList-module__abc123__list"><li class="PostList-module__abc123__item"><a href="/post/1"><span>Title</span><time>Jan 1</time></a></li>...</ul>, the output should be:
{"unsuitable":false,"unsuitableReason":"","feed":{"title":"My Blog"},"itemSelector":"[class*='PostList'][class*='list'] > li","fields":{"title":{"selector":"span"},"link":{"selector":"a","attr":"href"},"pubDate":{"selector":"time"}}}

Additionally, assess whether this page would be suitable for CHANGE MONITORING. A page is suitable for change monitoring if and only if it has a main content area that is likely to be updated over time (e.g., an updates/changelog page, a status page, a blog post that gets edited). Even if the page has no repeating items, it may still be suitable for change monitoring.

Set "snapshotSuitable" to true if and only if the page is suitable for change monitoring. If true, set "contentSelector" to a CSS selector targeting the main content area (excluding nav, header, footer, sidebar), and "suggestedTitle" to a descriptive feed title. If false, set "contentSelector" and "suggestedTitle" to empty strings. Pages like login forms, static landing pages, web stores, or pages with no meaningful content to track should NOT be marked as snapshot-suitable.

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

/**
 * Remove keys with null values from the AI response so that
 * validateParserConfig treats them as absent optional fields.
 */
function stripNullFields(obj: unknown): void {
  if (typeof obj !== "object" || obj === null) return;
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (record[key] === null) {
      delete record[key];
    } else if (typeof record[key] === "object" && record[key] !== null) {
      stripNullFields(record[key]);
    }
  }
}

export async function generateParserConfig(
  trimmedHtml: string,
  url: string,
  apiKey: string,
  model: string,
  priorMessages?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<AiParserResult> {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in environment");

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://rss-o-matic.com",
      "X-Title": "RSS-O-Matic",
    },
    posthog: usePostHogClient(),
  });

  const prompt = buildPrompt(trimmedHtml, url);
  logger.info(
    { url, model, promptChars: prompt.length },
    "Sending request to LLM"
  );
  const start = Date.now();

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: prompt },
    ...(priorMessages ?? []),
  ];

  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature: 0,
    max_tokens: 4000,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "parser_config",
        strict: true,
        schema: PARSER_CONFIG_SCHEMA,
      },
    },
    // OpenRouter-specific
    provider: { require_parameters: true },
    // PostHog LLM analytics
    posthogDistinctId: "rss-o-matic-server",
    posthogCaptureImmediate: true,
    posthogProperties: { url },
  } as Parameters<typeof client.chat.completions.create>[0] & {
    provider: { require_parameters: boolean };
  });

  const content = (completion as ChatCompletion).choices?.[0]?.message?.content;
  if (!content) {
    logger.error({ data: JSON.stringify(completion) }, "Empty AI response");
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

  // Strip null values from nullable schema fields before validation.
  // Strict-mode JSON schemas require all properties but use anyOf with null
  // to represent optional fields. Remove those nulls so validateParserConfig
  // sees undefined instead.
  stripNullFields(parsed);

  const raw = parsed as Record<string, unknown>;
  if (raw.unsuitable === true && typeof raw.unsuitableReason === "string") {
    return {
      unsuitable: true,
      reason: raw.unsuitableReason,
      snapshotSuitable: raw.snapshotSuitable === true,
      contentSelector:
        typeof raw.contentSelector === "string" && raw.contentSelector
          ? raw.contentSelector
          : undefined,
      suggestedTitle:
        typeof raw.suggestedTitle === "string" && raw.suggestedTitle
          ? raw.suggestedTitle
          : undefined,
    };
  }

  return {
    unsuitable: false,
    config: validateParserConfig(parsed),
    snapshotSuitable: raw.snapshotSuitable === true,
    contentSelector:
      typeof raw.contentSelector === "string" && raw.contentSelector
        ? raw.contentSelector
        : undefined,
    suggestedTitle:
      typeof raw.suggestedTitle === "string" && raw.suggestedTitle
        ? raw.suggestedTitle
        : undefined,
  };
}
