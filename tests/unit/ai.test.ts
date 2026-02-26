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

import { generateParserConfig, executeTestSelector, findFragileSelectors } from "~/server/utils/ai";

/**
 * Create an async-iterable mock that simulates OpenAI streaming chunks.
 * Each entry in `chunks` becomes one yielded value.
 */
function mockStreamResponse(
  chunks: Array<{
    content?: string;
    reasoning?: string;
    reasoning_details?: Array<Record<string, unknown>>;
    tool_calls?: Array<{
      index: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }>;
  }>
) {
  async function* generate() {
    for (const chunk of chunks) {
      yield {
        choices: [
          {
            delta: {
              content: chunk.content ?? null,
              reasoning: chunk.reasoning ?? null,
              reasoning_details: chunk.reasoning_details,
              tool_calls: chunk.tool_calls,
            },
          },
        ],
      };
    }
  }
  return generate();
}

/** Shorthand: create a stream that yields a single text content chunk. */
function mockTextStream(json: string) {
  return mockStreamResponse([{ content: json }]);
}

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

/** HTML that contains elements matching VALID_CONFIG's .item selector */
const HTML_WITH_ITEMS = '<html><body><div class="item"><h2>Title</h2><a href="/1">Link</a></div><div class="item"><h2>Title 2</h2><a href="/2">Link</a></div></body></html>';

