import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetFeed = vi.fn();
const mockLogFeedFetch = vi.fn().mockResolvedValue(undefined);
const mockGetCachedFeed = vi.fn();
const mockSetCachedFeed = vi.fn();
const mockFetchPage = vi.fn();
const mockGetLatestSnapshot = vi.fn();
const mockSaveSnapshot = vi.fn();
const mockSaveFeedItem = vi.fn();
const mockPruneSnapshots = vi.fn().mockResolvedValue(undefined);
const mockPruneFeedItems = vi.fn().mockResolvedValue(undefined);
const mockGetFeedItems = vi.fn();
const mockGenerateRssXml = vi.fn(() => "<rss>xml</rss>");
const mockGenerateAtomXml = vi.fn(() => "<feed>atom</feed>");
const mockParseHtml = vi.fn();
const mockAttemptRegeneration = vi.fn();
const mockGetRouterParam = vi.fn();
const mockGetRequestHeader = vi.fn();
const mockSetResponseHeaders = vi.fn();
const mockCreateError = vi.fn((opts: any) => {
  const err = new Error(opts.statusMessage) as any;
  err.statusCode = opts.statusCode;
  return err;
});

vi.stubGlobal("getFeed", mockGetFeed);
vi.stubGlobal("logFeedFetch", mockLogFeedFetch);
vi.stubGlobal("getCachedFeed", mockGetCachedFeed);
vi.stubGlobal("setCachedFeed", mockSetCachedFeed);
vi.stubGlobal("fetchPage", mockFetchPage);
vi.stubGlobal("getLatestSnapshot", mockGetLatestSnapshot);
vi.stubGlobal("saveSnapshot", mockSaveSnapshot);
vi.stubGlobal("saveFeedItem", mockSaveFeedItem);
vi.stubGlobal("pruneSnapshots", mockPruneSnapshots);
vi.stubGlobal("pruneFeedItems", mockPruneFeedItems);
vi.stubGlobal("getFeedItems", mockGetFeedItems);
vi.stubGlobal("generateRssXml", mockGenerateRssXml);
vi.stubGlobal("generateAtomXml", mockGenerateAtomXml);
vi.stubGlobal("parseHtml", mockParseHtml);
vi.stubGlobal("attemptRegeneration", mockAttemptRegeneration);
vi.stubGlobal("getRouterParam", mockGetRouterParam);
vi.stubGlobal("getRequestHeader", mockGetRequestHeader);
vi.stubGlobal("setResponseHeaders", mockSetResponseHeaders);
vi.stubGlobal("createError", mockCreateError);
vi.stubGlobal("defineEventHandler", (fn: Function) => fn);

const SNAPSHOT_FEED = {
  id: "snap123",
  url: "https://example.com/updates",
  title: "Updates",
  type: "snapshot" as const,
  parser_config: JSON.stringify({
    contentSelector: "main",
    feedTitle: "Example Updates",
  }),
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};

