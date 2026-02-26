<script setup lang="ts">
interface NewsletterResponse {
  id: string
  title: string
  emailAddress: string
  feedUrl: string
  fullFeedUrl: string
}

type CreatorStep = 'form' | 'creating' | 'error'

const name = ref('')
const step = ref<CreatorStep>('form')
const errorMessage = ref('')

async function handleCreate() {
  if (!name.value.trim()) return
  step.value = 'creating'
  errorMessage.value = ''

  try {
    const res = await $fetch<NewsletterResponse>('/api/newsletters', {
      method: 'POST',
      body: { title: name.value.trim() },
    })
    await navigateTo(`/newsletters/${res.id}`)
  } catch (err: any) {
    errorMessage.value =
      err?.data?.message || err?.statusMessage || err?.message || 'Something went wrong'
    step.value = 'error'
  }
}

function handleReset() {
  step.value = 'form'
  name.value = ''
  errorMessage.value = ''
}
</script>

<template>
  <p v-if="step === 'form' || step === 'creating'" class="hero-description">
    Got a favorite newsletter stuck in your inbox? Give it a name and we'll
    set up a private mailbox that converts every issue into an Atom feed.
  </p>

  <form
    v-if="step === 'form' || step === 'creating'"
    class="url-form"
    @submit.prevent="handleCreate"
  >
    <input
      v-model="name"
      type="text"
      placeholder="e.g. My Tech Digests"
      :disabled="step === 'creating'"
      required
      autofocus
      maxlength="200"
    />
    <button
      type="submit"
      class="btn btn-primary"
      :disabled="step === 'creating'"
    >
      {{ step === 'creating' ? 'Setting Up...' : 'Create Inbox' }}
    </button>
    <p class="form-hint">Your mailbox is for your eyes only &mdash; no snooping, no sharing, no funny business.</p>
  </form>

  <div v-if="step === 'error'" class="error-box">
    <p>{{ errorMessage }}</p>
    <div class="error-actions">
      <button class="btn btn-primary" @click="handleReset">
        Try Again
      </button>
    </div>
  </div>
</template>
