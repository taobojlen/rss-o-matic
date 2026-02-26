import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate, MockOpenAI } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const MockOpenAI = vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: mockCreate } } };
  });
  return { mockCreate, MockOpenAI };
});

// Mock consola to suppress logging during tests
vi.mock("consola", () => ({
  consola: {
    withTag: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Mock PostHog client utility (imported via relative path in ai.ts)
vi.mock("../../server/utils/posthog", () => ({
  usePostHogClient: vi.fn().mockReturnValue({
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock @posthog/ai/openai
vi.mock("@posthog/ai/openai", () => ({
  OpenAI: MockOpenAI,
}));

import { generateParserConfig, executeTestSelector } from "~/server/utils/ai";

const VALID_CONFIG = {
  unsuitable: false,
  unsuitableReason: "",
  snapshotSuitable: false,
  contentSelector: "",
  suggestedTitle: "",
  itemSelector: ".item",
  feed: { title: "Feed" },
  fields: {
    title: { selector: "h2" },
    link: { selector: "a", attr: "href" },
  },
};

describe("generateParserConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed config on successful API response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    const result = await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "test-key",
      "test-model"
    );
    expect(result.unsuitable).toBe(false);
    if (!result.unsuitable) {
      expect(result.config.itemSelector).toBe(".item");
      expect(result.config.fields.title.selector).toBe("h2");
    }
  });

  it("throws when API key is empty", async () => {
    await expect(
      generateParserConfig("<html></html>", "https://example.com", "", "model")
    ).rejects.toThrow("OPENROUTER_API_KEY");
  });

  it("throws on API error", async () => {
    mockCreate.mockRejectedValue(new Error("429 Rate limited"));

    await expect(
      generateParserConfig(
        "<html></html>",
        "https://example.com",
        "key",
        "model"
      )
    ).rejects.toThrow("429");
  });

  it("throws on empty AI response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "" } }],
    });

    await expect(
      generateParserConfig(
        "<html></html>",
        "https://example.com",
        "key",
        "model"
      )
    ).rejects.toThrow("Empty response from AI");
  });

  it("throws on missing choices", async () => {
    mockCreate.mockResolvedValue({});

    await expect(
      generateParserConfig(
        "<html></html>",
        "https://example.com",
        "key",
        "model"
      )
    ).rejects.toThrow("Empty response from AI");
  });

  it("throws on invalid JSON in AI response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "not json {{{" } }],
    });

    await expect(
      generateParserConfig(
        "<html></html>",
        "https://example.com",
        "key",
        "model"
      )
    ).rejects.toThrow("invalid JSON");
  });

  it("throws when AI returns invalid config shape", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ bad: true }) } }],
    });

    await expect(
      generateParserConfig(
        "<html></html>",
        "https://example.com",
        "key",
        "model"
      )
    ).rejects.toThrow();
  });

  it("creates OpenAI client with OpenRouter config", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "my-api-key",
      "my-model"
    );

    expect(MockOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "my-api-key",
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: expect.objectContaining({
          "HTTP-Referer": "https://rss-o-matic.com",
          "X-Title": "RSS-O-Matic",
        }),
      })
    );
  });

  it("passes correct params to chat.completions.create", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "my-api-key",
      "my-model"
    );

    const params = mockCreate.mock.calls[0][0];
    expect(params.model).toBe("my-model");
    expect(params.temperature).toBe(0);
    expect(params.max_tokens).toBe(4000);
    expect(params.provider).toEqual({ require_parameters: true });
    expect(params.response_format.type).toBe("json_schema");
  });

  it("returns unsuitable result when AI flags page", async () => {
    const unsuitableResponse = {
      unsuitable: true,
      unsuitableReason: "This appears to be a single blog post, not a listing page",
      snapshotSuitable: false,
      contentSelector: "",
      suggestedTitle: "",
      feed: { title: "Placeholder" },
      itemSelector: "div",
      fields: {
        title: { selector: "h1" },
        link: { selector: "a", attr: "href" },
      },
    };
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(unsuitableResponse) } }],
    });

    const result = await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "key",
      "model"
    );
    expect(result.unsuitable).toBe(true);
    if (result.unsuitable) {
      expect(result.reason).toBe(
        "This appears to be a single blog post, not a listing page"
      );
      expect(result.snapshotSuitable).toBe(false);
    }
  });

  it("returns snapshot suitability info when page is unsuitable but monitorable", async () => {
    const unsuitableButMonitorable = {
      unsuitable: true,
      unsuitableReason: "This is a single updates page, not a listing",
      snapshotSuitable: true,
      contentSelector: "main",
      suggestedTitle: "Site Updates",
      feed: { title: "Placeholder" },
      itemSelector: "div",
      fields: {
        title: { selector: "h1" },
        link: { selector: "a", attr: "href" },
      },
    };
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(unsuitableButMonitorable) } }],
    });

    const result = await generateParserConfig(
      "<html></html>",
      "https://example.com/updates",
      "key",
      "model"
    );
    expect(result.unsuitable).toBe(true);
    if (result.unsuitable) {
      expect(result.snapshotSuitable).toBe(true);
      expect(result.contentSelector).toBe("main");
      expect(result.suggestedTitle).toBe("Site Updates");
    }
  });

  it("includes the URL in the prompt", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    await generateParserConfig(
      "<html></html>",
      "https://example.com/blog",
      "key",
      "model"
    );

    const params = mockCreate.mock.calls[0][0];
    expect(params.messages[0].content).toContain("https://example.com/blog");
  });

  it("sends single user message as the initial prompt", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "key",
      "model"
    );

    const params = mockCreate.mock.calls[0][0];
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
  });

  it("schema has no oneOf keyword", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "key",
      "model"
    );

    const params = mockCreate.mock.calls[0][0];
    const schema = params.response_format.json_schema.schema;
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).not.toContain('"oneOf"');
  });

  it("strips null optional fields from AI response", async () => {
    const responseWithNulls = {
      unsuitable: false,
      unsuitableReason: "",
      snapshotSuitable: false,
      contentSelector: "",
      suggestedTitle: "",
      feed: {
        title: "My Blog",
        description: null,
        link: null,
      },
      itemSelector: ".item",
      fields: {
        title: { selector: "h2", attr: null, html: null },
        link: { selector: "a", attr: "href", html: null },
        description: null,
        pubDate: null,
        author: null,
        category: null,
        image: null,
      },
    };
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(responseWithNulls) } }],
    });

    const result = await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "key",
      "model"
    );

    expect(result.unsuitable).toBe(false);
    if (!result.unsuitable) {
      expect(result.config.feed.title).toBe("My Blog");
      expect(result.config.feed.description).toBeUndefined();
      expect(result.config.feed.link).toBeUndefined();
      expect(result.config.fields.title).toEqual({ selector: "h2" });
      expect(result.config.fields.link).toEqual({ selector: "a", attr: "href" });
      expect(result.config.fields.description).toBeUndefined();
      expect(result.config.fields.pubDate).toBeUndefined();
    }
  });

  it("includes tools in the first API call", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "key",
      "model"
    );

    const params = mockCreate.mock.calls[0][0];
    expect(params.tools).toBeDefined();
    expect(params.tools).toHaveLength(1);
    expect(params.tools[0].function.name).toBe("test_selector");
  });

  it("executes tool calls and continues the loop", async () => {
    // First call: model returns a tool call
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: {
              name: "test_selector",
              arguments: JSON.stringify({ selector: ".item", context_selector: null, attr: null }),
            },
          }],
        },
      }],
    });
    // Second call: model returns text config
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    const result = await generateParserConfig(
      '<div class="item"><h2>Title</h2><a href="/1">Link</a></div>',
      "https://example.com",
      "key",
      "model"
    );

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.unsuitable).toBe(false);
    // Second call should include the tool result message
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolMsg = secondCallMessages.find((m: any) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg.tool_call_id).toBe("call_1");
  });

  it("omits tools on the final iteration to force text output", async () => {
    // First two calls return tool calls (iterations 0 and 1 of MAX_ITERATIONS=3)
    for (let i = 0; i < 2; i++) {
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: `call_${i}`,
              type: "function",
              function: {
                name: "test_selector",
                arguments: JSON.stringify({ selector: ".item", context_selector: null, attr: null }),
              },
            }],
          },
        }],
      });
    }
    // Third call (final iteration): model returns text
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    await generateParserConfig(
      '<div class="item"><h2>T</h2><a href="/1">L</a></div>',
      "https://example.com",
      "key",
      "model"
    );

    expect(mockCreate).toHaveBeenCalledTimes(3);
    // First two calls should have tools
    expect(mockCreate.mock.calls[0][0].tools).toBeDefined();
    expect(mockCreate.mock.calls[1][0].tools).toBeDefined();
    // Third call (last iteration) should NOT have tools
    expect(mockCreate.mock.calls[2][0].tools).toBeUndefined();
  });

  it("returns immediately when model responds with text (no tool calls)", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    const result = await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "key",
      "model"
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.unsuitable).toBe(false);
  });

  it("prompt mentions the test_selector tool", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "key",
      "model"
    );

    const params = mockCreate.mock.calls[0][0];
    expect(params.messages[0].content).toContain("test_selector");
  });

  it("passes PostHog tracking params", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "key",
      "model"
    );

    const params = mockCreate.mock.calls[0][0];
    expect(params.posthogDistinctId).toBe("rss-o-matic-server");
    expect(params.posthogCaptureImmediate).toBe(true);
    expect(params.posthogProperties).toEqual({ url: "https://example.com" });
  });
});

