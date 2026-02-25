import { describe, it, expect } from "vitest";
import { parseHtml } from "~/server/utils/parser";
import type { ParserConfig } from "~/server/utils/schema";

const SAMPLE_HTML = `
<html><body>
  <h1>My Blog</h1>
  <div class="post">
    <h2><a href="/post-1">Post One</a></h2>
    <p class="desc">First post description</p>
    <time datetime="2025-01-15">Jan 15</time>
    <span class="author">Alice</span>
    <span class="tag">Tech</span>
    <img src="/img1.jpg">
  </div>
  <div class="post">
    <h2><a href="/post-2">Post Two</a></h2>
    <p class="desc">Second post description</p>
    <time datetime="2025-01-16">Jan 16</time>
    <span class="author">Bob</span>
  </div>
</body></html>`;

const CONFIG: ParserConfig = {
  itemSelector: ".post",
  feed: { title: { selector: "h1" } },
  fields: {
    title: { selector: "h2" },
    link: { selector: "a", attr: "href" },
    description: { selector: ".desc" },
    pubDate: { selector: "time", attr: "datetime" },
  },
};

describe("parseHtml", () => {
  it("extracts feed title from selector", () => {
    const feed = parseHtml(SAMPLE_HTML, CONFIG, "https://example.com");
    expect(feed.title).toBe("My Blog");
  });

  it("extracts the correct number of items", () => {
    const feed = parseHtml(SAMPLE_HTML, CONFIG, "https://example.com");
    expect(feed.items).toHaveLength(2);
  });

  it("extracts item title, link, description, pubDate", () => {
    const feed = parseHtml(SAMPLE_HTML, CONFIG, "https://example.com");
    expect(feed.items[0]).toMatchObject({
      title: "Post One",
      link: "https://example.com/post-1",
      description: "First post description",
      pubDate: "2025-01-15",
    });
  });

  it("resolves relative URLs against sourceUrl", () => {
    const feed = parseHtml(SAMPLE_HTML, CONFIG, "https://example.com/blog/");
    expect(feed.items[0].link).toBe("https://example.com/post-1");
    expect(feed.items[1].link).toBe("https://example.com/post-2");
  });

  it("uses string literal for feed title", () => {
    const config: ParserConfig = {
      ...CONFIG,
      feed: { title: "Hardcoded Title" },
    };
    const feed = parseHtml(SAMPLE_HTML, config, "https://example.com");
    expect(feed.title).toBe("Hardcoded Title");
  });

  it("uses sourceUrl as default feed link", () => {
    const feed = parseHtml(SAMPLE_HTML, CONFIG, "https://example.com");
    expect(feed.link).toBe("https://example.com");
  });

  it("extracts feed link from selector when configured", () => {
    const config: ParserConfig = {
      ...CONFIG,
      feed: { ...CONFIG.feed, link: { selector: "a", attr: "href" } },
    };
    const feed = parseHtml(SAMPLE_HTML, config, "https://example.com");
    expect(feed.link).toBeTruthy();
  });

  it("skips items missing title", () => {
    const html = `<div class="post"><a href="/x">link</a></div>`;
    const config: ParserConfig = {
      ...CONFIG,
      fields: {
        title: { selector: ".nonexistent" },
        link: { selector: "a", attr: "href" },
      },
    };
    const feed = parseHtml(html, config, "https://example.com");
    expect(feed.items).toHaveLength(0);
  });

  it("skips items missing link", () => {
    const html = `<div class="post"><h2>Title</h2></div>`;
    const config: ParserConfig = {
      ...CONFIG,
      fields: {
        title: { selector: "h2" },
        link: { selector: "a", attr: "href" },
      },
    };
    const feed = parseHtml(html, config, "https://example.com");
    expect(feed.items).toHaveLength(0);
  });

  it("extracts optional author field", () => {
    const config: ParserConfig = {
      ...CONFIG,
      fields: { ...CONFIG.fields, author: { selector: ".author" } },
    };
    const feed = parseHtml(SAMPLE_HTML, config, "https://example.com");
    expect(feed.items[0].author).toBe("Alice");
    expect(feed.items[1].author).toBe("Bob");
  });

  it("extracts optional category field", () => {
    const config: ParserConfig = {
      ...CONFIG,
      fields: { ...CONFIG.fields, category: { selector: ".tag" } },
    };
    const feed = parseHtml(SAMPLE_HTML, config, "https://example.com");
    expect(feed.items[0].category).toBe("Tech");
    expect(feed.items[1].category).toBeUndefined();
  });

  it("extracts image field and resolves relative URL", () => {
    const config: ParserConfig = {
      ...CONFIG,
      fields: { ...CONFIG.fields, image: { selector: "img", attr: "src" } },
    };
    const feed = parseHtml(SAMPLE_HTML, config, "https://example.com");
    expect(feed.items[0].image).toBe("https://example.com/img1.jpg");
    expect(feed.items[1].image).toBeUndefined();
  });

  it("extracts innerHTML when html: true", () => {
    const html = `<div class="post"><h2><a href="/p">Title</a></h2><div class="body"><b>Bold</b> text</div></div>`;
    const config: ParserConfig = {
      ...CONFIG,
      fields: {
        title: { selector: "h2" },
        link: { selector: "a", attr: "href" },
        description: { selector: ".body", html: true },
      },
    };
    const feed = parseHtml(html, config, "https://example.com");
    expect(feed.items[0].description).toContain("<b>Bold</b>");
  });

  it("returns empty description when feed.description is not set", () => {
    const feed = parseHtml(SAMPLE_HTML, CONFIG, "https://example.com");
    expect(feed.description).toBe("");
  });

  it("falls back to default title when selector matches nothing", () => {
    const config: ParserConfig = {
      ...CONFIG,
      feed: { title: { selector: ".nonexistent" } },
    };
    const feed = parseHtml(SAMPLE_HTML, config, "https://example.com");
    expect(feed.title).toBe("Atom Feed");
  });
});
