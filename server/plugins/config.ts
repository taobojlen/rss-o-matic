export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()

  const missing: string[] = []
  if (!config.openrouterApiKey) missing.push('NUXT_OPENROUTER_API_KEY')
  if (!config.openrouterModel) missing.push('NUXT_OPENROUTER_MODEL')

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
})
