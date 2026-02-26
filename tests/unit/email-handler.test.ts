import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auto-imported global
vi.stubGlobal("defineNitroPlugin", (fn: Function) => fn);

// Mock imported modules
const mockGetNewsletterFeedByEmail = vi.fn();
const mockAddNewsletterItem = vi.fn();
const mockSanitizeEmailHtml = vi.fn((html: string) => html);
const mockInvalidateCachedFeed = vi.fn();
const mockCaptureServerException = vi.fn().mockResolvedValue(undefined);
const mockParse = vi.fn();

vi.mock("~/server/utils/newsletter-db", () => ({
  getNewsletterFeedByEmail: (...args: any[]) =>
    mockGetNewsletterFeedByEmail(...args),
  addNewsletterItem: (...args: any[]) => mockAddNewsletterItem(...args),
}));

vi.mock("~/server/utils/sanitize-email", () => ({
  sanitizeEmailHtml: (...args: any[]) => mockSanitizeEmailHtml(...args),
}));

vi.mock("~/server/utils/cache", () => ({
  invalidateCachedFeed: (...args: any[]) => mockInvalidateCachedFeed(...args),
}));

vi.mock("~/server/utils/posthog", () => ({
  captureServerException: (...args: any[]) =>
    mockCaptureServerException(...args),
}));

vi.mock("postal-mime", () => ({
  default: class {
    parse = (...args: any[]) => mockParse(...args);
  },
}));

vi.mock("nanoid", () => ({
  nanoid: () => "testitemid12",
}));

function createMockMessage(overrides: Record<string, any> = {}) {
  return {
    to: "abc123def456@rss-o-matic.com",
    from: "sender@example.com",
    rawSize: 500,
    raw: "raw email bytes",
    setReject: vi.fn(),
    ...overrides,
  };
}

const mockFeed = {
  id: "feed-id-1234",
  title: "My Newsletter",
  email_address: "abc123def456@rss-o-matic.com",
  created_at: "2026-01-15T00:00:00.000Z",
  updated_at: "2026-01-15T00:00:00.000Z",
};

