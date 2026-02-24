import { PostHog } from "posthog-node";

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
