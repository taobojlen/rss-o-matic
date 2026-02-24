// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['@nuxthub/core', '@posthog/nuxt'],
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'd1',
      connection: { databaseId: '31ed3c46-030e-4448-b4ad-fe38e055cedf' },
    },
    kv: {
      driver: 'cloudflare-kv-binding',
      namespaceId: '405d94875ef249ff866a5314e032ff8f',
    },
  },
  runtimeConfig: {
    openrouterApiKey: '',
    openrouterModel: '',
  },
  app: {
    head: {
      title: 'RSS-O-Matic — Generate RSS feeds from any website',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.bunny.net' },
        { rel: 'stylesheet', href: 'https://fonts.bunny.net/css?family=bungee:400&display=swap' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  nitro: {
    preset: 'cloudflare_module',
    rollupConfig: {
      output: {
        sourcemapExcludeSources: false
      }
    }
  },
  sourcemap: {
    client: 'hidden',
    server: true,
  },
  posthogConfig: {
    publicKey: 'phc_CkAp2xq3iYAT1KT7v4TVAmDSR6zjQ0JoBnDpCL4AMS9', // Find it in project settings https://app.posthog.com/settings/project
    host: 'https://eu.i.posthog.com', // Optional: defaults to https://us.i.posthog.com. Use https://eu.i.posthog.com for EU region
    clientConfig: {
      capture_exceptions: true, // Enables automatic exception capture on the client side (Vue)
      defaults: '2026-01-30',
    },
    serverConfig: {
      enableExceptionAutocapture: true, // Enables automatic exception capture on the server side (Nitro)
    },
    sourcemaps: {
      enabled: true,
      projectId: '131385', // Your project ID from PostHog settings https://app.posthog.com/settings/environment#variables
      personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY ?? '', // Your personal API key from PostHog settings https://app.posthog.com/settings/user-api-keys (requires organization:read and error_tracking:write scopes)
      releaseName: 'rss-o-matic' // Optional: defaults to git repository name
    },
  }
})
