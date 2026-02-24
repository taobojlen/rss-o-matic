import * as cheerio from "cheerio";
import type { ParserConfig } from "./schema";

function validateCssSelector(selector: string, path: string): void {
  try {
    const $ = cheerio.load("<div></div>");
    $(selector);
  } catch {
    throw new Error(
      `${path} contains an invalid CSS selector: "${selector}"`
    );
  }
}

/**
 * Validate that a parsed JSON object conforms to the ParserConfig shape.
 * Throws descriptive errors if not.
 */
export function validateParserConfig(obj: unknown): ParserConfig {
  if (typeof obj !== "object" || obj === null) {
    throw new Error("Parser config must be an object");
  }

  const config = obj as Record<string, unknown>;

  if (typeof config.itemSelector !== "string" || !config.itemSelector) {
    throw new Error("Missing or invalid itemSelector");
  }
  validateCssSelector(config.itemSelector, "itemSelector");

  if (typeof config.feed !== "object" || config.feed === null) {
    throw new Error("Missing feed metadata");
  }

  const feed = config.feed as Record<string, unknown>;
  if (feed.title === undefined) {
    throw new Error("Missing feed.title");
  }
  // feed.title can be string or FieldSelector
  if (typeof feed.title === "object") {
    validateFieldSelector(feed.title, "feed.title");
  } else if (typeof feed.title !== "string") {
    throw new Error("feed.title must be a string or FieldSelector");
  }

  if (typeof config.fields !== "object" || config.fields === null) {
    throw new Error("Missing fields");
  }

  const fields = config.fields as Record<string, unknown>;

  // title and link are required
  validateFieldSelector(fields.title, "fields.title");
  validateFieldSelector(fields.link, "fields.link");

  // Optional fields: validate shape if present
  for (const key of ["description", "pubDate", "author", "category", "image"]) {
    if (fields[key] !== undefined) {
      validateFieldSelector(fields[key], `fields.${key}`);
    }
  }

  // Strip AI-level suitability fields that aren't part of ParserConfig
  const { unsuitable, unsuitableReason, ...parserConfig } = config;

  return parserConfig as unknown as ParserConfig;
}

function validateFieldSelector(val: unknown, path: string): void {
  if (typeof val !== "object" || val === null) {
    throw new Error(`${path} must be a FieldSelector object`);
  }
  const fs = val as Record<string, unknown>;
  if (typeof fs.selector !== "string") {
    throw new Error(`${path}.selector must be a string`);
  }
  if (fs.selector) {
    validateCssSelector(fs.selector, path);
  }
  if (fs.attr !== undefined && typeof fs.attr !== "string") {
    throw new Error(`${path}.attr must be a string if present`);
  }
  if (fs.html !== undefined && typeof fs.html !== "boolean") {
    throw new Error(`${path}.html must be a boolean if present`);
  }
}
