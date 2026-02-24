import { describe, it, expect } from "vitest";
import { generateRssXml } from "~/server/utils/rss";
import type { ExtractedFeed } from "~/server/utils/schema";

const FEED: ExtractedFeed = {
  title: "Test Feed",
  description: "A test feed",
  link: "https://example.com",
  items: [
    { title: "Item 1", link: "https://example.com/1" },
    {
      title: "Item 2",
      link: "https://example.com/2",
      description: "Desc 2",
      pubDate: "2025-01-15",
      author: "Alice",
      category: "Tech",
      image: "https://example.com/img.jpg",
    },
  ],
};

const SELF_URL = "https://rss.example.com/feed/abc.xml";

describe("generateRssXml", () => {
  it("produces valid XML preamble", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
  });

  it("includes channel title and link", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain("<title>Test Feed</title>");
    expect(xml).toContain("<link>https://example.com</link>");
  });

  it("includes RSS-O-Matic in description", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain("RSS-O-Matic");
  });

  it("includes feed description when provided", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain("A test feed");
  });

  it("includes atom:link self reference", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain('rel="self"');
    expect(xml).toContain(SELF_URL);
  });

  it("includes generator tag", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain("<generator>RSS-O-Matic</generator>");
  });

  it("renders items with title and link", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain("<title>Item 1</title>");
    expect(xml).toContain("<link>https://example.com/1</link>");
  });

  it("renders guid with isPermaLink", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain(
      '<guid isPermaLink="true">https://example.com/1</guid>'
    );
  });

  it("renders optional description", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain("<description>Desc 2</description>");
  });

  it("renders optional author", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain("<author>Alice</author>");
  });

  it("renders optional category", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain("<category>Tech</category>");
  });

  it("renders enclosure for image", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain(
      '<enclosure url="https://example.com/img.jpg" type="image/jpeg" length="0"/>'
    );
  });

  it("converts pubDate to UTC string", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toMatch(/<pubDate>Wed, 15 Jan 2025/);
  });

  it("skips pubDate when date is unparseable", () => {
    const feed: ExtractedFeed = {
      title: "T",
      description: "",
      link: "https://x.com",
      items: [
        { title: "X", link: "https://x.com/1", pubDate: "not-a-date" },
      ],
    };
    const xml = generateRssXml(feed, SELF_URL);
    expect(xml).not.toContain("<pubDate>");
  });

  it("does not render optional fields when absent", () => {
    const feed: ExtractedFeed = {
      title: "T",
      description: "",
      link: "https://x.com",
      items: [{ title: "X", link: "https://x.com/1" }],
    };
    const xml = generateRssXml(feed, SELF_URL);
    expect(xml).not.toContain("<description>Desc");
    expect(xml).not.toContain("<author>");
    expect(xml).not.toContain("<category>");
    expect(xml).not.toContain("<enclosure");
  });

  it("escapes special XML characters in title", () => {
    const feed: ExtractedFeed = {
      title: 'Feed & <Friends> "quoted"',
      description: "",
      link: "https://example.com",
      items: [{ title: "A & B", link: "https://example.com/a&b" }],
    };
    const xml = generateRssXml(feed, SELF_URL);
    expect(xml).toContain(
      "Feed &amp; &lt;Friends&gt; &quot;quoted&quot;"
    );
    expect(xml).toContain("A &amp; B");
    expect(xml).toContain("https://example.com/a&amp;b");
  });

  it("escapes apostrophes", () => {
    const feed: ExtractedFeed = {
      title: "It's a feed",
      description: "",
      link: "https://x.com",
      items: [{ title: "It's an item", link: "https://x.com/1" }],
    };
    const xml = generateRssXml(feed, SELF_URL);
    expect(xml).toContain("It&apos;s a feed");
  });

  it("includes xml-stylesheet for pretty rendering", () => {
    const xml = generateRssXml(FEED, SELF_URL);
    expect(xml).toContain("pretty-feed-v3.xsl");
  });
});
