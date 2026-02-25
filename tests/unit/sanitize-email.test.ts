import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml } from "~/server/utils/sanitize-email";

describe("sanitizeEmailHtml", () => {
  it("preserves normal HTML content", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeEmailHtml(html)).toContain("<p>Hello <strong>world</strong></p>");
  });

  it("strips <script> tags", () => {
    const html = '<p>Hi</p><script>alert("xss")</script><p>Bye</p>';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Hi</p>");
    expect(result).toContain("<p>Bye</p>");
  });

  it("strips <iframe> tags", () => {
    const html = '<p>Content</p><iframe src="https://evil.com"></iframe>';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>Content</p>");
  });

  it("strips <object> tags", () => {
    const html = '<object data="flash.swf"></object><p>Safe</p>';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("<object");
    expect(result).toContain("<p>Safe</p>");
  });

  it("strips <embed> tags", () => {
    const html = '<embed src="plugin.swf"><p>Safe</p>';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("<embed");
  });

  it("strips <form> tags", () => {
    const html = '<form action="/steal"><input type="text"></form><p>Safe</p>';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("<form");
    expect(result).toContain("<p>Safe</p>");
  });

  it("removes on* event handler attributes", () => {
    const html = '<p onclick="alert(1)" onmouseover="steal()">Click me</p>';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onmouseover");
    expect(result).toContain("Click me");
  });

  it("removes javascript: URLs from href", () => {
    const html = '<a href="javascript:alert(1)">Link</a>';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("javascript:");
  });

  it("removes javascript: URLs from src", () => {
    const html = '<img src="javascript:alert(1)">';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("javascript:");
  });

  it("removes tracking pixels (1x1 images)", () => {
    const html = '<img src="https://track.com/pixel.gif" width="1" height="1"><p>Content</p>';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("track.com");
    expect(result).toContain("<p>Content</p>");
  });

  it("removes hidden tracking pixels (display:none)", () => {
    const html = '<img src="https://track.com/pixel.gif" style="display:none"><p>Content</p>';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("track.com");
  });

  it("preserves normal images", () => {
    const html = '<img src="https://example.com/photo.jpg" width="600" alt="Photo">';
    const result = sanitizeEmailHtml(html);
    expect(result).toContain("photo.jpg");
  });

  it("strips <style> tags", () => {
    const html = "<style>body { color: red; }</style><p>Content</p>";
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("<style");
    expect(result).toContain("<p>Content</p>");
  });

  it("handles empty input", () => {
    expect(sanitizeEmailHtml("")).toBe("");
  });

  it("handles plain text (no HTML)", () => {
    expect(sanitizeEmailHtml("Just plain text")).toBe("Just plain text");
  });

  it("removes data: URLs from images", () => {
    const html = '<img src="data:text/html,<script>alert(1)</script>">';
    const result = sanitizeEmailHtml(html);
    expect(result).not.toContain("data:");
  });
});
