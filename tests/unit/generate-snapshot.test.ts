import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetFeedByUrl = vi.fn();
const mockFetchPage = vi.fn();
const mockSaveFeed = vi.fn();
const mockSaveSnapshot = vi.fn();
const mockNormalizeUrl = vi.fn((url: string) => url);
const mockCapturePostHogEvent = vi.fn();
const mockReadBody = vi.fn();
const mockCreateError = vi.fn((opts: any) => {
  const err = new Error(opts.statusMessage) as any;
  err.statusCode = opts.statusCode;
  return err;
});

const mockSaveFeedItem = vi.fn();

vi.stubGlobal("getFeedByUrl", mockGetFeedByUrl);
vi.stubGlobal("fetchPage", mockFetchPage);
vi.stubGlobal("saveFeed", mockSaveFeed);
vi.stubGlobal("saveSnapshot", mockSaveSnapshot);
vi.stubGlobal("saveFeedItem", mockSaveFeedItem);
vi.stubGlobal("normalizeUrl", mockNormalizeUrl);
vi.stubGlobal("capturePostHogEvent", mockCapturePostHogEvent);
vi.stubGlobal("createError", mockCreateError);
vi.stubGlobal("readBody", mockReadBody);
vi.stubGlobal("defineEventHandler", (fn: Function) => fn);

vi.mock("nanoid", () => ({
  nanoid: () => "snap12345678",
}));

describe("POST /api/generate-snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizeUrl.mockImplementation((url: string) => url);
  });

  it("creates a snapshot feed with initial snapshot and feed item", async () => {
    mockReadBody.mockResolvedValue({
      url: "https://example.com/updates",
      contentSelector: "main",
      suggestedTitle: "Example Updates",
    });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockResolvedValue(
      "<html><body><main>Some update content here.</main></body></html>"
    );

    const handler = await import("~/server/api/generate-snapshot.post").then(
      (m) => m.default
    );
    const result = await handler({} as any);

    expect(result.type).toBe("generated");
    expect(result.feedType).toBe("snapshot");
    expect(result.feedId).toBe("snap12345678");
    expect(result.feedUrl).toBe("/feed/snap12345678.atom");
    expect(result.preview.title).toBe("Example Updates");
    // Should include an initial item in the preview
    expect(result.preview.items).toHaveLength(1);
    expect(result.preview.items[0].link).toBe("https://example.com/updates");

    expect(mockSaveFeed).toHaveBeenCalledWith(
      "snap12345678",
      "https://example.com/updates",
      "Example Updates",
      expect.any(String),
      "snapshot"
    );
    expect(mockSaveSnapshot).toHaveBeenCalledWith(
      "snap12345678",
      expect.any(String),
      expect.stringMatching(/^[0-9a-f]{64}$/)
    );
    // Should save an initial feed item
    expect(mockSaveFeedItem).toHaveBeenCalledWith(
      "snap12345678",
      expect.stringContaining("Initial snapshot"),
      "https://example.com/updates",
      expect.any(String),
      expect.stringMatching(/^[0-9a-f]{64}$/)
    );
  });

  it("returns existing feed if URL already has one", async () => {
    mockReadBody.mockResolvedValue({
      url: "https://example.com/updates",
      contentSelector: "main",
      suggestedTitle: "Example Updates",
    });
    mockGetFeedByUrl.mockResolvedValue({
      id: "existing123",
      url: "https://example.com/updates",
      title: "Existing Feed",
      type: "snapshot",
      parser_config: "{}",
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
    });

    const handler = await import("~/server/api/generate-snapshot.post").then(
      (m) => m.default
    );
    const result = await handler({} as any);

    expect(result.feedId).toBe("existing123");
    expect(mockSaveFeed).not.toHaveBeenCalled();
    expect(mockSaveSnapshot).not.toHaveBeenCalled();
  });

  it("throws 400 when url is missing", async () => {
    mockReadBody.mockResolvedValue({ contentSelector: "main" });

    const handler = await import("~/server/api/generate-snapshot.post").then(
      (m) => m.default
    );
    await expect(handler({} as any)).rejects.toThrow();
    expect(mockCreateError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("throws 400 when contentSelector is missing", async () => {
    mockReadBody.mockResolvedValue({ url: "https://example.com/updates" });

    const handler = await import("~/server/api/generate-snapshot.post").then(
      (m) => m.default
    );
    await expect(handler({} as any)).rejects.toThrow();
    expect(mockCreateError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("generates a default title from hostname when suggestedTitle is missing", async () => {
    mockReadBody.mockResolvedValue({
      url: "https://example.com/updates",
      contentSelector: "main",
    });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockResolvedValue(
      "<html><body><main>Content</main></body></html>"
    );

    const handler = await import("~/server/api/generate-snapshot.post").then(
      (m) => m.default
    );
    const result = await handler({} as any);

    expect(result.preview.title).toBe("Changes to example.com");
  });

  it("tracks snapshot_created posthog event", async () => {
    mockReadBody.mockResolvedValue({
      url: "https://example.com/updates",
      contentSelector: "main",
      suggestedTitle: "Updates",
    });
    mockGetFeedByUrl.mockResolvedValue(null);
    mockFetchPage.mockResolvedValue(
      "<html><body><main>Content</main></body></html>"
    );

    const handler = await import("~/server/api/generate-snapshot.post").then(
      (m) => m.default
    );
    await handler({} as any);

    expect(mockCapturePostHogEvent).toHaveBeenCalledWith(
      {},
      "feed_generated",
      { outcome: "snapshot_created", url: "https://example.com/updates" }
    );
  });
});
