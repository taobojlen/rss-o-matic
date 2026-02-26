import { OpenAI } from "@posthog/ai/openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { consola } from "consola";
import * as cheerio from "cheerio";
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

const MAX_TOOL_ITERATIONS = 3;

const TEST_SELECTOR_TOOL = {
  type: "function" as const,
  function: {
    name: "test_selector",
    description: "Test a CSS selector against the page HTML. Returns match count and sample content. Use context_selector to test a field selector within matched items.",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector to test" },
        context_selector: {
          type: ["string", "null"] as const,
          description: "If provided, find elements matching this first, then apply selector within each. Use this to test field selectors within items.",
        },
        attr: {
          type: ["string", "null"] as const,
          description: "If provided, extract this attribute instead of text content (e.g. 'href', 'src').",
        },
      },
      required: ["selector", "context_selector", "attr"],
      additionalProperties: false,
    },
    strict: true,
  },
};

interface TestSelectorArgs {
  selector: string;
  context_selector: string | null;
  attr: string | null;
}

export function executeTestSelector(
  html: string,
  args: TestSelectorArgs
): string {
  try {
    const $ = cheerio.load(html);

    if (args.context_selector) {
      const contexts = $(args.context_selector);
      const total = contexts.length;
      const samples: string[] = [];
      contexts.slice(0, 3).each((_, el) => {
        const target = $(el).find(args.selector).first();
        if (!target.length) {
          samples.push("(not found)");
          return;
        }
        const value = args.attr
          ? target.attr(args.attr)
          : target.text();
        samples.push(value?.trim()?.slice(0, 200) ?? "(empty)");
      });
      const found = samples.filter((s) => s !== "(not found)").length;
      return JSON.stringify({
        contextMatches: total,
        fieldFound: `${found}/${Math.min(total, 3)}`,
        samples,
      });
    }

    const matches = $(args.selector);
    const samples: string[] = [];
    matches.slice(0, 3).each((_, el) => {
      const outer = $.html(el) ?? "";
      samples.push(outer.slice(0, 300));
    });
    return JSON.stringify({ matchCount: matches.length, samples });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function buildPrompt(trimmedHtml: string, url: string): string {
  return `You are an expert web scraper. Given the HTML of a web page, produce a JSON configuration that describes how to extract an RSS-like feed of items from the page.

The page URL is: ${url}

You have access to a test_selector tool that lets you test CSS selectors against the page HTML before committing to your final configuration. You have a maximum of ${MAX_TOOL_ITERATIONS} turns total (including tool calls and your final response), so be efficient.

Recommended workflow:
1. Test your candidate itemSelector to confirm it matches multiple elements.
2. Test key field selectors (title, link) within the item context.
3. Once confident, respond with your final JSON configuration (no tool calls).

If the page is clearly unsuitable (login page, error page, etc.), respond immediately with your JSON — no tool calls needed.

If you determine the page is unsuitable for a repeating-item feed but suitable for snapshot/change monitoring, use the tool to verify your contentSelector matches a meaningful content block before responding.

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

function parseAiTextResponse(content: string): AiParserResult {
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

export async function generateParserConfig(
  trimmedHtml: string,
  url: string,
  apiKey: string,
  model: string
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

  const messages: Array<Record<string, unknown>> = [
    { role: "user", content: prompt },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const isLastIteration = iteration === MAX_TOOL_ITERATIONS - 1;

    const params: Record<string, unknown> = {
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
      provider: { require_parameters: true },
      posthogDistinctId: "rss-o-matic-server",
      posthogCaptureImmediate: true,
      posthogProperties: { url },
    };

    // Include tools on all iterations except the last, where we force a text response.
    if (!isLastIteration) {
      params.tools = [TEST_SELECTOR_TOOL];
      params.tool_choice = "auto";
      params.parallel_tool_calls = false;
    }

    const completion = await client.chat.completions.create(
      params as unknown as Parameters<typeof client.chat.completions.create>[0]
    );

    const message = (completion as ChatCompletion).choices?.[0]?.message;
    if (!message) {
      logger.error({ data: JSON.stringify(completion) }, "Empty AI response");
      throw new Error("Empty response from AI");
    }

    // If the model made tool calls, execute them and continue the loop.
    const toolCalls = message.tool_calls as
      | Array<{ id: string; function: { name: string; arguments: string } }>
      | undefined;

    if (toolCalls && toolCalls.length > 0) {
      // Append the assistant message (with tool_calls) to conversation
      messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: toolCalls,
      });

      // Execute each tool call and append results
      for (const toolCall of toolCalls) {
        const args = JSON.parse(toolCall.function.arguments) as TestSelectorArgs;
        logger.info(
          { url, tool: toolCall.function.name, selector: args.selector, iteration },
          "Executing tool call"
        );
        const result = executeTestSelector(trimmedHtml, args);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }
      continue;
    }

    // Model returned a text response — parse and return.
    const content = message.content;
    if (!content) {
      logger.error({ data: JSON.stringify(completion) }, "Empty AI response");
      throw new Error("Empty response from AI");
    }

    const durationMs = Date.now() - start;
    logger.info(
      { url, model, durationMs, responseChars: content.length, iterations: iteration + 1 },
      "LLM response received"
    );

    return parseAiTextResponse(content);
  }

  // Should not reach here — the last iteration forces a text response.
  throw new Error("Agentic loop exhausted without producing a result");
}
