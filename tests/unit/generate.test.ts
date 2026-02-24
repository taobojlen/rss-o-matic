import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all auto-imported server utilities
const mockGetFeedByUrl = vi.fn();
const mockFetchPage = vi.fn();
const mockTrimHtml = vi.fn();
const mockGenerateParserConfig = vi.fn();
const mockParseHtml = vi.fn();
const mockSaveFeed = vi.fn();
const mockGetCachedPreview = vi.fn();
const mockSetCachedPreview = vi.fn();
const mockNormalizeUrl = vi.fn((url: string) => url);
const mockCreateError = vi.fn((opts: any) => {
  const err = new Error(opts.statusMessage) as any;
  err.statusCode = opts.statusCode;
  return err;
});
const mockReadBody = vi.fn();
const mockUseRuntimeConfig = vi.fn(() => ({
  openrouterApiKey: "test-key",
  openrouterModel: "test-model",
}));

vi.stubGlobal("getFeedByUrl", mockGetFeedByUrl);
vi.stubGlobal("fetchPage", mockFetchPage);
vi.stubGlobal("trimHtml", mockTrimHtml);
vi.stubGlobal("generateParserConfig", mockGenerateParserConfig);
vi.stubGlobal("parseHtml", mockParseHtml);
vi.stubGlobal("saveFeed", mockSaveFeed);
vi.stubGlobal("getCachedPreview", mockGetCachedPreview);
vi.stubGlobal("setCachedPreview", mockSetCachedPreview);
vi.stubGlobal("normalizeUrl", mockNormalizeUrl);
vi.stubGlobal("createError", mockCreateError);
vi.stubGlobal("readBody", mockReadBody);
vi.stubGlobal("useRuntimeConfig", mockUseRuntimeConfig);
vi.stubGlobal("defineEventHandler", (fn: Function) => fn);

// nanoid mock
vi.mock("nanoid", () => ({
  nanoid: () => "testid123456",
}));

describe("POST /api/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizeUrl.mockImplementation((url: string) => url);
  });

  it("returns existing feed without fetching the page", async () => {
    const cachedPreview = {
      title: "Example Blog",
      description: "A blog",
      link: "https://example.com/blog",
      items: [{ title: "Post 1", link: "/post-1" }],
    };

    const existingFeed = {
      id: "existingId123",
      url: "https://example.com/blog",
      title: "Example Blog",
      parser_config: JSON.stringify({ itemSelector: ".post" }),
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
    mockGetFeedByUrl.mockResolvedValue(existingFeed);
    mockGetCachedPreview.mockResolvedValue(cachedPreview);

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );
    const result = await handler({} as any);

    // Should NOT have called fetchPage
    expect(mockFetchPage).not.toHaveBeenCalled();

    // Should return the existing feed info with cached preview
    expect(result).toEqual({
      feedId: "existingId123",
      feedUrl: "/feed/existingId123.xml",
      preview: cachedPreview,
      parserConfig: { itemSelector: ".post" },
    });
  });

  it("fetches page on cache miss for existing feed and caches the result", async () => {
    const parsedPreview = {
      title: "Example Blog",
      description: "A blog",
      link: "https://example.com/blog",
      items: [{ title: "Post 1", link: "/post-1" }],
    };

    const existingFeed = {
      id: "existingId123",
      url: "https://example.com/blog",
      title: "Example Blog",
      parser_config: JSON.stringify({ itemSelector: ".post" }),
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
    mockGetFeedByUrl.mockResolvedValue(existingFeed);
    mockGetCachedPreview.mockResolvedValue(null);
    mockFetchPage.mockResolvedValue("<html><div class='post'>Post 1</div></html>");
    mockParseHtml.mockReturnValue(parsedPreview);

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );
    const result = await handler({} as any);

    // Should fetch page since cache was empty
    expect(mockFetchPage).toHaveBeenCalledWith("https://example.com/blog");
    // Should NOT call AI — uses existing config
    expect(mockGenerateParserConfig).not.toHaveBeenCalled();
    // Should cache the preview for next time
    expect(mockSetCachedPreview).toHaveBeenCalledWith("existingId123", parsedPreview);
    expect(result.preview).toEqual(parsedPreview);
  });

  it("caches preview when creating a new feed", async () => {
    const preview = {
      title: "Blog",
      description: "",
      link: "https://example.com/blog",
      items: [{ title: "Hello", link: "/hello" }],
    };

    mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockResolvedValue("<html><div class='post'>Hello</div></html>");
    mockTrimHtml.mockReturnValue("<div class='post'>Hello</div>");
    mockGenerateParserConfig.mockResolvedValue({ itemSelector: ".post" });
    mockParseHtml.mockReturnValue(preview);

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );
    await handler({} as any);

    expect(mockSetCachedPreview).toHaveBeenCalledWith("testid123456", preview);
  });

  it("fetches page and generates config for new URLs", async () => {
    mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockResolvedValue("<html><div class='post'>Hello</div></html>");
    mockTrimHtml.mockReturnValue("<div class='post'>Hello</div>");
    mockGenerateParserConfig.mockResolvedValue({ itemSelector: ".post" });
    mockParseHtml.mockReturnValue({
      title: "Blog",
      description: "",
      link: "https://example.com/blog",
      items: [{ title: "Hello", link: "/hello" }],
    });

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );
    const result = await handler({} as any);

    expect(mockFetchPage).toHaveBeenCalledWith("https://example.com/blog");
    expect(mockGenerateParserConfig).toHaveBeenCalled();
    expect(mockSaveFeed).toHaveBeenCalled();
    expect(result.feedId).toBe("testid123456");
  });
});
