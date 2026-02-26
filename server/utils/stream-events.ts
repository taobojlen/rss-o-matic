export type StreamEvent =
  | { event: "status"; data: { phase: "fetch" } }
  | {
      event: "status";
      data: {
        phase: "analyze";
        iteration: number;
        maxIterations: number;
      };
    }
  | {
      event: "tool_call";
      data: {
        selector: string;
        contextSelector: string | null;
        attr: string | null;
      };
    }
  | {
      event: "tool_result";
      data: {
        selector: string;
        matchCount: number;
        fieldFound?: string;
        samples: string[];
      };
    }
  | { event: "ai_text"; data: { text: string } }
  | { event: "result"; data: unknown }
  | { event: "error"; data: { message: string } };

export function formatSSE(event: string, data: unknown): string {
  const json = JSON.stringify(data);
  return `event: ${event}\ndata: ${json}\n\n`;
}
