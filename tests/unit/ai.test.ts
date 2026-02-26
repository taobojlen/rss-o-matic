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

import { generateParserConfig } from "~/server/utils/ai";

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

  it("appends priorMessages after the initial prompt", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });

    const priorMessages = [
      { role: "assistant" as const, content: '{"itemSelector":".bad"}' },
      { role: "user" as const, content: "That didn't work, try again." },
    ];

    await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "key",
      "model",
      priorMessages
    );

    const params = mockCreate.mock.calls[0][0];
    expect(params.messages).toHaveLength(3);
    expect(params.messages[0].role).toBe("user");
    expect(params.messages[0].content).toContain("https://example.com");
    expect(params.messages[1]).toEqual({ role: "assistant", content: '{"itemSelector":".bad"}' });
    expect(params.messages[2]).toEqual({ role: "user", content: "That didn't work, try again." });
  });

  it("sends single message when no priorMessages", async () => {
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