describe("GET /feed/[id] (snapshot feeds)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRouterParam.mockReturnValue("snap123.rss");
    mockGetRequestHeader.mockReturnValue("localhost");
    mockGetCachedFeed.mockResolvedValue(null);
  });

  it("serves empty feed when snapshot feed has no items yet", async () => {
    mockGetFeed.mockResolvedValue(SNAPSHOT_FEED);
    mockFetchPage.mockResolvedValue(
      "<html><body><main>Initial content</main></body></html>"
    );
    mockGetLatestSnapshot.mockResolvedValue(null);
    mockGetFeedItems.mockResolvedValue([]);

    const handler = await import("~/server/routes/feed/[id].get").then(
      (m) => m.default
    );
    await handler({ context: {} } as any);

    expect(mockGenerateRssXml).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Example Updates",
        items: [],
      }),
      expect.any(String),
      expect.any(String)
    );
    expect(mockSaveFeedItem).not.toHaveBeenCalled();
    expect(mockSaveSnapshot).not.toHaveBeenCalled();
  });

  it("detects a change and creates a new feed item", async () => {
    mockGetFeed.mockResolvedValue(SNAPSHOT_FEED);
    mockFetchPage.mockResolvedValue(
      "<html><body><main>New content that is different</main></body></html>"
    );
    mockGetLatestSnapshot.mockResolvedValue({
      id: 1,
      feedId: "snap123",
      contentText: "Old content from before",
      contentHash: "oldhash1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
      capturedAt: "2024-01-01T00:00:00.000Z",
    });
    mockGetFeedItems.mockResolvedValue([
      {
        id: 1,
        feedId: "snap123",
        title: "Update — Jan 1, 2024, 12:00 AM",
        link: "https://example.com/updates",
        description: "Some change",
        contentHash: "somehash",
        detectedAt: "2024-01-01T00:00:00.000Z",
      },
    ]);

    const handler = await import("~/server/routes/feed/[id].get").then(
      (m) => m.default
    );
    await handler({ context: {} } as any);

    expect(mockSaveFeedItem).toHaveBeenCalledWith(
      "snap123",
      expect.stringContaining("Update"),
      "https://example.com/updates",
      expect.any(String),
      expect.stringMatching(/^[0-9a-f]{64}$/)
    );
    expect(mockSaveSnapshot).toHaveBeenCalledWith(
      "snap123",
      expect.any(String),
      expect.stringMatching(/^[0-9a-f]{64}$/)
    );
  });

  it("does not create a new item when content has not changed", async () => {
    const { hashContent, extractContentText } = await import(
      "~/server/utils/snapshot"
    );
    const html =
      "<html><body><main>Same content as before</main></body></html>";
    const config = { contentSelector: "main", feedTitle: "Test" };
    const text = extractContentText(html, config);
    const hash = await hashContent(text);

    mockGetFeed.mockResolvedValue(SNAPSHOT_FEED);
    mockFetchPage.mockResolvedValue(html);
    mockGetLatestSnapshot.mockResolvedValue({
      id: 1,
      feedId: "snap123",
      contentText: text,
      contentHash: hash,
      capturedAt: "2024-01-01T00:00:00.000Z",
    });
    mockGetFeedItems.mockResolvedValue([]);

    const handler = await import("~/server/routes/feed/[id].get").then(
      (m) => m.default
    );
    await handler({ context: {} } as any);

    expect(mockSaveFeedItem).not.toHaveBeenCalled();
    expect(mockSaveSnapshot).not.toHaveBeenCalled();
  });

  it("returns cached XML for snapshot feeds too", async () => {
    mockGetFeed.mockResolvedValue(SNAPSHOT_FEED);
    mockGetCachedFeed.mockResolvedValue("<rss>cached</rss>");

    const handler = await import("~/server/routes/feed/[id].get").then(
      (m) => m.default
    );
    const result = await handler({ context: {} } as any);

    expect(result).toBe("<rss>cached</rss>");
    expect(mockFetchPage).not.toHaveBeenCalled();
  });

  it("passes stored items to feed generator", async () => {
    const storedItems = [
      {
        id: 2,
        feedId: "snap123",
        title: "Update — Feb 1, 2024",
        link: "https://example.com/updates",
        description: "Second change",
        contentHash: "hash2",
        detectedAt: "2024-02-01T00:00:00.000Z",
      },
      {
        id: 1,
        feedId: "snap123",
        title: "Update — Jan 1, 2024",
        link: "https://example.com/updates",
        description: "First change",
        contentHash: "hash1",
        detectedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    mockGetFeed.mockResolvedValue(SNAPSHOT_FEED);
    mockFetchPage.mockResolvedValue(
      "<html><body><main>Same content as before</main></body></html>"
    );
    mockGetLatestSnapshot.mockResolvedValue({
      id: 1,
      feedId: "snap123",
      contentText: "Same content as before",
      contentHash: "will-not-match",
      capturedAt: "2024-01-01",
    });
    mockGetFeedItems.mockResolvedValue(storedItems);

    const handler = await import("~/server/routes/feed/[id].get").then(
      (m) => m.default
    );
    await handler({ context: {} } as any);

    const extractedArg = mockGenerateRssXml.mock.calls[0][0];
    expect(extractedArg.items).toHaveLength(2);
    expect(extractedArg.items[0].title).toBe("Update — Feb 1, 2024");
    expect(extractedArg.items[1].title).toBe("Update — Jan 1, 2024");
  });

  it("uses Atom generator when .atom extension is requested", async () => {
    mockGetRouterParam.mockReturnValue("snap123.atom");
    mockGetFeed.mockResolvedValue(SNAPSHOT_FEED);
    mockFetchPage.mockResolvedValue(
      "<html><body><main>Initial content</main></body></html>"
    );
    mockGetLatestSnapshot.mockResolvedValue(null);
    mockGetFeedItems.mockResolvedValue([]);

    const handler = await import("~/server/routes/feed/[id].get").then(
      (m) => m.default
    );
    await handler({ context: {} } as any);

    expect(mockGenerateAtomXml).toHaveBeenCalled();
    expect(mockGenerateRssXml).not.toHaveBeenCalled();
    expect(mockSetResponseHeaders).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        "Content-Type": "application/xml; charset=utf-8",
      })
    );
  });

  it("sets RSS content type for .rss extension", async () => {
    mockGetFeed.mockResolvedValue(SNAPSHOT_FEED);
    mockGetCachedFeed.mockResolvedValue("<rss>cached</rss>");

    const handler = await import("~/server/routes/feed/[id].get").then(
      (m) => m.default
    );
    await handler({ context: {} } as any);

    expect(mockSetResponseHeaders).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        "Content-Type": "application/xml; charset=utf-8",
      })
    );
  });
});
