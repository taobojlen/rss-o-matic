import posthog from 'posthog-js'
import { defineNuxtPlugin } from '#app'

export default defineNuxtPlugin({
  name: 'posthog-headers',
  dependsOn: ['posthog-client'],
  setup() {
    globalThis.$fetch = globalThis.$fetch.create({
      onRequest({ options, request }) {
        // Only add headers for same-origin requests (relative URLs)
        if (typeof request === 'string' && /^https?:\/\//.test(request)) {
          return
        }
        if (!posthog.__loaded) {
          return
        }

        const sessionId = posthog.get_session_id()
        const distinctId = posthog.get_distinct_id()

        const headers = new Headers(options.headers as HeadersInit | undefined)
        if (sessionId) {
          headers.set('X-PostHog-Session-Id', sessionId)
        }
        if (distinctId) {
          headers.set('X-PostHog-Distinct-Id', distinctId)
        }
        options.headers = headers
      },
    })
  },
})
