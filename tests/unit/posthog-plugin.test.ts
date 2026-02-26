import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// Mock the posthog utilities
const mockCaptureServerException = vi.fn(() => Promise.resolve());
const mockGetPostHogSessionContext = vi.fn(() => ({
  sessionId: undefined,
  distinctId: undefined,
}));
vi.mock("~/server/utils/posthog", () => ({
  captureServerException: (...args: unknown[]) =>
    mockCaptureServerException(...args),
  getPostHogSessionContext: (...args: unknown[]) =>
    mockGetPostHogSessionContext(...args),
}));

// Capture the hook callback when the plugin registers
let errorHook: (error: unknown, context: { event?: any }) => void;
vi.stubGlobal(
  "defineNitroPlugin",
  (fn: (app: any) => void) => {
    fn({
      hooks: {
        hook: (name: string, cb: (...args: any[]) => void) => {
          if (name === "error") {
            errorHook = cb;
          }
        },
      },
    });
  }
);

describe("posthog nitro plugin", () => {
  beforeAll(async () => {
    await import("~/server/plugins/posthog");
  });

  beforeEach(() => {
    mockCaptureServerException.mockClear();
    mockGetPostHogSessionContext.mockReset();
    mockGetPostHogSessionContext.mockReturnValue({
      sessionId: undefined,
      distinctId: undefined,
    });
  });

  it("captures non-404 errors", () => {
    const error = new Error("Something broke");
    const event = {
      path: "/api/generate",
      method: "POST",
      context: {},
    };

    errorHook(error, { event });

    expect(mockCaptureServerException).toHaveBeenCalledOnce();
  });

  it("does not capture 404 errors", () => {
    const error = Object.assign(
      new Error("Page not found: /.aws/credentials"),
      { statusCode: 404 }
    );
    const event = {
      path: "/.aws/credentials",
      method: "GET",
      context: {},
    };

    errorHook(error, { event });

    expect(mockCaptureServerException).not.toHaveBeenCalled();
  });

  it("does not capture H3Error 404s", () => {
    const error = Object.assign(new Error("Not Found"), {
      statusCode: 404,
      statusMessage: "Not Found",
    });
    const event = {
      path: "/nonexistent",
      method: "GET",
      context: {},
    };

    errorHook(error, { event });

    expect(mockCaptureServerException).not.toHaveBeenCalled();
  });

  it("passes session context to captureServerException when headers are present", () => {
    const sessionContext = { sessionId: "sess-abc", distinctId: "dist-xyz" };
    mockGetPostHogSessionContext.mockReturnValue(sessionContext);

    const error = new Error("Something broke");
    const event = {
      path: "/api/generate",
      method: "POST",
      context: {},
    };

    errorHook(error, { event });

    expect(mockGetPostHogSessionContext).toHaveBeenCalledWith(event);
    expect(mockCaptureServerException).toHaveBeenCalledWith(
      error,
      expect.any(Object),
      sessionContext
    );
  });

  it("passes undefined session context when event is undefined", () => {
    const error = new Error("Something broke");

    errorHook(error, {});

    expect(mockGetPostHogSessionContext).not.toHaveBeenCalled();
    expect(mockCaptureServerException).toHaveBeenCalledWith(
      error,
      expect.any(Object),
      undefined
    );
  });
});
