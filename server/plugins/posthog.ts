import { captureServerException } from "../utils/posthog";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("error", (error, { event }) => {
    // Skip 404s — these are expected for non-existent paths (e.g. bot scans)
    if (error && typeof error === "object" && "statusCode" in error && (error as any).statusCode === 404) {
      return;
    }

    const props: Record<string, unknown> = {};
    if (event?.path) {
      props.path = event.path;
      props.$current_url = event.path;
    }
    if (event?.method) {
      props.method = event.method;
    }

    const done = captureServerException(error, props);

    const ctx = event?.context?.cloudflare?.context;
    if (ctx?.waitUntil) {
      ctx.waitUntil(done);
    }
  });
});
