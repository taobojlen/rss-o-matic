import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateParserConfig } from "~/server/utils/ai";

// Mock consola to suppress logging during tests
vi.mock("consola", () => ({
  consola: {
    withTag: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

const VALID_CONFIG = {
  itemSelector: ".item",
  feed: { title: "Feed" },
  fields: {
    title: { selector: "h2" },
    link: { selector: "a", attr: "href" },
  },
};

function mockFetchResponse(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("generateParserConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed config on successful API response", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
      })
    );

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

  it("throws on non-ok HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      })
    );

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
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        choices: [{ message: { content: "" } }],
      })
    );

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
    vi.stubGlobal("fetch", mockFetchResponse({}));

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
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        choices: [{ message: { content: "not json {{{" } }],
      })
    );

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
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        choices: [{ message: { content: JSON.stringify({ bad: true }) } }],
      })
    );

    await expect(
      generateParserConfig(
        "<html></html>",
        "https://example.com",
        "key",
        "model"
      )
    ).rejects.toThrow();
  });

  it("sends correct headers to OpenRouter", async () => {
    const mockFn = mockFetchResponse({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });
    vi.stubGlobal("fetch", mockFn);

    await generateParserConfig(
      "<html></html>",
      "https://example.com",
      "my-api-key",
      "my-model"
    );

    const [url, options] = mockFn.mock.calls[0];
    expect(url).toContain("openrouter.ai");
    expect(options.headers.Authorization).toBe("Bearer my-api-key");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body).model).toBe("my-model");
  });

  it("includes the URL in the prompt body", async () => {
    const mockFn = mockFetchResponse({
      choices: [{ message: { content: JSON.stringify(VALID_CONFIG) } }],
    });
    vi.stubGlobal("fetch", mockFn);

    await generateParserConfig(
      "<html></html>",
      "https://example.com/blog",
      "key",
      "model"
    );

    const body = JSON.parse(mockFn.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("https://example.com/blog");
  });
});
