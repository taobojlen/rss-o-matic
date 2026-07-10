import { describe, it, expect } from "vitest";
import { detectExistingFeeds, parseExistingFeedItems } from "~/server/utils/detect-feeds";

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

describe("parseExistingFeedItems", () => {
  it("returns the three latest RSS items with their links and dates", () => {
    const result = parseExistingFeedItems(
      `<?xml version="1.0"?>
      <rss><channel>
        <item><title>First transmission</title><link>https://example.com/first</link><pubDate>Thu, 10 Jul 2026 12:00:00 GMT</pubDate></item>
        <item><title>Second transmission</title><link>https://example.com/second</link></item>
        <item><title>Third transmission</title><link>https://example.com/third</link></item>
        <item><title>Fourth transmission</title><link>https://example.com/fourth</link></item>
      </channel></rss>`,
      "rss"
    );

    expect(result).toEqual([
      {
        title: "First transmission",
        link: "https://example.com/first",
        pubDate: "Thu, 10 Jul 2026 12:00:00 GMT",
      },
      { title: "Second transmission", link: "https://example.com/second" },
      { title: "Third transmission", link: "https://example.com/third" },
    ]);
  });

  it("extracts Atom entries and their alternate links", () => {
    const result = parseExistingFeedItems(
      `<feed xmlns="http://www.w3.org/2005/Atom">
        <entry><title>Atom update</title><link rel="alternate" href="/updates/1"/><updated>2026-07-10T12:00:00Z</updated></entry>
      </feed>`,
      "atom",
      "https://example.com/feed.atom"
    );

    expect(result).toEqual([
      {
        title: "Atom update",
        link: "https://example.com/updates/1",
        pubDate: "2026-07-10T12:00:00Z",
      },
    ]);
  });

  it("extracts JSON Feed items", () => {
    const result = parseExistingFeedItems(
      JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "JSON Feed",
        items: [
          {
            id: "https://example.com/updates/1",
            title: "JSON update",
            url: "https://example.com/updates/1",
            date_published: "2026-07-10T12:00:00Z",
          },
        ],
      }),
      "json"
    );

    expect(result).toEqual([
      {
        title: "JSON update",
        link: "https://example.com/updates/1",
        pubDate: "2026-07-10T12:00:00Z",
      },
    ]);
  });
});
