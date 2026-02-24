import { PostHog } from 'posthog-node'

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const { publicKey, host } = config.public.posthog as {
    publicKey: string
    host: string
  }

  nitroApp.hooks.hook('error', (error, { event }) => {
    const client = new PostHog(publicKey, {
      host,
      flushInterval: 0,
      flushAt: 1,
    })

    const props: Record<string, unknown> = {
      $process_person_profile: false,
    }
    if (event?.path) {
      props.path = event.path
      props.$current_url = event.path
    }
    if (event?.method) {
      props.method = event.method
    }

    client.captureException(error, crypto.randomUUID(), props)

    const ctx = event?.context?.cloudflare?.context
    if (ctx?.waitUntil) {
      ctx.waitUntil(client.shutdown())
    }
  })
})
