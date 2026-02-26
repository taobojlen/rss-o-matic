import { describe, it, expect } from "vitest";
import { formatSSE } from "~/server/utils/stream-events";

describe("formatSSE", () => {
  it("formats an event with JSON data", () => {
    const result = formatSSE("status", { phase: "fetch" });
    expect(result).toBe('event: status\ndata: {"phase":"fetch"}\n\n');
  });

  it("formats complex nested data", () => {
    const data = { selector: ".item", matchCount: 5, samples: ["a", "b"] };
    const result = formatSSE("tool_result", data);
    expect(result).toBe(
      `event: tool_result\ndata: ${JSON.stringify(data)}\n\n`
    );
  });

  it("handles string data values", () => {
    const result = formatSSE("error", { message: "Something broke" });
    expect(result).toBe(
      'event: error\ndata: {"message":"Something broke"}\n\n'
    );
  });

  it("each frame ends with double newline", () => {
    const result = formatSSE("test", {});
    expect(result.endsWith("\n\n")).toBe(true);
  });
});
