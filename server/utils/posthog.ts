import { PostHog } from "posthog-node";

let _client: PostHog | null = null;

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
