<script setup lang="ts">
interface FeedItem {
  title: string
  link: string
  description?: string
  pubDate?: string
  author?: string
}

interface Preview {
  title: string
  description: string
  link: string
  items: FeedItem[]
}

interface GenerateResult {
  feedId: string
  feedUrl: string
  preview: Preview
  parserConfig: object
}

type AppStep = 'idle' | 'loading' | 'preview' | 'error'

const url = ref('')
const step = ref<AppStep>('idle')
const data = ref<GenerateResult | null>(null)
const errorMessage = ref('')
const copied = ref(false)
const origin = ref('')

onMounted(() => {
  origin.value = window.location.origin
})

async function handleSubmit() {
  if (!url.value.trim()) return

  step.value = 'loading'
  data.value = null
  errorMessage.value = ''

  try {
    const res = await $fetch<GenerateResult>('/api/generate', {
      method: 'POST',
      body: { url: url.value.trim() },
    })
    data.value = res
    step.value = 'preview'
  } catch (err: any) {
    errorMessage.value =
      err?.data?.message || err?.statusMessage || err?.message || 'Something went wrong'
    step.value = 'error'
  }
}

function handleCopy() {
  if (!data.value) return
  const fullUrl = `${origin.value}${data.value.feedUrl}`
  navigator.clipboard.writeText(fullUrl)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

function handleReset() {
  step.value = 'idle'
  url.value = ''
  data.value = null
  errorMessage.value = ''
  copied.value = false
}
</script>

<template>
  <div id="root">
    <header>
      <h1>RSS-O-Matic</h1>
      <p>Generate an RSS feed from any website using AI</p>
    </header>

    <form
      v-if="step === 'idle' || step === 'loading'"
      class="url-form"
      @submit.prevent="handleSubmit"
    >
      <input
        v-model="url"
        type="url"
        placeholder="https://example.com/blog"
        :disabled="step === 'loading'"
        required
      />
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="step === 'loading'"
      >
        {{ step === 'loading' ? 'Generating...' : 'Generate Feed' }}
      </button>
    </form>

    <div v-if="step === 'loading'" class="loading">
      <div class="spinner" />
      <p>Fetching page and analyzing structure...</p>
      <p style="font-size: 0.8rem; color: #555; margin-top: 0.5rem">
        This may take 10-30 seconds
      </p>
    </div>

    <div v-if="step === 'preview' && data">
      <div class="feed-url-box">
        <code>{{ origin }}{{ data.feedUrl }}</code>
        <button class="btn btn-secondary" @click="handleCopy">
          {{ copied ? 'Copied!' : 'Copy' }}
        </button>
      </div>

      <p class="section-label">
        Preview ({{ data.preview.items.length }} items from "{{ data.preview.title }}")
      </p>
      <ul class="items-list">
        <li v-for="(item, i) in data.preview.items.slice(0, 10)" :key="i">
          <h3>
            <a :href="item.link" target="_blank" rel="noopener noreferrer">
              {{ item.title }}
            </a>
          </h3>
          <div v-if="item.pubDate || item.author" class="meta">
            <span v-if="item.pubDate">{{ item.pubDate }}</span>
            <span v-if="item.pubDate && item.author"> &middot; </span>
            <span v-if="item.author">{{ item.author }}</span>
          </div>
          <div v-if="item.description" class="desc">
            {{
              item.description.length > 200
                ? item.description.slice(0, 200) + '...'
                : item.description
            }}
          </div>
        </li>
      </ul>

      <details class="config-toggle">
        <summary>View parser config (JSON)</summary>
        <pre>{{ JSON.stringify(data.parserConfig, null, 2) }}</pre>
      </details>

      <div class="actions">
        <button class="btn btn-secondary" @click="handleReset">
          Generate Another Feed
        </button>
      </div>
    </div>

    <div v-if="step === 'error'" class="error-box">
      <p>{{ errorMessage }}</p>
      <button class="btn btn-primary" @click="handleReset">
        Try Again
      </button>
    </div>
  </div>
</template>
