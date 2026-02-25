import { describe, it, expect } from "vitest";
import { generateRssXml, generateAtomXml } from "~/server/utils/feed-generator";
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

const RSS_SELF_URL = "https://rss.example.com/feed/abc.rss";
const ATOM_SELF_URL = "https://rss.example.com/feed/abc.atom";

describe("generateRssXml", () => {
  it("produces valid XML preamble", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain("<rss");
  });

  it("includes channel title and link", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("<title>Test Feed</title>");
    expect(xml).toContain("https://example.com");
  });

  it("includes RSS-O-Matic in description", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("RSS-O-Matic");
  });

  it("includes feed description when provided", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("A test feed");
  });

  it("includes self reference link", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain(RSS_SELF_URL);
  });

  it("includes generator tag", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("RSS-O-Matic");
  });

  it("renders items with title and link", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("Item 1");
    expect(xml).toContain("<title>");
    expect(xml).toContain("https://example.com/1");
  });

  it("renders guid", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("<guid");
    expect(xml).toContain("https://example.com/1");
  });

  it("renders optional description", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("Desc 2");
  });

  it("renders optional author", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("Alice");
  });

  it("renders optional category", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("<category>Tech</category>");
  });

  it("renders enclosure for image", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("https://example.com/img.jpg");
    expect(xml).toContain("enclosure");
  });

  it("includes pubDate for items with valid dates", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("<pubDate>");
    expect(xml).toMatch(/Wed, 15 Jan 2025/);
  });

  it("does not render optional fields when absent", () => {
    const feed: ExtractedFeed = {
      title: "T",
      description: "",
      link: "https://x.com",
      items: [{ title: "X", link: "https://x.com/1" }],
    };
    const xml = generateRssXml(feed, RSS_SELF_URL);
    expect(xml).not.toContain("<description>Desc");
    expect(xml).not.toContain("Alice");
    expect(xml).not.toContain("<category>");
    expect(xml).not.toContain("<enclosure");
  });

  it("escapes special XML characters", () => {
    const feed: ExtractedFeed = {
      title: 'Feed & <Friends>',
      description: "",
      link: "https://example.com",
      items: [{ title: "A & B", link: "https://example.com/a&b" }],
    };
    const xml = generateRssXml(feed, RSS_SELF_URL);
    expect(xml).not.toContain("Feed & <Friends>");
    expect(xml).toContain("&amp;");
  });

  it("includes xml-stylesheet for pretty rendering", () => {
    const xml = generateRssXml(FEED, RSS_SELF_URL);
    expect(xml).toContain("pretty-feed-v3.xsl");
  });
});

describe("generateAtomXml", () => {
  it("produces valid Atom XML with namespace", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(xml).toContain("<feed");
  });

  it("includes feed title", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain("<title>Test Feed</title>");
  });

  it("includes subtitle with RSS-O-Matic branding", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain("RSS-O-Matic");
    expect(xml).toContain("A test feed");
  });

  it("includes self link", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain(ATOM_SELF_URL);
    expect(xml).toContain('rel="self"');
  });

  it("includes feed id", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain("<id>https://example.com</id>");
  });

  it("includes updated element with ISO 8601 date", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toMatch(/<updated>\d{4}-\d{2}-\d{2}T/);
  });

  it("includes generator", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain("RSS-O-Matic");
  });

  it("renders entries with title and link", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain("Item 1");
    expect(xml).toContain("<title");
    expect(xml).toContain("https://example.com/1");
  });

  it("renders entry id", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain("<id>https://example.com/1</id>");
  });

  it("renders entry updated in ISO 8601", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toMatch(/<updated>2025-01-15T/);
  });

  it("renders optional summary", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain("Desc 2");
  });

  it("renders optional author name", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain("<name>Alice</name>");
  });

  it("renders optional category", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain("Tech");
    expect(xml).toContain("category");
  });

  it("escapes special XML characters", () => {
    const feed: ExtractedFeed = {
      title: 'Feed & <Friends>',
      description: "",
      link: "https://example.com",
      items: [{ title: "A & B", link: "https://example.com/a&b" }],
    };
    const xml = generateAtomXml(feed, ATOM_SELF_URL);
    expect(xml).not.toContain("Feed & <Friends>");
    expect(xml).toContain("&amp;");
  });

  it("includes xml-stylesheet for pretty rendering", () => {
    const xml = generateAtomXml(FEED, ATOM_SELF_URL);
    expect(xml).toContain("pretty-atom.xsl");
  });

  it("does not render optional fields when absent", () => {
    const feed: ExtractedFeed = {
      title: "T",
      description: "",
      link: "https://x.com",
      items: [{ title: "X", link: "https://x.com/1" }],
    };
    const xml = generateAtomXml(feed, ATOM_SELF_URL);
    expect(xml).not.toContain("Desc");
    expect(xml).not.toContain("<name>");
    expect(xml).not.toContain("category");
  });
});
