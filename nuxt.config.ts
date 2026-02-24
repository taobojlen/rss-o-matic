// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['@nuxthub/core'],
  hub: {
    db: 'sqlite',
    kv: true,
  },
  runtimeConfig: {
    openrouterApiKey: '',
    openrouterModel: '',
    public: {
      posthog: {
        publicKey: 'phc_CkAp2xq3iYAT1KT7v4TVAmDSR6zjQ0JoBnDpCL4AMS9',
        host: 'https://eu.i.posthog.com',
      },
    },
  },
  app: {
    head: {
      title: 'RSS-O-Matic — Generate RSS feeds from any website',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='50' dominant-baseline='central' text-anchor='middle' font-size='100'>📻</text></svg>" },
        { rel: 'preconnect', href: 'https://fonts.bunny.net' },
        { rel: 'stylesheet', href: 'https://fonts.bunny.net/css?family=dela-gothic-one:400&display=swap' },
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
})