describe("email handler", async () => {
  // Extract the cloudflare:email hook callback
  let emailHandler: Function;
  const pluginSetup = (await import("~/server/plugins/email")).default as any;
  pluginSetup({
    hooks: {
      hook: (_name: string, cb: Function) => {
        emailHandler = cb;
      },
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockParse.mockResolvedValue({
      subject: "Weekly Digest #42",
      from: { name: "Newsletter Author", address: "sender@example.com" },
      html: "<p>Hello subscriber</p>",
      text: "Hello subscriber",
      messageId: "msg-001@example.com",
    });
  });

  it("creates a feed item when email matches an existing feed", async () => {
    mockGetNewsletterFeedByEmail.mockResolvedValue(mockFeed);
    mockAddNewsletterItem.mockResolvedValue(undefined);
    mockInvalidateCachedFeed.mockResolvedValue(undefined);

    const message = createMockMessage();
    await emailHandler({ message, context: {} });

    expect(mockGetNewsletterFeedByEmail).toHaveBeenCalledWith(
      "abc123def456@rss-o-matic.com"
    );
    expect(mockAddNewsletterItem).toHaveBeenCalledWith(
      "testitemid12",
      "feed-id-1234",
      "Weekly Digest #42",
      "Newsletter Author",
      "sender@example.com",
      "<p>Hello subscriber</p>",
      "Hello subscriber",
      "msg-001@example.com"
    );
    expect(mockInvalidateCachedFeed).toHaveBeenCalledWith("feed-id-1234");
  });

  it("silently drops email when no matching feed exists", async () => {
    mockGetNewsletterFeedByEmail.mockResolvedValue(null);

    const message = createMockMessage();
    await emailHandler({ message, context: {} });

    expect(mockGetNewsletterFeedByEmail).toHaveBeenCalledWith(
      "abc123def456@rss-o-matic.com"
    );
    expect(mockAddNewsletterItem).not.toHaveBeenCalled();
    expect(message.setReject).not.toHaveBeenCalled();
  });

  it("rejects oversized emails", async () => {
    const message = createMockMessage({ rawSize: 6 * 1024 * 1024 });
    await emailHandler({ message, context: {} });

    expect(message.setReject).toHaveBeenCalledWith(
      "Message too large (max 5 MiB)"
    );
    expect(mockGetNewsletterFeedByEmail).not.toHaveBeenCalled();
  });

  it("rejects emails with invalid recipient", async () => {
    const message = createMockMessage({ to: "@rss-o-matic.com" });
    await emailHandler({ message, context: {} });

    expect(message.setReject).toHaveBeenCalledWith("Invalid recipient");
    expect(mockGetNewsletterFeedByEmail).not.toHaveBeenCalled();
  });

  it("silently ignores duplicate message-ids", async () => {
    mockGetNewsletterFeedByEmail.mockResolvedValue(mockFeed);
    mockAddNewsletterItem.mockRejectedValue(
      new Error("UNIQUE constraint failed: newsletter_items.message_id")
    );

    const message = createMockMessage();
    await emailHandler({ message, context: {} });

    expect(mockAddNewsletterItem).toHaveBeenCalled();
    expect(mockInvalidateCachedFeed).not.toHaveBeenCalled();
  });

  it("handles email with no subject", async () => {
    mockGetNewsletterFeedByEmail.mockResolvedValue(mockFeed);
    mockAddNewsletterItem.mockResolvedValue(undefined);
    mockInvalidateCachedFeed.mockResolvedValue(undefined);
    mockParse.mockResolvedValue({
      subject: "",
      from: { name: "Sender", address: "sender@example.com" },
      html: null,
      text: "plain text only",
      messageId: null,
    });

    const message = createMockMessage();
    await emailHandler({ message, context: {} });

    expect(mockAddNewsletterItem).toHaveBeenCalledWith(
      "testitemid12",
      "feed-id-1234",
      "(No subject)",
      "Sender",
      "sender@example.com",
      null,
      "plain text only",
      null
    );
  });

  it("falls back to message.from when parsed from is missing", async () => {
    mockGetNewsletterFeedByEmail.mockResolvedValue(mockFeed);
    mockAddNewsletterItem.mockResolvedValue(undefined);
    mockInvalidateCachedFeed.mockResolvedValue(undefined);
    mockParse.mockResolvedValue({
      subject: "Test",
      from: null,
      html: null,
      text: "content",
      messageId: null,
    });

    const message = createMockMessage({ from: "fallback@example.com" });
    await emailHandler({ message, context: {} });

    expect(mockAddNewsletterItem).toHaveBeenCalledWith(
      "testitemid12",
      "feed-id-1234",
      "Test",
      null,
      "fallback@example.com",
      null,
      "content",
      null
    );
  });

  it("matches feed even when email address case differs", async () => {
    const mixedCaseFeed = {
      ...mockFeed,
      email_address: "bTHIToi44MCQ@rss-o-matic.com",
    };
    mockGetNewsletterFeedByEmail.mockResolvedValue(mixedCaseFeed);
    mockAddNewsletterItem.mockResolvedValue(undefined);
    mockInvalidateCachedFeed.mockResolvedValue(undefined);

    const message = createMockMessage({
      to: "bthitoi44mcq@rss-o-matic.com",
    });
    await emailHandler({ message, context: {} });

    expect(mockGetNewsletterFeedByEmail).toHaveBeenCalledWith(
      "bthitoi44mcq@rss-o-matic.com"
    );
    expect(mockAddNewsletterItem).toHaveBeenCalledWith(
      "testitemid12",
      "feed-id-1234",
      "Weekly Digest #42",
      "Newsletter Author",
      "sender@example.com",
      "<p>Hello subscriber</p>",
      "Hello subscriber",
      "msg-001@example.com"
    );
  });

  it("rethrows non-duplicate errors from addNewsletterItem", async () => {
    mockGetNewsletterFeedByEmail.mockResolvedValue(mockFeed);
    mockAddNewsletterItem.mockRejectedValue(new Error("DB connection failed"));

    const message = createMockMessage();
    await expect(
      emailHandler({ message, context: {} })
    ).rejects.toThrow("DB connection failed");

    expect(mockCaptureServerException).toHaveBeenCalled();
  });
});
