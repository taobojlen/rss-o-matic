<script setup lang="ts">
const serverError = ref<string | null>(null)

async function triggerServerError() {
  serverError.value = null
  try {
    await $fetch('/api/test-error')
  } catch (e: any) {
    serverError.value = e.data?.message || e.message
  }
}

function triggerClientError() {
  throw new Error('Test client error from /error page')
}
</script>

<template>
  <div style="max-width: 600px; margin: 2rem auto; font-family: monospace;">
    <h1>Error Test Page</h1>

    <section style="margin: 2rem 0;">
      <h2>Client Error</h2>
      <p>Throws an unhandled error in Vue (captured by posthog via vue:error hook).</p>
      <button @click="triggerClientError">Throw Client Error</button>
    </section>

    <section style="margin: 2rem 0;">
      <h2>Server Error</h2>
      <p>Calls /api/test-error which throws on the server (captured by posthog via Nitro error hook).</p>
      <button @click="triggerServerError">Trigger Server Error</button>
      <p v-if="serverError" style="color: red; margin-top: 0.5rem;">Server responded: {{ serverError }}</p>
    </section>
  </div>
</template>