describe("generateParserConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed config on successful API response", async () => {
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(VALID_CONFIG)));

    const result = await generateParserConfig(
      HTML_WITH_ITEMS,
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
    mockCreate.mockReturnValue(mockStreamResponse([]));

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
    mockCreate.mockReturnValue(mockStreamResponse([]));

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
    // Provide a fresh stream for each iteration (the code retries on validation errors)
    for (let i = 0; i < 3; i++) {
      mockCreate.mockReturnValueOnce(mockTextStream("not json {{{"));
    }

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
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify({ bad: true })));

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
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(VALID_CONFIG)));

    await generateParserConfig(
      HTML_WITH_ITEMS,
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
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(VALID_CONFIG)));

    await generateParserConfig(
      HTML_WITH_ITEMS,
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
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(unsuitableResponse)));

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
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(unsuitableButMonitorable)));

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
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(VALID_CONFIG)));

    await generateParserConfig(
      HTML_WITH_ITEMS,
      "https://example.com/blog",
      "key",
      "model"
    );

    const params = mockCreate.mock.calls[0][0];
    expect(params.messages[0].content).toContain("https://example.com/blog");
  });

  it("sends single user message as the initial prompt", async () => {
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(VALID_CONFIG)));

    await generateParserConfig(
      HTML_WITH_ITEMS,
      "https://example.com",
      "key",
      "model"
    );

    const params = mockCreate.mock.calls[0][0];
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
  });

  it("schema has no oneOf keyword", async () => {
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(VALID_CONFIG)));

    await generateParserConfig(
      HTML_WITH_ITEMS,
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
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(responseWithNulls)));

    const result = await generateParserConfig(
      HTML_WITH_ITEMS,
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
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(VALID_CONFIG)));

    await generateParserConfig(
      HTML_WITH_ITEMS,
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
    const toolArgs = JSON.stringify({ selector: ".item", context_selector: null, attr: null });
    mockCreate.mockReturnValueOnce(
      mockStreamResponse([
        { tool_calls: [{ index: 0, id: "call_1", function: { name: "test_selector", arguments: toolArgs } }] },
      ])
    );
    // Second call: model returns text config
    mockCreate.mockReturnValueOnce(mockTextStream(JSON.stringify(VALID_CONFIG)));

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
    const toolArgs = JSON.stringify({ selector: ".item", context_selector: null, attr: null });
    for (let i = 0; i < 2; i++) {
      mockCreate.mockReturnValueOnce(
        mockStreamResponse([
          { tool_calls: [{ index: 0, id: `call_${i}`, function: { name: "test_selector", arguments: toolArgs } }] },
        ])
      );
    }
    // Third call (final iteration): model returns text
    mockCreate.mockReturnValueOnce(mockTextStream(JSON.stringify(VALID_CONFIG)));

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
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(VALID_CONFIG)));

    const result = await generateParserConfig(
      HTML_WITH_ITEMS,
      "https://example.com",
      "key",
      "model"
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.unsuitable).toBe(false);
  });

  it("retries with feedback when config validation fails on non-last iteration", async () => {
    const invalidConfig = {
      ...VALID_CONFIG,
      itemSelector: "", // empty = invalid
    };

    // First call: returns invalid config
    mockCreate.mockReturnValueOnce(mockTextStream(JSON.stringify(invalidConfig)));
    // Second call: returns valid config
    mockCreate.mockReturnValueOnce(mockTextStream(JSON.stringify(VALID_CONFIG)));

    const result = await generateParserConfig(
      HTML_WITH_ITEMS,
      "https://example.com",
      "key",
      "model"
    );

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.unsuitable).toBe(false);
    if (!result.unsuitable) {
      expect(result.config.itemSelector).toBe(".item");
    }

    // Second call should include the validation error feedback
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const userFeedback = secondCallMessages.find(
      (m: any) => m.role === "user" && m.content?.includes("invalid")
    );
    expect(userFeedback).toBeDefined();
    expect(userFeedback.content).toContain("itemSelector");
  });

  it("retries with feedback when itemSelector matches zero elements on non-last iteration", async () => {
    const badConfig = {
      ...VALID_CONFIG,
      itemSelector: ".nonexistent", // won't match anything in the HTML
    };

    // First call: returns config with non-matching selector
    mockCreate.mockReturnValueOnce(mockTextStream(JSON.stringify(badConfig)));
    // Second call: returns config with matching selector
    mockCreate.mockReturnValueOnce(mockTextStream(JSON.stringify(VALID_CONFIG)));

    const html = '<div class="item"><h2>Title</h2><a href="/1">Link</a></div>';
    const result = await generateParserConfig(
      html,
      "https://example.com",
      "key",
      "model"
    );

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.unsuitable).toBe(false);
    if (!result.unsuitable) {
      expect(result.config.itemSelector).toBe(".item");
    }

    // Second call should include feedback about zero matches
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const userFeedback = secondCallMessages.find(
      (m: any) => m.role === "user" && m.content?.includes("0 elements")
    );
    expect(userFeedback).toBeDefined();
    expect(userFeedback.content).toContain(".nonexistent");
  });

  it("retries with feedback when itemSelector matches zero elements (streaming)", async () => {
    const badConfig = {
      ...VALID_CONFIG,
      itemSelector: ".nonexistent",
    };

    // First call: streaming, returns config with non-matching selector
    mockCreate.mockReturnValueOnce(
      mockStreamResponse([{ content: JSON.stringify(badConfig) }])
    );
    // Second call: streaming, returns config with matching selector
    mockCreate.mockReturnValueOnce(
      mockStreamResponse([{ content: JSON.stringify(VALID_CONFIG) }])
    );

    const html = '<div class="item"><h2>Title</h2><a href="/1">Link</a></div>';
    const events: Array<{ event: string; data: unknown }> = [];
    const result = await generateParserConfig(
      html,
      "https://example.com",
      "key",
      "model",
      (evt) => events.push(evt)
    );

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.unsuitable).toBe(false);
    if (!result.unsuitable) {
      expect(result.config.itemSelector).toBe(".item");
    }

    // Second call should include feedback about zero matches
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const userFeedback = secondCallMessages.find(
      (m: any) => m.role === "user" && m.content?.includes("0 elements")
    );
    expect(userFeedback).toBeDefined();
  });

  it("retries with feedback when selectors contain fragile hashed class names", async () => {
    const fragileConfig = {
      ...VALID_CONFIG,
      itemSelector: "ul.PublicationList-module-scss-module__KxYrHG__list > li",
      fields: {
        ...VALID_CONFIG.fields,
        title: { selector: "span.PostCard-module__a1b2c3__title" },
      },
    };

    // First call: returns config with fragile selectors
    mockCreate.mockReturnValueOnce(mockTextStream(JSON.stringify(fragileConfig)));
    // Second call: returns good config
    mockCreate.mockReturnValueOnce(mockTextStream(JSON.stringify(VALID_CONFIG)));

    const result = await generateParserConfig(
      HTML_WITH_ITEMS,
      "https://example.com",
      "key",
      "model"
    );

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.unsuitable).toBe(false);

    // Second call should include feedback about fragile selectors
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const userFeedback = secondCallMessages.find(
      (m: any) => m.role === "user" && m.content?.includes("fragile")
    );
    expect(userFeedback).toBeDefined();
    expect(userFeedback.content).toContain("PublicationList-module-scss-module__KxYrHG__list");
  });

  it("accepts config when itemSelector matches elements", async () => {
    // Config whose itemSelector DOES match the provided HTML
    mockCreate.mockReturnValueOnce(mockTextStream(JSON.stringify(VALID_CONFIG)));

    const html = '<div class="item"><h2>Title</h2><a href="/1">Link</a></div>';
    const result = await generateParserConfig(
      html,
      "https://example.com",
      "key",
      "model"
    );

    // Should accept on first try — no retry needed
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.unsuitable).toBe(false);
  });

  it("throws on last iteration if config is still invalid", async () => {
    const invalidConfig = {
      ...VALID_CONFIG,
      itemSelector: "", // empty = invalid
    };

    // All 3 iterations return invalid config
    for (let i = 0; i < 3; i++) {
      mockCreate.mockReturnValueOnce(mockTextStream(JSON.stringify(invalidConfig)));
    }

    await expect(
      generateParserConfig(
        "<html></html>",
        "https://example.com",
        "key",
        "model"
      )
    ).rejects.toThrow("itemSelector");

    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("prompt mentions the test_selector tool", async () => {
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(VALID_CONFIG)));

    await generateParserConfig(
      HTML_WITH_ITEMS,
      "https://example.com",
      "key",
      "model"
    );

    const params = mockCreate.mock.calls[0][0];
    expect(params.messages[0].content).toContain("test_selector");
  });

  it("passes PostHog tracking params", async () => {
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(VALID_CONFIG)));

    await generateParserConfig(
      HTML_WITH_ITEMS,
      "https://example.com",
      "key",
      "model"
    );

    const params = mockCreate.mock.calls[0][0];
    expect(params.posthogDistinctId).toBe("rss-o-matic-server");
    expect(params.posthogCaptureImmediate).toBe(true);
    expect(params.posthogProperties).toEqual({ url: "https://example.com" });
  });

  it("emits analyze status event before each iteration", async () => {
    const json = JSON.stringify(VALID_CONFIG);
    mockCreate.mockReturnValue(
      mockStreamResponse([{ content: json }])
    );

    const events: Array<{ event: string; data: unknown }> = [];
    await generateParserConfig(
      HTML_WITH_ITEMS,
      "https://example.com",
      "key",
      "model",
      (evt) => events.push(evt)
    );

    const statusEvents = events.filter((e) => e.event === "status");
    expect(statusEvents.length).toBeGreaterThanOrEqual(1);
    expect(statusEvents[0].data).toEqual({
      phase: "analyze",
      iteration: 1,
      maxIterations: 3,
    });

    // Should enable streaming and reasoning when onEvent is provided
    const params = mockCreate.mock.calls[0][0];
    expect(params.stream).toBe(true);
    expect(params.reasoning).toEqual({ enabled: true });
  });

  it("emits tool_call and tool_result events during tool use", async () => {
    const toolArgs = JSON.stringify({ selector: ".item", context_selector: null, attr: null });
    // First call: streaming tool call
    mockCreate.mockReturnValueOnce(
      mockStreamResponse([
        { tool_calls: [{ index: 0, id: "call_1", function: { name: "test_selector", arguments: toolArgs } }] },
      ])
    );
    // Second call: streaming text response
    mockCreate.mockReturnValueOnce(
      mockStreamResponse([{ content: JSON.stringify(VALID_CONFIG) }])
    );

    const events: Array<{ event: string; data: unknown }> = [];
    await generateParserConfig(
      '<div class="item"><h2>Title</h2><a href="/1">Link</a></div>',
      "https://example.com",
      "key",
      "model",
      (evt) => events.push(evt)
    );

    const toolCallEvents = events.filter((e) => e.event === "tool_call");
    expect(toolCallEvents).toHaveLength(1);
    expect(toolCallEvents[0].data).toEqual({
      selector: ".item",
      contextSelector: null,
      attr: null,
    });

    const toolResultEvents = events.filter((e) => e.event === "tool_result");
    expect(toolResultEvents).toHaveLength(1);
    expect((toolResultEvents[0].data as any).matchCount).toBe(1);
  });

  it("emits ai_text events from reasoning tokens, not content", async () => {
    const json = JSON.stringify(VALID_CONFIG);
    // Reasoning tokens stream the model's thinking; content is the JSON (not streamed to user)
    mockCreate.mockReturnValue(
      mockStreamResponse([
        { reasoning: "Let me analyze" },
        { reasoning: " the page structure." },
        { content: json },
      ])
    );

    const events: Array<{ event: string; data: unknown }> = [];
    await generateParserConfig(
      HTML_WITH_ITEMS,
      "https://example.com",
      "key",
      "model",
      (evt) => events.push(evt)
    );

    const aiTextEvents = events.filter((e) => e.event === "ai_text");
    expect(aiTextEvents).toHaveLength(2);
    const combined = aiTextEvents.map((e) => (e.data as any).text).join("");
    expect(combined).toBe("Let me analyze the page structure.");
  });

  it("preserves reasoning_details in assistant messages across tool-calling turns", async () => {
    const toolArgs = JSON.stringify({ selector: ".item", context_selector: null, attr: null });
    const reasoningDetail = { type: "reasoning.text", text: "Let me test selectors", id: "r1", format: "anthropic-claude-v1" };

    // First call: streaming with reasoning_details + tool call
    mockCreate.mockReturnValueOnce(
      mockStreamResponse([
        { reasoning: "Let me test selectors", reasoning_details: [reasoningDetail] },
        { tool_calls: [{ index: 0, id: "call_1", function: { name: "test_selector", arguments: toolArgs } }] },
      ])
    );
    // Second call: streaming text response
    mockCreate.mockReturnValueOnce(
      mockStreamResponse([{ content: JSON.stringify(VALID_CONFIG) }])
    );

    await generateParserConfig(
      '<div class="item"><h2>Title</h2><a href="/1">Link</a></div>',
      "https://example.com",
      "key",
      "model",
      () => {}
    );

    // The second call's messages should include the assistant message with reasoning_details
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const assistantMsg = secondCallMessages.find((m: any) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.reasoning_details).toEqual([reasoningDetail]);
  });

  it("works without onEvent callback (backward compatible)", async () => {
    mockCreate.mockReturnValue(mockTextStream(JSON.stringify(VALID_CONFIG)));

    const result = await generateParserConfig(
      HTML_WITH_ITEMS,
      "https://example.com",
      "key",
      "model"
      // no onEvent callback
    );

    expect(result.unsuitable).toBe(false);
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
