import * as cheerio from "cheerio";
import type { SnapshotConfig } from "./schema";

export function extractContentText(
  html: string,
  config: SnapshotConfig
): string {
  const $ = cheerio.load(html);
  const $content = $(config.contentSelector);
  if ($content.length === 0) {
    return normalizeText($("body").text());
  }
  return normalizeText($content.text());
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function hashContent(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
