import type { SnapshotConfig } from "./schema";
import { extractContentText, hashContent } from "./snapshot";

export interface ChangeDetectionResult {
  changed: boolean;
  currentText: string;
  currentHash: string;
  summary?: string;
}

export async function detectChange(
  html: string,
  config: SnapshotConfig,
  previousText: string | null,
  previousHash: string | null
): Promise<ChangeDetectionResult> {
  const currentText = extractContentText(html, config);
  const currentHash = await hashContent(currentText);

  if (!previousHash) {
    return { changed: false, currentText, currentHash };
  }

  if (currentHash === previousHash) {
    return { changed: false, currentText, currentHash };
  }

  const summary = generateChangeSummary(previousText || "", currentText);
  return { changed: true, currentText, currentHash, summary };
}

function generateChangeSummary(oldText: string, newText: string): string {
  const oldSentences = new Set(
    oldText
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const newSentences = newText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const added = newSentences.filter((s) => !oldSentences.has(s));

  if (added.length > 0) {
    const preview = added.slice(0, 3).join(". ");
    return preview.length > 500 ? preview.slice(0, 497) + "..." : preview;
  }

  return "Page content was updated.";
}
