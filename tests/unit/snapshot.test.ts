import { describe, it, expect } from "vitest";
import { extractContentText, hashContent } from "~/server/utils/snapshot";
import type { SnapshotConfig } from "~/server/utils/schema";

const SAMPLE_HTML = `
<html><body>
  <nav>Navigation links here</nav>
  <main id="content">
    <h1>Updates</h1>
    <p>We launched a new feature today. It's really great.</p>
    <p>Stay tuned for more updates.</p>
  </main>
  <footer>Footer content</footer>
</body></html>`;

const config: SnapshotConfig = {
  contentSelector: "#content",
  feedTitle: "Updates",
};

describe("extractContentText", () => {
  it("extracts text from the content selector area", () => {
    const text = extractContentText(SAMPLE_HTML, config);
    expect(text).toContain("We launched a new feature today");
    expect(text).toContain("Stay tuned for more updates");
  });

  it("excludes content outside the selector", () => {
    const text = extractContentText(SAMPLE_HTML, config);
    expect(text).not.toContain("Navigation links here");
    expect(text).not.toContain("Footer content");
  });

  it("normalizes whitespace", () => {
    const html = `<html><body><main id="content">
      Hello     world

      multiple    spaces
    </main></body></html>`;
    const text = extractContentText(html, config);
    expect(text).toBe("Hello world multiple spaces");
  });

  it("falls back to body when selector does not match", () => {
    const missingConfig: SnapshotConfig = {
      contentSelector: "#nonexistent",
      feedTitle: "Test",
    };
    const text = extractContentText(SAMPLE_HTML, missingConfig);
    expect(text).toContain("Navigation links here");
    expect(text).toContain("We launched a new feature today");
  });
});

describe("hashContent", () => {
  it("produces a hex string", async () => {
    const hash = await hashContent("hello world");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces consistent hashes for the same input", async () => {
    const hash1 = await hashContent("same content");
    const hash2 = await hashContent("same content");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different input", async () => {
    const hash1 = await hashContent("content version 1");
    const hash2 = await hashContent("content version 2");
    expect(hash1).not.toBe(hash2);
  });
});
