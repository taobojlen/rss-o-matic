import { describe, it, expect } from "vitest";
import { normalizeUrl } from "~/server/utils/normalize-url";

describe("normalizeUrl", () => {
  it("lowercases scheme and hostname", () => {
    expect(normalizeUrl("HTTP://Example.COM/path")).toBe(
      "http://example.com/path"
    );
  });

  it("removes default port 80 for http", () => {
    expect(normalizeUrl("http://example.com:80/path")).toBe(
      "http://example.com/path"
    );
  });

  it("removes default port 443 for https", () => {
    expect(normalizeUrl("https://example.com:443/path")).toBe(
      "https://example.com/path"
    );
  });

  it("keeps non-default ports", () => {
    expect(normalizeUrl("http://example.com:8080/path")).toBe(
      "http://example.com:8080/path"
    );
  });

  it("removes trailing slash on paths", () => {
    expect(normalizeUrl("https://example.com/path/")).toBe(
      "https://example.com/path"
    );
  });

  it("keeps trailing slash when path is just /", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("sorts query parameters", () => {
    expect(normalizeUrl("https://example.com/?z=1&a=2")).toBe(
      "https://example.com/?a=2&z=1"
    );
  });

  it("removes fragments", () => {
    expect(normalizeUrl("https://example.com/path#section")).toBe(
      "https://example.com/path"
    );
  });

  it("handles complex URLs with all transformations", () => {
    // Note: trailing slash before query params is preserved (only stripped when URL ends with /)
    expect(
      normalizeUrl("HTTPS://Example.COM:443/blog/post/?z=1&a=2#comments")
    ).toBe("https://example.com/blog/post/?a=2&z=1");
  });

  it("throws on invalid URL", () => {
    expect(() => normalizeUrl("not-a-url")).toThrow();
  });
});
