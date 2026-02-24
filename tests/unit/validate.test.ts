import { describe, it, expect } from "vitest";
import { validateParserConfig } from "~/server/utils/validate";

describe("validateParserConfig", () => {
  const validConfig = {
    itemSelector: ".article",
    feed: { title: "My Feed" },
    fields: {
      title: { selector: "h2" },
      link: { selector: "a", attr: "href" },
    },
  };

  it("accepts a valid config with string title", () => {
    expect(validateParserConfig(validConfig)).toEqual(validConfig);
  });

  it("accepts a valid config with FieldSelector title", () => {
    const config = {
      ...validConfig,
      feed: { title: { selector: "h1" } },
    };
    expect(validateParserConfig(config)).toEqual(config);
  });

  it("accepts optional fields when present and valid", () => {
    const config = {
      ...validConfig,
      fields: {
        ...validConfig.fields,
        description: { selector: ".desc" },
        pubDate: { selector: "time", attr: "datetime" },
        author: { selector: ".author" },
        category: { selector: ".tag" },
        image: { selector: "img", attr: "src" },
      },
    };
    expect(validateParserConfig(config)).toEqual(config);
  });

  it("accepts FieldSelector with html: true", () => {
    const config = {
      ...validConfig,
      fields: {
        ...validConfig.fields,
        description: { selector: ".desc", html: true },
      },
    };
    expect(validateParserConfig(config)).toEqual(config);
  });

  it("throws on null input", () => {
    expect(() => validateParserConfig(null)).toThrow("must be an object");
  });

  it("throws on non-object input", () => {
    expect(() => validateParserConfig("string")).toThrow("must be an object");
  });

  it("throws on missing itemSelector", () => {
    expect(() =>
      validateParserConfig({ feed: { title: "T" }, fields: {} })
    ).toThrow("itemSelector");
  });

  it("throws on empty itemSelector", () => {
    expect(() =>
      validateParserConfig({
        itemSelector: "",
        feed: { title: "T" },
        fields: { title: { selector: "h2" }, link: { selector: "a" } },
      })
    ).toThrow("itemSelector");
  });

  it("throws on missing feed", () => {
    expect(() =>
      validateParserConfig({ itemSelector: ".x", fields: {} })
    ).toThrow("feed");
  });

  it("throws on missing feed.title", () => {
    expect(() =>
      validateParserConfig({
        itemSelector: ".x",
        feed: {},
        fields: {
          title: { selector: "h2" },
          link: { selector: "a", attr: "href" },
        },
      })
    ).toThrow("feed.title");
  });

  it("throws on feed.title being a number", () => {
    expect(() =>
      validateParserConfig({
        itemSelector: ".x",
        feed: { title: 123 },
        fields: {
          title: { selector: "h2" },
          link: { selector: "a", attr: "href" },
        },
      })
    ).toThrow("feed.title must be a string or FieldSelector");
  });

  it("throws on missing fields", () => {
    expect(() =>
      validateParserConfig({ itemSelector: ".x", feed: { title: "T" } })
    ).toThrow("fields");
  });

  it("throws on missing fields.title", () => {
    expect(() =>
      validateParserConfig({
        itemSelector: ".x",
        feed: { title: "T" },
        fields: { link: { selector: "a", attr: "href" } },
      })
    ).toThrow("fields.title");
  });

  it("throws on missing fields.link", () => {
    expect(() =>
      validateParserConfig({
        itemSelector: ".x",
        feed: { title: "T" },
        fields: { title: { selector: "h2" } },
      })
    ).toThrow("fields.link");
  });

  it("throws when field selector is missing selector property", () => {
    expect(() =>
      validateParserConfig({
        itemSelector: ".x",
        feed: { title: "T" },
        fields: { title: { attr: "href" }, link: { selector: "a" } },
      })
    ).toThrow("selector must be a string");
  });

  it("throws when field attr is not a string", () => {
    expect(() =>
      validateParserConfig({
        itemSelector: ".x",
        feed: { title: "T" },
        fields: {
          title: { selector: "h2", attr: 123 },
          link: { selector: "a" },
        },
      })
    ).toThrow("attr must be a string");
  });

  it("throws when field html is not a boolean", () => {
    expect(() =>
      validateParserConfig({
        itemSelector: ".x",
        feed: { title: "T" },
        fields: {
          title: { selector: "h2", html: "yes" },
          link: { selector: "a" },
        },
      })
    ).toThrow("html must be a boolean");
  });
});
