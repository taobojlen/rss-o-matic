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
    expect(result.itemSelector).toBe(".item");
    expect(result.fields.title.selector).toBe("h2");
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
