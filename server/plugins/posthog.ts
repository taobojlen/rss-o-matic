export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const client = usePostHogClient()

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
      ctx.waitUntil(client.flushAsync())
    }
  })
})