describe("executeTestSelector", () => {
  const TEST_HTML = `
    <div class="list">
      <div class="item">
        <h2>Title One</h2>
        <a href="/post/1">Read more</a>
        <p>Description one</p>
      </div>
      <div class="item">
        <h2>Title Two</h2>
        <a href="/post/2">Read more</a>
        <p>Description two</p>
      </div>
      <div class="item">
        <h2>Title Three</h2>
        <a href="/post/3">Read more</a>
        <p>Description three</p>
      </div>
      <div class="item">
        <h2>Title Four</h2>
        <a href="/post/4">Read more</a>
        <p>Description four</p>
      </div>
    </div>
  `;

  it("returns match count and outerHTML samples for standalone selector", () => {
    const result = JSON.parse(executeTestSelector(TEST_HTML, {
      selector: ".item",
      context_selector: null,
      attr: null,
    }));
    expect(result.matchCount).toBe(4);
    expect(result.samples).toHaveLength(3); // capped at 3
    expect(result.samples[0]).toContain("Title One");
  });

  it("returns context matches and extracted text for context selector", () => {
    const result = JSON.parse(executeTestSelector(TEST_HTML, {
      selector: "h2",
      context_selector: ".item",
      attr: null,
    }));
    expect(result.contextMatches).toBe(4);
    expect(result.fieldFound).toBe("3/3");
    expect(result.samples).toContain("Title One");
    expect(result.samples).toContain("Title Two");
    expect(result.samples).toContain("Title Three");
  });

  it("extracts attribute values when attr is specified", () => {
    const result = JSON.parse(executeTestSelector(TEST_HTML, {
      selector: "a",
      context_selector: ".item",
      attr: "href",
    }));
    expect(result.contextMatches).toBe(4);
    expect(result.samples).toContain("/post/1");
    expect(result.samples).toContain("/post/2");
  });

  it("returns error for invalid CSS selector", () => {
    const result = JSON.parse(executeTestSelector(TEST_HTML, {
      selector: "[[[invalid",
      context_selector: null,
      attr: null,
    }));
    expect(result.error).toBeDefined();
  });

  it("truncates long outerHTML samples to 300 chars", () => {
    const longHtml = `<div class="item">${"x".repeat(500)}</div>`;
    const result = JSON.parse(executeTestSelector(longHtml, {
      selector: ".item",
      context_selector: null,
      attr: null,
    }));
    expect(result.samples[0].length).toBeLessThanOrEqual(300);
  });

  it("returns 0 matches for non-matching selector", () => {
    const result = JSON.parse(executeTestSelector(TEST_HTML, {
      selector: ".nonexistent",
      context_selector: null,
      attr: null,
    }));
    expect(result.matchCount).toBe(0);
    expect(result.samples).toHaveLength(0);
  });

  it("reports not-found for context fields that don't match", () => {
    const result = JSON.parse(executeTestSelector(TEST_HTML, {
      selector: ".nope",
      context_selector: ".item",
      attr: null,
    }));
    expect(result.contextMatches).toBe(4);
    expect(result.fieldFound).toBe("0/3");
    expect(result.samples).toEqual(["(not found)", "(not found)", "(not found)"]);
  });
});
