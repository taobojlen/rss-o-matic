import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mock fns are available inside vi.mock factory (which is hoisted)
const { mockCaptureException, mockCapture, mockShutdown, mockGetRequestHeader } =
  vi.hoisted(() => ({
    mockCaptureException: vi.fn(),
    mockCapture: vi.fn(),
    mockShutdown: vi.fn(() => Promise.resolve()),
    mockGetRequestHeader: vi.fn(),
  }));

vi.mock("posthog-node", () => {
  return {
    PostHog: class {
      captureException = mockCaptureException;
      capture = mockCapture;
      shutdown = mockShutdown;
    },
  };
});

// Mock useRuntimeConfig
vi.stubGlobal("useRuntimeConfig", () => ({
  public: {
    posthog: {
      publicKey: "phc_test",
      host: "https://test.posthog.com",
    },
  },
}));

// Mock getRequestHeader (auto-imported by Nitro from h3)
vi.stubGlobal("getRequestHeader", mockGetRequestHeader);

// Mock crypto.randomUUID
const MOCK_UUID = "test-random-uuid";
vi.stubGlobal("crypto", { randomUUID: () => MOCK_UUID });

import {
  getPostHogSessionContext,
  captureServerException,
  capturePostHogEvent,
} from "~/server/utils/posthog";

describe("getPostHogSessionContext", () => {
  beforeEach(() => {
    mockGetRequestHeader.mockReset();
  });

  it("extracts sessionId and distinctId from request headers", () => {
    mockGetRequestHeader.mockImplementation(
      (_event: unknown, header: string) => {
        if (header === "x-posthog-session-id") return "sess-123";
        if (header === "x-posthog-distinct-id") return "dist-456";
        return undefined;
      }
    );

    const result = getPostHogSessionContext({ headers: {} } as any);

    expect(result.sessionId).toBe("sess-123");
    expect(result.distinctId).toBe("dist-456");
  });

  it("returns undefined for missing headers", () => {
    mockGetRequestHeader.mockReturnValue(undefined);

    const result = getPostHogSessionContext({ headers: {} } as any);

    expect(result.sessionId).toBeUndefined();
    expect(result.distinctId).toBeUndefined();
  });

  it("returns sessionId only when distinctId header is absent", () => {
    mockGetRequestHeader.mockImplementation(
      (_event: unknown, header: string) => {
        if (header === "x-posthog-session-id") return "sess-123";
        return undefined;
      }
    );

    const result = getPostHogSessionContext({ headers: {} } as any);

    expect(result.sessionId).toBe("sess-123");
    expect(result.distinctId).toBeUndefined();
  });
});

describe("captureServerException", () => {
  beforeEach(() => {
    mockCaptureException.mockReset();
    mockShutdown.mockReset();
    mockShutdown.mockResolvedValue(undefined);
  });

  it("uses client distinctId when session context is provided", async () => {
    const error = new Error("test");

    await captureServerException(error, {}, {
      sessionId: "sess-123",
      distinctId: "dist-456",
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      "dist-456",
      expect.objectContaining({
        $process_person_profile: false,
        $session_id: "sess-123",
      })
    );
  });

  it("includes $session_id in properties when provided", async () => {
    const error = new Error("test");

    await captureServerException(error, { path: "/api/test" }, {
      sessionId: "sess-123",
      distinctId: "dist-456",
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      "dist-456",
      expect.objectContaining({
        $session_id: "sess-123",
        path: "/api/test",
      })
    );
  });

  it("falls back to random UUID without session context", async () => {
    const error = new Error("test");

    await captureServerException(error);

    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      MOCK_UUID,
      expect.objectContaining({
        $process_person_profile: false,
      })
    );
    // Should NOT have $session_id
    const props = mockCaptureException.mock.calls[0][2];
    expect(props).not.toHaveProperty("$session_id");
  });

  it("falls back to random UUID when session context has no distinctId", async () => {
    const error = new Error("test");

    await captureServerException(error, {}, {
      sessionId: "sess-123",
      distinctId: undefined,
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      MOCK_UUID,
      expect.objectContaining({
        $session_id: "sess-123",
      })
    );
  });

  it("keeps $process_person_profile: false with session context", async () => {
    const error = new Error("test");

    await captureServerException(error, {}, {
      sessionId: "sess-123",
      distinctId: "dist-456",
    });

    const props = mockCaptureException.mock.calls[0][2];
    expect(props.$process_person_profile).toBe(false);
  });
});

describe("capturePostHogEvent", () => {
  beforeEach(() => {
    mockCapture.mockReset();
    mockShutdown.mockReset();
    mockGetRequestHeader.mockReset();
  });

  it("extracts session context from H3 event headers and includes $session_id", () => {
    mockGetRequestHeader.mockImplementation(
      (_event: unknown, header: string) => {
        if (header === "x-posthog-session-id") return "sess-789";
        if (header === "x-posthog-distinct-id") return "dist-012";
        return undefined;
      }
    );

    const h3Event = { context: {} } as any;
    capturePostHogEvent(h3Event, "test_event", { foo: "bar" });

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "dist-012",
        event: "test_event",
        properties: expect.objectContaining({
          $process_person_profile: false,
          $session_id: "sess-789",
          foo: "bar",
        }),
      })
    );
  });

  it("falls back to random UUID when no PostHog headers present", () => {
    mockGetRequestHeader.mockReturnValue(undefined);

    const h3Event = { context: {} } as any;
    capturePostHogEvent(h3Event, "test_event");

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: MOCK_UUID,
        event: "test_event",
      })
    );
    // Should NOT have $session_id
    const props = mockCapture.mock.calls[0][0].properties;
    expect(props).not.toHaveProperty("$session_id");
  });
});
