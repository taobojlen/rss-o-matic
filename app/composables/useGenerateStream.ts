import { ref } from "vue";

export interface LogEntry {
  type: "status" | "tool_call" | "tool_result" | "ai_text" | "error";
  message: string;
  /** For ai_text entries, whether tokens are still streaming in */
  streaming?: boolean;
}

export function useGenerateStream() {
  const isStreaming = ref(false);
  const logEntries = ref<LogEntry[]>([]);
  const result = ref<unknown | null>(null);
  const error = ref<string | null>(null);

  // Index of the current streaming ai_text entry in logEntries, or -1 if none
  let activeTextEntryIndex = -1;

  let abortController: AbortController | null = null;

  function humanizeEvent(
    event: string,
    data: Record<string, unknown>
  ): LogEntry | null {
    switch (event) {
      case "status": {
        if (data.phase === "fetch") {
          return { type: "status", message: "Dialing up the webpage..." };
        }
        if (data.phase === "analyze") {
          const iter = data.iteration as number;
          if (iter === 1) {
            return {
              type: "status",
              message: "Feeding the page to the machine...",
            };
          }
          return {
            type: "status",
            message: "Recalibrating...",
          };
        }
        return null;
      }
      case "tool_call": {
        const selector = data.selector as string;
        const ctx = data.contextSelector as string | null;
        const attr = data.attr as string | null;
        let msg = `Testing selector: \`${selector}\``;
        if (ctx) msg += ` within \`${ctx}\``;
        if (attr) msg += ` [attr: ${attr}]`;
        return { type: "tool_call", message: msg };
      }
      case "tool_result": {
        const count = data.matchCount as number;
        const selector = data.selector as string;
        const fieldFound = data.fieldFound as string | undefined;
        if (count === 0) {
          return {
            type: "tool_result",
            message: `No dice — zero matches for \`${selector}\``,
          };
        }
        let msg = `${count} element${count !== 1 ? "s" : ""} found on the dial`;
        if (fieldFound) msg += ` (fields: ${fieldFound})`;
        return { type: "tool_result", message: msg };
      }
      case "result": {
        return { type: "status", message: "All dials read green!" };
      }
      case "error": {
        return { type: "error", message: data.message as string };
      }
      default:
        return null;
    }
  }

  function processSSEFrame(frame: string) {
    let eventType = "message";
    let dataStr = "";

    for (const line of frame.split("\n")) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7);
      } else if (line.startsWith("data: ")) {
        dataStr = line.slice(6);
      }
    }

    if (!dataStr) return;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataStr);
    } catch {
      return;
    }

    // Show streaming AI text tokens in the log
    if (eventType === "ai_text" && typeof data.text === "string") {
      // Append token to the active streaming entry, or create a new one
      if (activeTextEntryIndex >= 0) {
        const entries = [...logEntries.value];
        const prev = entries[activeTextEntryIndex]!;
        entries[activeTextEntryIndex] = {
          ...prev,
          message: prev.message + data.text,
        };
        logEntries.value = entries;
      } else {
        activeTextEntryIndex = logEntries.value.length;
        logEntries.value = [
          ...logEntries.value,
          { type: "ai_text", message: data.text, streaming: true },
        ];
      }
      return;
    }

    // Any non-ai_text event finalizes the current streaming text entry
    if (activeTextEntryIndex >= 0) {
      const entries = [...logEntries.value];
      const prev = entries[activeTextEntryIndex]!;
      entries[activeTextEntryIndex] = {
        ...prev,
        streaming: false,
      };
      logEntries.value = entries;
      activeTextEntryIndex = -1;
    }

    // Set final result
    if (eventType === "result") {
      result.value = data;
    }

    // Set error
    if (eventType === "error") {
      error.value = (data.message as string) || "Something went wrong";
    }

    // Add human-readable log entry
    const entry = humanizeEvent(eventType, data);
    if (entry) {
      logEntries.value = [...logEntries.value, entry];
    }
  }

  async function start(url: string) {
    // Reset state
    isStreaming.value = true;
    logEntries.value = [];
    result.value = null;
    error.value = null;
    activeTextEntryIndex = -1;

    abortController = new AbortController();

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let message = "Something went wrong";
        try {
          const errData = await response.json();
          message = errData?.message || errData?.statusMessage || message;
        } catch {
          // ignore parse errors
        }
        error.value = message;
        logEntries.value = [
          ...logEntries.value,
          { type: "error", message },
        ];
        isStreaming.value = false;
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        error.value = "Streaming not supported";
        isStreaming.value = false;
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double newline to find complete SSE frames
        const frames = buffer.split("\n\n");
        // Keep the last potentially incomplete frame in the buffer
        buffer = frames.pop() || "";

        for (const frame of frames) {
          if (frame.trim()) {
            processSSEFrame(frame);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        processSSEFrame(buffer);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — not an error
        return;
      }
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      error.value = message;
      logEntries.value = [
        ...logEntries.value,
        { type: "error", message },
      ];
    } finally {
      isStreaming.value = false;
      abortController = null;
    }
  }

  function reset() {
    abortController?.abort();
    isStreaming.value = false;
    logEntries.value = [];
    result.value = null;
    error.value = null;
    activeTextEntryIndex = -1;
  }

  return { isStreaming, logEntries, result, error, start, reset };
}
