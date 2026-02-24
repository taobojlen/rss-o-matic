import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPage } from "~/server/utils/fetch-page";

// Mock consola to suppress logging during tests
vi.mock("consola", () => ({
  consola: {
    withTag: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe("fetchPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns HTML on successful fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("<html>Hello</html>"),
      })
    );

    const html = await fetchPage("https://example.com");
    expect(html).toBe("<html>Hello</html>");
  });

  it("throws on non-HTTP protocol", async () => {
    await expect(fetchPage("ftp://example.com")).rejects.toThrow(
      "Only HTTP and HTTPS"
    );
  });

  it("throws on non-HTTPS protocol", async () => {
    await expect(fetchPage("file:///etc/passwd")).rejects.toThrow(
      "Only HTTP and HTTPS"
    );
  });

  it("allows http URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("<html></html>"),
      })
    );

    const html = await fetchPage("http://example.com");
    expect(html).toBe("<html></html>");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })
    );

    await expect(fetchPage("https://example.com")).rejects.toThrow("HTTP 404");
  });

  it("passes User-Agent header containing RSS-O-Matic", async () => {
    const mockFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFn);

    await fetchPage("https://example.com");

    const headers = mockFn.mock.calls[0][1].headers;
    expect(headers["User-Agent"]).toContain("RSS-O-Matic");
  });

  it("sets Accept header for HTML", async () => {
    const mockFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFn);

    await fetchPage("https://example.com");

    const headers = mockFn.mock.calls[0][1].headers;
    expect(headers.Accept).toContain("text/html");
  });

  it("passes abort signal for timeout", async () => {
    const mockFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", mockFn);

    await fetchPage("https://example.com");

    const options = mockFn.mock.calls[0][1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
