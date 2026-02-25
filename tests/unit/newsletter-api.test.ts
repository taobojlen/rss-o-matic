import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auto-imported server utilities
const mockGetNewsletterFeed = vi.fn();
const mockGetNewsletterItemCount = vi.fn();
const mockUpdateNewsletterFeedTitle = vi.fn();
const mockDeleteNewsletterFeed = vi.fn();
const mockReadBody = vi.fn();
const mockGetRouterParam = vi.fn();
const mockGetRequestHeader = vi.fn();
const mockCreateError = vi.fn((opts: any) => {
  const err = new Error(opts.statusMessage) as any;
  err.statusCode = opts.statusCode;
  return err;
});

vi.stubGlobal("getNewsletterFeed", mockGetNewsletterFeed);
vi.stubGlobal("getNewsletterItemCount", mockGetNewsletterItemCount);
vi.stubGlobal("updateNewsletterFeedTitle", mockUpdateNewsletterFeedTitle);
vi.stubGlobal("deleteNewsletterFeed", mockDeleteNewsletterFeed);
vi.stubGlobal("readBody", mockReadBody);
vi.stubGlobal("getRouterParam", mockGetRouterParam);
vi.stubGlobal("getRequestHeader", mockGetRequestHeader);
vi.stubGlobal("createError", mockCreateError);
vi.stubGlobal("defineEventHandler", (fn: Function) => fn);

const mockFeed = {
  id: "abc123def456",
  title: "My Tech Digests",
  email_address: "xyz789@rss-o-matic.com",
  created_at: "2026-01-15T00:00:00.000Z",
  updated_at: "2026-01-15T00:00:00.000Z",
};

describe("PATCH /api/newsletters/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequestHeader.mockReturnValue("localhost");
  });

  it("updates title and returns updated feed data", async () => {
    mockGetRouterParam.mockReturnValue("abc123def456");
    mockReadBody.mockResolvedValue({ title: "New Name" });
    mockGetNewsletterFeed.mockResolvedValue(mockFeed);
    mockGetNewsletterItemCount.mockResolvedValue(5);
    mockUpdateNewsletterFeedTitle.mockResolvedValue(undefined);

    const handler = await import("~/server/api/newsletters/[id].patch").then(
      (m) => m.default
    );
    const result = await handler({} as any);

    expect(mockUpdateNewsletterFeedTitle).toHaveBeenCalledWith(
      "abc123def456",
      "New Name"
    );
    expect(result.id).toBe("abc123def456");
    expect(result.title).toBe("New Name");
    expect(result.emailAddress).toBe("xyz789@rss-o-matic.com");
    expect(result.feedUrl).toBe("/feed/abc123def456.atom");
    expect(result.itemCount).toBe(5);
  });

  it("returns 400 when title is missing", async () => {
    mockGetRouterParam.mockReturnValue("abc123def456");
    mockReadBody.mockResolvedValue({});

    const handler = await import("~/server/api/newsletters/[id].patch").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    expect(mockCreateError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("returns 400 when title is empty string", async () => {
    mockGetRouterParam.mockReturnValue("abc123def456");
    mockReadBody.mockResolvedValue({ title: "   " });

    const handler = await import("~/server/api/newsletters/[id].patch").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    expect(mockCreateError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("returns 400 when title exceeds 200 characters", async () => {
    mockGetRouterParam.mockReturnValue("abc123def456");
    mockReadBody.mockResolvedValue({ title: "x".repeat(201) });

    const handler = await import("~/server/api/newsletters/[id].patch").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    expect(mockCreateError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("returns 404 when feed does not exist", async () => {
    mockGetRouterParam.mockReturnValue("nonexistent");
    mockReadBody.mockResolvedValue({ title: "New Name" });
    mockGetNewsletterFeed.mockResolvedValue(null);

    const handler = await import("~/server/api/newsletters/[id].patch").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    expect(mockCreateError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 })
    );
  });
});

describe("DELETE /api/newsletters/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes feed and returns confirmation", async () => {
    mockGetRouterParam.mockReturnValue("abc123def456");
    mockGetNewsletterFeed.mockResolvedValue(mockFeed);
    mockDeleteNewsletterFeed.mockResolvedValue(undefined);

    const handler = await import("~/server/api/newsletters/[id].delete").then(
      (m) => m.default
    );
    const result = await handler({} as any);

    expect(mockDeleteNewsletterFeed).toHaveBeenCalledWith("abc123def456");
    expect(result).toEqual({ deleted: true });
  });

  it("returns 400 when id is missing", async () => {
    mockGetRouterParam.mockReturnValue(undefined);

    const handler = await import("~/server/api/newsletters/[id].delete").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    expect(mockCreateError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("returns 404 when feed does not exist", async () => {
    mockGetRouterParam.mockReturnValue("nonexistent");
    mockGetNewsletterFeed.mockResolvedValue(null);

    const handler = await import("~/server/api/newsletters/[id].delete").then(
      (m) => m.default
    );

    await expect(handler({} as any)).rejects.toThrow();
    expect(mockCreateError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 })
    );
  });
});
