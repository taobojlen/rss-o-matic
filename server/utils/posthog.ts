import { PostHog } from "posthog-node";
import type { H3Event } from "h3";

/**
 * Capture an exception to PostHog from server-side code.
 * Creates a throwaway client, sends the event, and flushes.
 * Returns a promise that resolves when the event is sent.
 */
export async function captureServerException(
  error: unknown,
  props?: Record<string, unknown>
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

  client.captureException(error, crypto.randomUUID(), {
    $process_person_profile: false,
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

  client.capture({
    distinctId: crypto.randomUUID(),
    event: eventName,
    properties: {
      $process_person_profile: false,
      ...properties,
    },
  });

  const ctx = (h3Event as any)?.context?.cloudflare?.context;
  if (ctx?.waitUntil) {
    ctx.waitUntil(client.shutdown());
  }
}
