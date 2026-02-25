<script setup lang="ts">
interface NewsletterResponse {
  id: string
  title: string
  emailAddress: string
  feedUrl: string
  fullFeedUrl: string
}

type CreatorStep = 'form' | 'creating' | 'created' | 'error'

const name = ref('')
const step = ref<CreatorStep>('form')
const result = ref<NewsletterResponse | null>(null)
const errorMessage = ref('')
const copiedField = ref<'email' | 'feed' | null>(null)
const origin = ref('')

onMounted(() => {
  origin.value = window.location.origin
})

async function handleCreate() {
  if (!name.value.trim()) return
  step.value = 'creating'
  errorMessage.value = ''

  try {
    const res = await $fetch<NewsletterResponse>('/api/newsletters', {
      method: 'POST',
      body: { title: name.value.trim() },
    })
    result.value = res
    step.value = 'created'
  } catch (err: any) {
    errorMessage.value =
      err?.data?.message || err?.statusMessage || err?.message || 'Something went wrong'
    step.value = 'error'
  }
}

function copyToClipboard(text: string, field: 'email' | 'feed') {
  navigator.clipboard.writeText(text)
  copiedField.value = field
  setTimeout(() => {
    copiedField.value = null
  }, 2000)
}

function handleReset() {
  step.value = 'form'
  name.value = ''
  result.value = null
  errorMessage.value = ''
  copiedField.value = null
}
</script>

<template>
  <p v-if="step === 'form' || step === 'creating'" class="hero-description">
    Got a favorite newsletter stuck in your inbox? Give it a name and we'll
    set up a private mailbox that converts every issue into an RSS feed.
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
  </form>

  <div v-if="step === 'created' && result" class="newsletter-result">
    <h2 class="newsletter-result-heading">Your inbox is ready!</h2>
    <p class="newsletter-result-intro">
      Subscribe to newsletters using this email address. Each incoming issue
      will appear in your RSS feed automatically.
    </p>

    <div class="newsletter-field">
      <label class="newsletter-field-label">Email Address</label>
      <div class="feed-url-box">
        <code>{{ result.emailAddress }}</code>
        <button
          class="btn btn-secondary btn-sm"
          @click="copyToClipboard(result.emailAddress, 'email')"
        >
          {{ copiedField === 'email' ? 'Copied!' : 'Copy' }}
        </button>
      </div>
    </div>

    <div class="newsletter-field">
      <label class="newsletter-field-label">RSS Feed URL</label>
      <div class="feed-url-box">
        <code>{{ origin }}{{ result.feedUrl }}</code>
        <button
          class="btn btn-secondary btn-sm"
          @click="copyToClipboard(`${origin}${result.feedUrl}`, 'feed')"
        >
          {{ copiedField === 'feed' ? 'Copied!' : 'Copy' }}
        </button>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-secondary" @click="handleReset">
        Create Another Inbox
      </button>
    </div>
  </div>

  <div v-if="step === 'error'" class="error-box">
    <p>{{ errorMessage }}</p>
    <div class="error-actions">
      <button class="btn btn-primary" @click="handleReset">
        Try Again
      </button>
    </div>
  </div>
</template>
