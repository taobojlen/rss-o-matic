import { describe, it, expect } from "vitest";
import { detectExistingFeeds } from "~/server/utils/detect-feeds";

const SOURCE_URL = "https://example.com/blog";

function html(head: string): string {
  return `<html><head>${head}</head><body><p>Hello</p></body></html>`;
}

describe("detectExistingFeeds", () => {
  it("returns empty array when no feed links exist", () => {
    const result = detectExistingFeeds(html(""), SOURCE_URL);
    expect(result).toEqual([]);
  });

  it("detects RSS feed from link[rel=alternate]", () => {
    const result = detectExistingFeeds(
      html(
        '<link rel="alternate" type="application/rss+xml" href="/feed.xml" title="My Blog">'
      ),
      SOURCE_URL
    );
    expect(result).toEqual([
      {
        url: "https://example.com/feed.xml",
        title: "My Blog",
        feedType: "rss",
      },
    ]);
  });

  it("detects Atom feed", () => {
    const result = detectExistingFeeds(
      html(
        '<link rel="alternate" type="application/atom+xml" href="/atom.xml">'
      ),
      SOURCE_URL
    );
    expect(result).toEqual([
      {
        url: "https://example.com/atom.xml",
        title: undefined,
        feedType: "atom",
      },
    ]);
  });

  it("detects JSON feed", () => {
    const result = detectExistingFeeds(
      html(
        '<link rel="alternate" type="application/feed+json" href="/feed.json" title="JSON Feed">'
      ),
      SOURCE_URL
    );
    expect(result).toEqual([
      {
        url: "https://example.com/feed.json",
        title: "JSON Feed",
        feedType: "json",
      },
    ]);
  });

  it("detects multiple feeds", () => {
    const result = detectExistingFeeds(
      html(
        '<link rel="alternate" type="application/rss+xml" href="/rss.xml" title="RSS">' +
          '<link rel="alternate" type="application/atom+xml" href="/atom.xml" title="Atom">'
      ),
      SOURCE_URL
    );
    expect(result).toHaveLength(2);
    expect(result[0].feedType).toBe("rss");
    expect(result[1].feedType).toBe("atom");
  });

  it("resolves relative URLs against source URL", () => {
    const result = detectExistingFeeds(
      html(
        '<link rel="alternate" type="application/rss+xml" href="/feed">'
      ),
      "https://example.com/blog/posts"
    );
    expect(result[0].url).toBe("https://example.com/feed");
  });

  it("preserves absolute URLs", () => {
    const result = detectExistingFeeds(
      html(
        '<link rel="alternate" type="application/rss+xml" href="https://cdn.example.com/feed.xml">'
      ),
      SOURCE_URL
    );
    expect(result[0].url).toBe("https://cdn.example.com/feed.xml");
  });

  it("ignores link[rel=alternate] without matching type", () => {
    const result = detectExistingFeeds(
      html('<link rel="alternate" hreflang="es" href="/es/">'),
      SOURCE_URL
    );
    expect(result).toEqual([]);
  });

  it("ignores link[rel=stylesheet]", () => {
    const result = detectExistingFeeds(
      html('<link rel="stylesheet" href="/style.css">'),
      SOURCE_URL
    );
    expect(result).toEqual([]);
  });

  it("skips entries with missing href", () => {
    const result = detectExistingFeeds(
      html('<link rel="alternate" type="application/rss+xml">'),
      SOURCE_URL
    );
    expect(result).toEqual([]);
  });

  it("returns undefined title when not present", () => {
    const result = detectExistingFeeds(
      html(
        '<link rel="alternate" type="application/rss+xml" href="/feed.xml">'
      ),
      SOURCE_URL
    );
    expect(result[0].title).toBeUndefined();
  });
});
