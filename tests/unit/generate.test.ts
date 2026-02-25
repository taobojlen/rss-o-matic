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
const mockDetectExistingFeeds = vi.fn(() => []);
const mockCreateError = vi.fn((opts: any) => {
  const err = new Error(opts.statusMessage) as any;
  err.statusCode = opts.statusCode;
  return err;
});
const mockCapturePostHogEvent = vi.fn();
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
vi.stubGlobal("capturePostHogEvent", mockCapturePostHogEvent);
vi.stubGlobal("detectExistingFeeds", mockDetectExistingFeeds);
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
    mockDetectExistingFeeds.mockReturnValue([]);
  });

  it("returns existing feed with type 'generated' without fetching the page", async () => {
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

    expect(mockFetchPage).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: "generated",
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

    expect(mockFetchPage).toHaveBeenCalledWith("https://example.com/blog");
    expect(mockGenerateParserConfig).not.toHaveBeenCalled();
    expect(mockSetCachedPreview).toHaveBeenCalledWith("existingId123", parsedPreview);
    expect(result.type).toBe("generated");
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
    mockGenerateParserConfig.mockResolvedValue({
      unsuitable: false,
      config: { itemSelector: ".post" },
    });
    mockParseHtml.mockReturnValue(preview);

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );
    await handler({} as any);

    expect(mockSetCachedPreview).toHaveBeenCalledWith("testid123456", preview);
  });

  it("throws H3 error with status 502 when fetchPage fails with HTTP error", async () => {
    mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockRejectedValue(new Error("HTTP 403 Forbidden"));

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    expect(mockCreateError).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 502,
      })
    );
  });

  it("shows friendly error message when site returns 403", async () => {
    mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockRejectedValue(new Error("HTTP 403 Forbidden"));

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    const call = mockCreateError.mock.calls.find(
      (c: any[]) => c[0]?.statusCode === 502
    );
    expect(call).toBeDefined();
    expect(call![0].statusMessage).toContain("slammed the door");
  });

  it("shows friendly error message when site returns 404", async () => {
    mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockRejectedValue(new Error("HTTP 404 Not Found"));

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    const call = mockCreateError.mock.calls.find(
      (c: any[]) => c[0]?.statusCode === 502
    );
    expect(call).toBeDefined();
    expect(call![0].statusMessage).toContain("nobody's home");
  });

  it("shows friendly error message for DNS failures", async () => {
    mockReadBody.mockResolvedValue({ url: "https://fooooo49284209.com/" });
    mockGetFeedByUrl.mockResolvedValue(null);
    const fetchErr = new TypeError("fetch failed");
    (fetchErr as any).cause = Object.assign(
      new Error("getaddrinfo ENOTFOUND fooooo49284209.com"),
      { code: "ENOTFOUND" }
    );
    mockFetchPage.mockRejectedValue(fetchErr);

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    const call = mockCreateError.mock.calls.find(
      (c: any[]) => c[0]?.statusCode === 422
    );
    expect(call).toBeDefined();
    expect(call![0].statusMessage).toMatch(/doesn.t exist/i);
  });

  it("shows friendly error message for connection refused", async () => {
    mockReadBody.mockResolvedValue({ url: "https://example.com/" });
    mockGetFeedByUrl.mockResolvedValue(null);
    const fetchErr = new TypeError("fetch failed");
    (fetchErr as any).cause = Object.assign(
      new Error("connect ECONNREFUSED 127.0.0.1:443"),
      { code: "ECONNREFUSED" }
    );
    mockFetchPage.mockRejectedValue(fetchErr);

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    const call = mockCreateError.mock.calls.find(
      (c: any[]) => c[0]?.statusCode === 502
    );
    expect(call).toBeDefined();
    expect(call![0].statusMessage).toMatch(/couldn.t reach/i);
  });

  it("shows friendly error message for timeout", async () => {
    mockReadBody.mockResolvedValue({ url: "https://example.com/" });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    const call = mockCreateError.mock.calls.find(
      (c: any[]) => c[0]?.statusCode === 504
    );
    expect(call).toBeDefined();
    expect(call![0].statusMessage).toMatch(/took too long/i);
  });

  it("fetches page and generates config for new URLs", async () => {
    mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockResolvedValue("<html><div class='post'>Hello</div></html>");
    mockTrimHtml.mockReturnValue("<div class='post'>Hello</div>");
    mockGenerateParserConfig.mockResolvedValue({
      unsuitable: false,
      config: { itemSelector: ".post" },
    });
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
    expect(result.type).toBe("generated");
    expect(result.feedId).toBe("testid123456");
  });

  it("returns existing_feed when HTML contains RSS link tags", async () => {
    const discoveredFeeds = [
      { url: "https://example.com/feed.xml", title: "My Blog", feedType: "rss" as const },
    ];

    mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockResolvedValue(
      '<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml" title="My Blog"></head><body></body></html>'
    );
    mockDetectExistingFeeds.mockReturnValue(discoveredFeeds);

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );
    const result = await handler({} as any);

    expect(result).toEqual({
      type: "existing_feed",
      existingFeeds: discoveredFeeds,
    });
    // Should NOT call AI or save anything
    expect(mockTrimHtml).not.toHaveBeenCalled();
    expect(mockGenerateParserConfig).not.toHaveBeenCalled();
    expect(mockSaveFeed).not.toHaveBeenCalled();
  });

  it("returns unsuitable when AI flags page as unsuitable", async () => {
    mockReadBody.mockResolvedValue({ url: "https://example.com" });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockResolvedValue("<html><body><h1>Welcome</h1></body></html>");
    mockDetectExistingFeeds.mockReturnValue([]);
    mockTrimHtml.mockReturnValue("<h1>Welcome</h1>");
    mockGenerateParserConfig.mockResolvedValue({
      unsuitable: true,
      reason: "This appears to be a landing page with no repeating content",
    });

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );
    const result = await handler({} as any);

    expect(result).toEqual({
      type: "unsuitable",
      reason: "This appears to be a landing page with no repeating content",
    });
    // Should NOT parse or save
    expect(mockParseHtml).not.toHaveBeenCalled();
    expect(mockSaveFeed).not.toHaveBeenCalled();
  });

  it("skips feed detection for URLs already in DB", async () => {
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
    mockGetCachedPreview.mockResolvedValue({
      title: "Example Blog",
      description: "",
      link: "https://example.com/blog",
      items: [],
    });

    const handler = await import("~/server/api/generate.post").then(
      (m) => m.default
    );
    await handler({} as any);

    expect(mockDetectExistingFeeds).not.toHaveBeenCalled();
  });

  describe("posthog tracking", () => {
    it("tracks 'existing' outcome when feed already exists", async () => {
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
      mockGetCachedPreview.mockResolvedValue({
        title: "Blog",
        description: "",
        link: "https://example.com/blog",
        items: [{ title: "Post 1", link: "/post-1" }],
      });

      const handler = await import("~/server/api/generate.post").then(
        (m) => m.default
      );
      await handler({} as any);

      expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
        {},
        "feed_generated",
        { outcome: "existing", url: "https://example.com/blog" }
      );
    });

    it("tracks 'created' outcome when a new feed is generated", async () => {
      mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockResolvedValue("<html><div class='post'>Hello</div></html>");
      mockTrimHtml.mockReturnValue("<div class='post'>Hello</div>");
      mockGenerateParserConfig.mockResolvedValue({
        unsuitable: false,
        config: { itemSelector: ".post" },
      });
      mockParseHtml.mockReturnValue({
        title: "Blog",
        description: "",
        link: "https://example.com/blog",
        items: [{ title: "Hello", link: "/hello" }],
      });

      const handler = await import("~/server/api/generate.post").then(
        (m) => m.default
      );
      await handler({} as any);

      expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
        {},
        "feed_generated",
        { outcome: "created", url: "https://example.com/blog" }
      );
    });

    it("tracks 'existing_feed' outcome when site has RSS", async () => {
      const discoveredFeeds = [
        { url: "https://example.com/feed.xml", title: "Blog", feedType: "rss" as const },
      ];

      mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockResolvedValue("<html></html>");
      mockDetectExistingFeeds.mockReturnValue(discoveredFeeds);

      const handler = await import("~/server/api/generate.post").then(
        (m) => m.default
      );
      await handler({} as any);

      expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
        {},
        "feed_generated",
        { outcome: "existing_feed", url: "https://example.com/blog" }
      );
    });

    it("tracks 'unsuitable' outcome when AI flags page", async () => {
      mockReadBody.mockResolvedValue({ url: "https://example.com" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockResolvedValue("<html><body><h1>Welcome</h1></body></html>");
      mockDetectExistingFeeds.mockReturnValue([]);
      mockTrimHtml.mockReturnValue("<h1>Welcome</h1>");
      mockGenerateParserConfig.mockResolvedValue({
        unsuitable: true,
        reason: "Landing page",
      });

      const handler = await import("~/server/api/generate.post").then(
        (m) => m.default
      );
      await handler({} as any);

      expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
        {},
        "feed_generated",
        { outcome: "unsuitable", url: "https://example.com" }
      );
    });

    it("tracks 'error' outcome when generation fails", async () => {
      mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockRejectedValue(new Error("Network error"));

      const handler = await import("~/server/api/generate.post").then(
        (m) => m.default
      );
      await expect(handler({} as any)).rejects.toThrow();

      expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
        {},
        "feed_generated",
        { outcome: "error", url: "https://example.com/blog" }
      );
    });

    it("tracks 'error' outcome after retry exhaustion", async () => {
      mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockResolvedValue("<html></html>");
      mockTrimHtml.mockReturnValue("<html></html>");
      mockGenerateParserConfig.mockResolvedValue({
        unsuitable: false,
        config: { itemSelector: ".nope", fields: { title: { selector: "h2" }, link: { selector: "a", attr: "href" } }, feed: { title: "Blog" } },
      });
      mockParseHtml.mockReturnValue({
        title: "Blog",
        description: "",
        link: "https://example.com/blog",
        items: [],
      });

      const handler = await import("~/server/api/generate.post").then(
        (m) => m.default
      );
      await expect(handler({} as any)).rejects.toThrow();

      expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
        {},
        "feed_generated",
        { outcome: "error", url: "https://example.com/blog" }
      );
    });

    it("tracks 'error' outcome when parser finds no items", async () => {
      mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockResolvedValue("<html></html>");
      mockTrimHtml.mockReturnValue("<html></html>");
      mockGenerateParserConfig.mockResolvedValue({
        unsuitable: false,
        config: { itemSelector: ".post" },
      });
      mockParseHtml.mockReturnValue({
        title: "Blog",
        description: "",
        link: "https://example.com/blog",
        items: [],
      });

      const handler = await import("~/server/api/generate.post").then(
        (m) => m.default
      );
      await expect(handler({} as any)).rejects.toThrow();

      expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
        {},
        "feed_generated",
        { outcome: "error", url: "https://example.com/blog" }
      );
    });
  });

  describe("selector retry", () => {
    it("retries with feedback when first attempt returns 0 items, succeeds on second", async () => {
      mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockResolvedValue("<html><div class='post'>Hello</div></html>");
      mockTrimHtml.mockReturnValue("<div class='post'>Hello</div>");

      mockGenerateParserConfig
        .mockResolvedValueOnce({
          unsuitable: false,
          config: { itemSelector: ".wrong", fields: { title: { selector: "h2" }, link: { selector: "a", attr: "href" } }, feed: { title: "Blog" } },
        })
        .mockResolvedValueOnce({
          unsuitable: false,
          config: { itemSelector: ".post", fields: { title: { selector: "h2" }, link: { selector: "a", attr: "href" } }, feed: { title: "Blog" } },
        });

      mockParseHtml
        .mockReturnValueOnce({ title: "Blog", description: "", link: "https://example.com/blog", items: [] })
        .mockReturnValueOnce({ title: "Blog", description: "", link: "https://example.com/blog", items: [{ title: "Hello", link: "/hello" }] });

      const handler = await import("~/server/api/generate.post").then((m) => m.default);
      const result = await handler({} as any);

      expect(mockGenerateParserConfig).toHaveBeenCalledTimes(2);
      expect(result.type).toBe("generated");
      expect(result.preview.items).toHaveLength(1);
      expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
        {},
        "selector_retry",
        { url: "https://example.com/blog", attempt: 1, reason: "no_items" }
      );
    });

    it("retries when generateParserConfig throws (invalid CSS), succeeds on second", async () => {
      mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockResolvedValue("<html><div class='post'>Hello</div></html>");
      mockTrimHtml.mockReturnValue("<div class='post'>Hello</div>");

      mockGenerateParserConfig
        .mockRejectedValueOnce(new Error('fields.title contains an invalid CSS selector: "div:>>foo"'))
        .mockResolvedValueOnce({
          unsuitable: false,
          config: { itemSelector: ".post", fields: { title: { selector: "h2" }, link: { selector: "a", attr: "href" } }, feed: { title: "Blog" } },
        });

      mockParseHtml.mockReturnValue({
        title: "Blog", description: "", link: "https://example.com/blog",
        items: [{ title: "Hello", link: "/hello" }],
      });

      const handler = await import("~/server/api/generate.post").then((m) => m.default);
      const result = await handler({} as any);

      expect(mockGenerateParserConfig).toHaveBeenCalledTimes(2);
      expect(result.type).toBe("generated");
      expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
        {},
        "selector_retry",
        { url: "https://example.com/blog", attempt: 1, reason: "invalid_css" }
      );
    });

    it("throws 422 after exhausting all retries with 0 items", async () => {
      mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockResolvedValue("<html></html>");
      mockTrimHtml.mockReturnValue("<html></html>");
      mockGenerateParserConfig.mockResolvedValue({
        unsuitable: false,
        config: { itemSelector: ".nope", fields: { title: { selector: "h2" }, link: { selector: "a", attr: "href" } }, feed: { title: "Blog" } },
      });
      mockParseHtml.mockReturnValue({
        title: "Blog", description: "", link: "https://example.com/blog", items: [],
      });

      const handler = await import("~/server/api/generate.post").then((m) => m.default);
      await expect(handler({} as any)).rejects.toThrow();

      expect(mockGenerateParserConfig).toHaveBeenCalledTimes(3);
      expect(mockCreateError).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 422 })
      );
    });

    it("does not retry when first attempt succeeds", async () => {
      mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockResolvedValue("<html><div class='post'>Hello</div></html>");
      mockTrimHtml.mockReturnValue("<div class='post'>Hello</div>");
      mockGenerateParserConfig.mockResolvedValue({
        unsuitable: false,
        config: { itemSelector: ".post", fields: { title: { selector: "h2" }, link: { selector: "a", attr: "href" } }, feed: { title: "Blog" } },
      });
      mockParseHtml.mockReturnValue({
        title: "Blog", description: "", link: "https://example.com/blog",
        items: [{ title: "Hello", link: "/hello" }],
      });

      const handler = await import("~/server/api/generate.post").then((m) => m.default);
      await handler({} as any);

      expect(mockGenerateParserConfig).toHaveBeenCalledTimes(1);
    });

    it("returns unsuitable immediately without retrying", async () => {
      mockReadBody.mockResolvedValue({ url: "https://example.com" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockResolvedValue("<html><body><h1>Welcome</h1></body></html>");
      mockTrimHtml.mockReturnValue("<h1>Welcome</h1>");
      mockGenerateParserConfig.mockResolvedValue({
        unsuitable: true,
        reason: "Landing page",
      });

      const handler = await import("~/server/api/generate.post").then((m) => m.default);
      const result = await handler({} as any);

      expect(result.type).toBe("unsuitable");
      expect(mockGenerateParserConfig).toHaveBeenCalledTimes(1);
      expect(mockParseHtml).not.toHaveBeenCalled();
    });

    it("includes failing itemSelector in retry feedback", async () => {
      mockReadBody.mockResolvedValue({ url: "https://example.com/blog" });
      mockGetFeedByUrl.mockResolvedValue(null);
      mockFetchPage.mockResolvedValue("<html><div class='post'>Hello</div></html>");
      mockTrimHtml.mockReturnValue("<div class='post'>Hello</div>");

      mockGenerateParserConfig
        .mockResolvedValueOnce({
          unsuitable: false,
          config: { itemSelector: ".bad-selector", fields: { title: { selector: "h2" }, link: { selector: "a", attr: "href" } }, feed: { title: "Blog" } },
        })
        .mockResolvedValueOnce({
          unsuitable: false,
          config: { itemSelector: ".post", fields: { title: { selector: "h2" }, link: { selector: "a", attr: "href" } }, feed: { title: "Blog" } },
        });

      mockParseHtml
        .mockReturnValueOnce({ title: "Blog", description: "", link: "https://example.com/blog", items: [] })
        .mockReturnValueOnce({ title: "Blog", description: "", link: "https://example.com/blog", items: [{ title: "Hello", link: "/hello" }] });

      const handler = await import("~/server/api/generate.post").then((m) => m.default);
      await handler({} as any);

      const secondCall = mockGenerateParserConfig.mock.calls[1];
      const priorMessages = secondCall[4];
      expect(priorMessages).toBeDefined();
      expect(priorMessages).toHaveLength(2);
      expect(priorMessages[0].role).toBe("assistant");
      expect(priorMessages[1].role).toBe("user");
      expect(priorMessages[1].content).toContain(".bad-selector");
    });
  });
});
