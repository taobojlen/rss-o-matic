// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['@nuxthub/core'],
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'd1',
      connection: { databaseId: '31ed3c46-030e-4448-b4ad-fe38e055cedf' },
    },
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
