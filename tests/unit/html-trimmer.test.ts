import { describe, it, expect } from "vitest";
import { trimHtml } from "~/server/utils/html-trimmer";

describe("trimHtml", () => {
  it("removes script tags", () => {
    const result = trimHtml(
      "<html><body><script>alert(1)</script><p>Hello</p></body></html>"
    );
    expect(result).not.toContain("<script");
    expect(result).toContain("Hello");
  });

  it("removes style tags", () => {
    const result = trimHtml(
      "<html><body><style>.x{color:red}</style><p>Hello</p></body></html>"
    );
    expect(result).not.toContain("<style");
    expect(result).toContain("Hello");
  });

  it("removes svg elements", () => {
    const result = trimHtml(
      "<html><body><svg><circle r='10'/></svg><p>Hi</p></body></html>"
    );
    expect(result).not.toContain("<svg");
    expect(result).toContain("Hi");
  });

  it("removes noscript elements", () => {
    const result = trimHtml(
      "<html><body><noscript>Enable JS</noscript><p>Hi</p></body></html>"
    );
    expect(result).not.toContain("<noscript");
  });

  it("removes iframe elements", () => {
    const result = trimHtml(
      '<html><body><iframe src="x"></iframe><p>Hi</p></body></html>'
    );
    expect(result).not.toContain("<iframe");
  });

  it("removes stylesheet link tags", () => {
    const result = trimHtml(
      '<html><head><link rel="stylesheet" href="x.css"></head><body><p>Hi</p></body></html>'
    );
    expect(result).not.toContain("stylesheet");
  });

  it("removes meta tags", () => {
    const result = trimHtml(
      '<html><head><meta charset="utf-8"></head><body><p>Hi</p></body></html>'
    );
    expect(result).not.toContain("<meta");
  });

  it("removes onclick attribute", () => {
    const result = trimHtml(
      '<html><body><div onclick="foo()">Hi</div></body></html>'
    );
    expect(result).not.toContain("onclick");
    expect(result).toContain("Hi");
  });

  it("removes onload attribute", () => {
    const result = trimHtml(
      '<html><body><img onload="bar()"><p>Hi</p></body></html>'
    );
    expect(result).not.toContain("onload");
  });

  it("removes inline style attributes", () => {
    const result = trimHtml(
      '<html><body><div style="color:red">Hi</div></body></html>'
    );
    expect(result).not.toContain('style="');
  });

  it("removes data-* attributes", () => {
    const result = trimHtml(
      '<html><body><div data-foo="1" data-bar="2">Hi</div></body></html>'
    );
    expect(result).not.toContain("data-foo");
    expect(result).not.toContain("data-bar");
  });

  it("preserves data-testid attribute", () => {
    const result = trimHtml(
      '<html><body><div data-testid="my-el" data-foo="1">Hi</div></body></html>'
    );
    expect(result).toContain("data-testid");
    expect(result).not.toContain("data-foo");
  });

  it("truncates text nodes longer than 200 chars", () => {
    const longText = "A".repeat(300);
    const result = trimHtml(
      `<html><body><p>${longText}</p></body></html>`
    );
    expect(result).toContain("A".repeat(80) + "...");
    expect(result).not.toContain("A".repeat(200));
  });

  it("does not truncate text nodes under 200 chars", () => {
    const shortText = "A".repeat(100);
    const result = trimHtml(
      `<html><body><p>${shortText}</p></body></html>`
    );
    expect(result).toContain(shortText);
  });

  it("caps total output at 30KB", () => {
    const bigHtml =
      "<html><body>" + "<p>x</p>".repeat(10_000) + "</body></html>";
    const result = trimHtml(bigHtml);
    expect(result.length).toBeLessThanOrEqual(30_000);
  });

  it("preserves structural HTML", () => {
    const result = trimHtml(
      '<html><body><div class="post"><h2>Title</h2><p>Content</p></div></body></html>'
    );
    expect(result).toContain('<div class="post">');
    expect(result).toContain("<h2>");
    expect(result).toContain("Title");
    expect(result).toContain("Content");
  });
});
