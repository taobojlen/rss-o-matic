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
  },
  app: {
    head: {
      title: 'RSS-O-Matic — Generate RSS feeds from any website',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
})
