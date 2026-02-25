import { describe, it, expect } from "vitest";
import { detectChange } from "~/server/utils/change-detector";
import { hashContent } from "~/server/utils/snapshot";
import type { SnapshotConfig } from "~/server/utils/schema";

const config: SnapshotConfig = {
  contentSelector: "#content",
  feedTitle: "Updates",
};

const htmlV1 = `<html><body><div id="content"><p>Version one of the page.</p></div></body></html>`;
const htmlV2 = `<html><body><div id="content"><p>Version two with new information. We added a feature.</p></div></body></html>`;

describe("detectChange", () => {
  it("returns changed: false when no previous snapshot (initial baseline)", async () => {
    const result = await detectChange(htmlV1, config, null, null);
    expect(result.changed).toBe(false);
    expect(result.currentText).toBe("Version one of the page.");
    expect(result.currentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns changed: false when content is identical", async () => {
    const text = "Version one of the page.";
    const hash = await hashContent(text);
    const result = await detectChange(htmlV1, config, text, hash);
    expect(result.changed).toBe(false);
  });

  it("returns changed: true when content differs", async () => {
    const oldText = "Version one of the page.";
    const oldHash = await hashContent(oldText);
    const result = await detectChange(htmlV2, config, oldText, oldHash);
    expect(result.changed).toBe(true);
    expect(result.summary).toBeDefined();
  });

  it("does not flag whitespace-only changes as a change", async () => {
    const htmlWithSpaces = `<html><body><div id="content"><p>Version   one   of   the   page.</p></div></body></html>`;
    const text = "Version one of the page.";
    const hash = await hashContent(text);
    const result = await detectChange(htmlWithSpaces, config, text, hash);
    expect(result.changed).toBe(false);
  });

  it("generates a summary highlighting new content", async () => {
    const oldText = "Version one of the page.";
    const oldHash = await hashContent(oldText);
    const result = await detectChange(htmlV2, config, oldText, oldHash);
    expect(result.summary).toBeTruthy();
    expect(typeof result.summary).toBe("string");
  });
});
