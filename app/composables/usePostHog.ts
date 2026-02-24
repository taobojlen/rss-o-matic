import type { PostHog } from 'posthog-js'

export function usePostHog(): PostHog | undefined {
  const { $posthog } = useNuxtApp()
  return ($posthog as (() => PostHog) | undefined)?.()
}
