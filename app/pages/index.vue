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

interface RecentFeed {
  id: string
  title: string | null
  url: string
  feedUrl: string
  createdAt: string
}

type AppStep = 'idle' | 'loading' | 'preview' | 'error'

const { data: recentFeeds, refresh: refreshRecentFeeds } = await useFetch<RecentFeed[]>('/api/feeds')

const url = ref('')
const step = ref<AppStep>('idle')
const data = ref<GenerateResult | null>(null)
const errorMessage = ref('')
const errorStatusCode = ref<number | null>(null)
const copied = ref(false)
const origin = ref('')
const progress = useGenerateProgress()

onMounted(() => {
  origin.value = window.location.origin
})

async function handleSubmit() {
  if (!url.value.trim()) return

  step.value = 'loading'
  data.value = null
  errorMessage.value = ''
  progress.start()

  try {
    const res = await $fetch<GenerateResult>('/api/generate', {
      method: 'POST',
      body: { url: url.value.trim() },
    })
    progress.finish()
    data.value = res
    // Brief pause so the user sees the "done" checkmark
    await new Promise(resolve => setTimeout(resolve, 600))
    step.value = 'preview'
    refreshRecentFeeds()
  } catch (err: any) {
    progress.reset()
    errorMessage.value =
      err?.data?.message || err?.statusMessage || err?.message || 'Something went wrong'
    errorStatusCode.value = err?.data?.statusCode || err?.statusCode || null
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

const githubIssueUrl = computed(() => {
  const title = `Feed generation failed for ${url.value.trim()}`
  const body = [
    '**URL:** `' + url.value.trim() + '`',
    '**Error:** ' + errorMessage.value,
    errorStatusCode.value ? '**Status code:** ' + errorStatusCode.value : '',
    '',
    '---',
    '*Any additional context you can provide (e.g. whether it worked before) would be helpful!*',
  ]
    .filter(Boolean)
    .join('\n')
  const params = new URLSearchParams({ title, body, labels: 'bug' })
  return `https://github.com/taobojlen/rss-o-matic/issues/new?${params}`
})

function handleReset() {
  step.value = 'idle'
  url.value = ''
  data.value = null
  errorMessage.value = ''
  errorStatusCode.value = null
  copied.value = false
  progress.reset()
}
</script>

<template>
  <header class="retro-header">
    <div class="retro-header-inner">
      <h1 class="retro-title">RSS-O-Matic</h1>
      <p class="retro-tagline">
        <span class="tagline-burst">Instant Feeds for the Modern Reader</span>
      </p>
    </div>
  </header>

  <div id="root">
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
        autofocus
      />
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="step === 'loading'"
      >
        {{ step === 'loading' ? 'Generating...' : 'Generate Feed' }}
      </button>
    </form>

    <div v-if="step === 'loading'" class="progress-panel">
      <div class="progress-steps">
        <div
          class="progress-step"
          :class="{
            active: progress.currentStep.value === 'fetching',
            completed: progress.completedSteps.value.has('fetching'),
          }"
        >
          <span class="step-indicator">
            <span v-if="progress.completedSteps.value.has('fetching')" class="step-check">&#10003;</span>
            <span v-else class="step-spinner" />
          </span>
          <span class="step-label">Dialing up the webpage...</span>
        </div>

        <div
          class="progress-step"
          :class="{
            active: progress.currentStep.value === 'analyzing',
            completed: progress.completedSteps.value.has('analyzing'),
            pending: !progress.completedSteps.value.has('fetching') && progress.currentStep.value !== 'analyzing',
          }"
        >
          <span class="step-indicator">
            <span v-if="progress.completedSteps.value.has('analyzing')" class="step-check">&#10003;</span>
            <span v-else-if="progress.currentStep.value === 'analyzing'" class="step-spinner" />
            <span v-else class="step-dot" />
          </span>
          <span class="step-label">{{ progress.analyzingLabel.value }}</span>
        </div>

        <div
          class="progress-step"
          :class="{
            active: progress.currentStep.value === 'done',
            completed: progress.completedSteps.value.has('done'),
            pending: progress.currentStep.value !== 'done',
          }"
        >
          <span class="step-indicator">
            <span v-if="progress.completedSteps.value.has('done')" class="step-check">&#10003;</span>
            <span v-else class="step-dot" />
          </span>
          <span class="step-label">Your feed is piping hot!</span>
        </div>
      </div>

      <p class="progress-hint">Hang tight &mdash; good feeds take a moment</p>
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
      <div class="error-actions">
        <button class="btn btn-primary" @click="handleReset">
          Try Again
        </button>
        <a :href="githubIssueUrl" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
          Report Issue
        </a>
      </div>
    </div>

    <section v-if="recentFeeds?.length" class="recent-feeds">
      <h2 class="section-label">Recent Feeds</h2>
      <ul class="recent-feeds-list">
        <li v-for="feed in recentFeeds" :key="feed.id">
          <a :href="feed.feedUrl" class="recent-feed-title">
            {{ feed.title || feed.url }}
          </a>
          <span class="recent-feed-source">{{ feed.url }}</span>
        </li>
      </ul>
    </section>

    <footer class="site-footer">
      <p>Made by <a href="https://btao.org/" target="_blank">Tao</a> | Contribute on <a href="https://github.com/taobojlen/rss-o-matic" target="_blank" rel="noopener noreferrer">GitHub</a></p>
    </footer>
  </div>
</template>
