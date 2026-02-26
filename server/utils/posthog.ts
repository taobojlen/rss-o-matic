import { PostHog } from "posthog-node";
import type { H3Event } from "h3";

export interface PostHogSessionContext {
  sessionId: string | undefined;
  distinctId: string | undefined;
}

/**
 * Extract PostHog session context from incoming request headers.
 * The client-side plugin sends these headers with every API request.
 */
export function getPostHogSessionContext(event: H3Event): PostHogSessionContext {
  const sessionId = getRequestHeader(event, "x-posthog-session-id");
  const distinctId = getRequestHeader(event, "x-posthog-distinct-id");
  return { sessionId, distinctId };
}

let _client: PostHog | null = null;

/**
 * Get or create a shared PostHog client singleton.
 * Used by @posthog/ai OpenAI wrapper for LLM analytics.
 */
export function usePostHogClient(): PostHog {
  if (!_client) {
    const config = useRuntimeConfig();
    const { publicKey, host } = config.public.posthog as {
      publicKey: string;
      host: string;
    };
    _client = new PostHog(publicKey, {
      host,
      // Cloudflare Workers: flush immediately since there's no long-running process
      flushInterval: 0,
      flushAt: 1,
    });
  }
  return _client;
}

/**
 * Capture an exception to PostHog from server-side code.
 * Creates a throwaway client, sends the event, and flushes.
 * Returns a promise that resolves when the event is sent.
 */
export async function captureServerException(
  error: unknown,
  props?: Record<string, unknown>,
  sessionContext?: PostHogSessionContext
): Promise<void> {
  const config = useRuntimeConfig();
  const { publicKey, host } = config.public.posthog as {
    publicKey: string;
    host: string;
  };

  const client = new PostHog(publicKey, {
    host,
    flushInterval: 0,
    flushAt: 1,
  });

  const distinctId = sessionContext?.distinctId || crypto.randomUUID();

  client.captureException(error, distinctId, {
    $process_person_profile: false,
    ...(sessionContext?.sessionId ? { $session_id: sessionContext.sessionId } : {}),
    ...props,
  });

  await client.shutdown();
}

/**
 * Capture a custom event to PostHog from server-side code.
 * Fire-and-forget: uses waitUntil on Cloudflare Workers when available.
 */
export function capturePostHogEvent(
  h3Event: H3Event,
  eventName: string,
  properties: Record<string, unknown> = {}
) {
  const config = useRuntimeConfig();
  const { publicKey, host } = config.public.posthog as {
    publicKey: string;
    host: string;
  };

  const client = new PostHog(publicKey, {
    host,
    flushInterval: 0,
    flushAt: 1,
  });

  const { sessionId, distinctId: clientDistinctId } = getPostHogSessionContext(h3Event);
  const distinctId = clientDistinctId || crypto.randomUUID();

  client.capture({
    distinctId,
    event: eventName,
    properties: {
      $process_person_profile: false,
      ...(sessionId ? { $session_id: sessionId } : {}),
      ...properties,
    },
  });

  const ctx = (h3Event as any)?.context?.cloudflare?.context;
  if (ctx?.waitUntil) {
    ctx.waitUntil(client.shutdown());
  }
}
