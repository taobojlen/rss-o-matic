import posthog from 'posthog-js'
import { defineNuxtPlugin } from '#app'

export default defineNuxtPlugin({
  name: 'posthog-client',
  setup(nuxtApp) {
    const config = useRuntimeConfig()
    const { publicKey, host } = config.public.posthog as {
      publicKey: string
      host: string
    }

    if (!window || posthog.__loaded) {
      return
    }

    posthog.init(publicKey, {
      api_host: host,
      capture_exceptions: true,
      defaults: '2026-01-30',
    })

    nuxtApp.hook('vue:error', (error, _instance, info) => {
      posthog.captureException(error, { info })
    })

    return {
      provide: {
        posthog: () => posthog,
      },
    }
  },
})
