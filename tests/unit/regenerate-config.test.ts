import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock consola
vi.mock("consola", () => ({
  consola: {
    withTag: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Mock cache functions
const mockInvalidateCachedFeed = vi.fn();
vi.mock("~/server/utils/cache", () => ({
  invalidateCachedFeed: (...args: unknown[]) => mockInvalidateCachedFeed(...args),
}));

// Mock db
const mockUpdateFeedConfig = vi.fn();
vi.mock("~/server/utils/db", () => ({
  updateFeedConfig: (...args: unknown[]) => mockUpdateFeedConfig(...args),
}));

// Mock AI
const mockGenerateParserConfig = vi.fn();
vi.mock("~/server/utils/ai", () => ({
  generateParserConfig: (...args: unknown[]) => mockGenerateParserConfig(...args),
}));

// Mock parser
const mockParseHtml = vi.fn();
vi.mock("~/server/utils/parser", () => ({
  parseHtml: (...args: unknown[]) => mockParseHtml(...args),
}));

// Mock html-trimmer
const mockTrimHtml = vi.fn().mockReturnValue("<trimmed/>");
vi.mock("~/server/utils/html-trimmer", () => ({
  trimHtml: (...args: unknown[]) => mockTrimHtml(...args),
}));

// Mock posthog
const mockCaptureServerException = vi.fn().mockResolvedValue(undefined);
vi.mock("~/server/utils/posthog", () => ({
  captureServerException: (...args: unknown[]) =>
    mockCaptureServerException(...args),
}));

// Mock useRuntimeConfig (Nuxt auto-import)
vi.stubGlobal("useRuntimeConfig", () => ({
  openrouterApiKey: "test-key",
  openrouterModel: "test-model",
}));

import { attemptRegeneration } from "~/server/utils/regenerate-config";
import type { FeedRecord } from "~/server/utils/schema";

const FEED: FeedRecord = {
  id: "feed-123",
  url: "https://example.com/blog",
  title: "Test Blog",
  parser_config: JSON.stringify({
    feed: { title: "Test" },
    itemSelector: ".old-item",
    fields: { title: { selector: "h2" }, link: { selector: "a", attr: "href" } },
  }),
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const VALID_CONFIG = {
  feed: { title: "Test" },
  itemSelector: ".new-item",
  fields: {
    title: { selector: "h3" },
    link: { selector: "a", attr: "href" },
  },
};

const EXTRACTED_WITH_ITEMS = {
  title: "Test",
  description: "",
  link: "https://example.com/blog",
  items: [{ title: "Post 1", link: "https://example.com/post-1" }],
};

const EXTRACTED_EMPTY = {
  title: "Test",
  description: "",
  link: "https://example.com/blog",
  items: [],
};

describe("attemptRegeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidateCachedFeed.mockResolvedValue(undefined);
    mockUpdateFeedConfig.mockResolvedValue(undefined);
    mockGenerateParserConfig.mockResolvedValue(VALID_CONFIG);
    mockParseHtml.mockReturnValue(EXTRACTED_WITH_ITEMS);
  });

  it("returns success with extracted feed when AI produces working config", async () => {
    const result = await attemptRegeneration(FEED, "<html></html>");

    expect(result.status).toBe("success");
    expect(result.extracted).toEqual(EXTRACTED_WITH_ITEMS);
    expect(mockUpdateFeedConfig).toHaveBeenCalledWith(
      "feed-123",
      JSON.stringify(VALID_CONFIG),
      "Test"
    );
    expect(mockInvalidateCachedFeed).toHaveBeenCalledWith("feed-123");
  });

  it("returns failed when regenerated config finds 0 items", async () => {
    mockParseHtml.mockReturnValue(EXTRACTED_EMPTY);

    const result = await attemptRegeneration(FEED, "<html></html>");

    expect(result.status).toBe("failed");
    expect(mockUpdateFeedConfig).not.toHaveBeenCalled();
    expect(mockInvalidateCachedFeed).not.toHaveBeenCalled();
    expect(mockCaptureServerException).toHaveBeenCalledTimes(1);
    const [error, props] = mockCaptureServerException.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(props).toMatchObject({ feedId: "feed-123", url: "https://example.com/blog" });
  });

  it("returns failed and captures exception when AI call throws", async () => {
    mockGenerateParserConfig.mockRejectedValue(new Error("API timeout"));

    const result = await attemptRegeneration(FEED, "<html></html>");

    expect(result.status).toBe("failed");
    expect(mockUpdateFeedConfig).not.toHaveBeenCalled();
    expect(mockCaptureServerException).toHaveBeenCalledTimes(1);
    const [error, props] = mockCaptureServerException.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("API timeout");
    expect(props).toMatchObject({ feedId: "feed-123" });
  });
});
