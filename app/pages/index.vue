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

interface DiscoveredFeed {
  url: string
  title?: string
  feedType: 'rss' | 'atom' | 'json'
}

type GenerateResponse =
  | { type: 'generated'; feedId: string; feedUrl: string; preview: Preview; parserConfig?: object; feedType?: 'snapshot' }
  | { type: 'existing_feed'; existingFeeds: DiscoveredFeed[] }
  | { type: 'unsuitable'; reason: string }
  | { type: 'snapshot_available'; reason: string; contentSelector: string; suggestedTitle: string }

interface RecentFeed {
  id: string
  title: string | null
  url: string
  feedUrl: string
  createdAt: string
}

interface PopularFeed {
  id: string
  title: string | null
  url: string
  feedUrl: string
}

type AppStep = 'idle' | 'loading' | 'preview' | 'existing_feed' | 'unsuitable' | 'snapshot_available' | 'error'

const { data: recentFeeds, refresh: refreshRecentFeeds } = await useFetch<RecentFeed[]>('/api/feeds')
const { data: popularFeeds } = await useFetch<PopularFeed[]>('/api/feeds/popular')

const url = ref('')
const step = ref<AppStep>('idle')
const generatedData = ref<Extract<GenerateResponse, { type: 'generated' }> | null>(null)
const existingFeeds = ref<DiscoveredFeed[]>([])
const unsuitableReason = ref('')
const snapshotData = ref<{ contentSelector: string; suggestedTitle: string } | null>(null)
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
  generatedData.value = null
  existingFeeds.value = []
  unsuitableReason.value = ''
  errorMessage.value = ''
  progress.start()

  try {
    const res = await $fetch<GenerateResponse>('/api/generate', {
      method: 'POST',
      body: { url: url.value.trim() },
    })

    if (res.type === 'existing_feed') {
      progress.reset()
      existingFeeds.value = res.existingFeeds
      step.value = 'existing_feed'
    } else if (res.type === 'snapshot_available') {
      progress.reset()
      unsuitableReason.value = res.reason
      snapshotData.value = {
        contentSelector: res.contentSelector,
        suggestedTitle: res.suggestedTitle,
      }
      step.value = 'snapshot_available'
    } else if (res.type === 'unsuitable') {
      progress.reset()
      unsuitableReason.value = res.reason
      step.value = 'unsuitable'
    } else {
      progress.finish()
      generatedData.value = res
      // Brief pause so the user sees the "done" checkmark
      await new Promise(resolve => setTimeout(resolve, 1500))
      step.value = 'preview'
      refreshRecentFeeds()
    }
  } catch (err: any) {
    progress.reset()
    errorMessage.value =
      err?.data?.message || err?.statusMessage || err?.message || 'Something went wrong'
    errorStatusCode.value = err?.data?.statusCode || err?.statusCode || null
    step.value = 'error'
  }
}

async function handleCreateSnapshotFeed() {
  if (!snapshotData.value) return
  step.value = 'loading'
  progress.start()

  try {
    const res = await $fetch<Extract<GenerateResponse, { type: 'generated' }>>('/api/generate-snapshot', {
      method: 'POST',
      body: {
        url: url.value.trim(),
        contentSelector: snapshotData.value.contentSelector,
        suggestedTitle: snapshotData.value.suggestedTitle,
      },
    })

    progress.finish()
    generatedData.value = res
    await new Promise(resolve => setTimeout(resolve, 1500))
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
  if (!generatedData.value) return
  const fullUrl = `${origin.value}${generatedData.value.feedUrl}`
  navigator.clipboard.writeText(fullUrl)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

function handleCopyFeedUrl(feedUrl: string) {
  navigator.clipboard.writeText(feedUrl)
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

const unsuitableIssueUrl = computed(() => {
  const title = `URL incorrectly flagged as unsuitable: ${url.value.trim()}`
  const body = [
    '**URL:** `' + url.value.trim() + '`',
    '**Reason given:** ' + unsuitableReason.value,
    '',
    '---',
    '*Please describe what kind of feed you expected from this page.*',
  ].join('\n')
  const params = new URLSearchParams({ title, body, labels: 'bug' })
  return `https://github.com/taobojlen/rss-o-matic/issues/new?${params}`
})

function handleReset() {
  step.value = 'idle'
  url.value = ''
  generatedData.value = null
  existingFeeds.value = []
  unsuitableReason.value = ''
  snapshotData.value = null
  errorMessage.value = ''
  errorStatusCode.value = null
  copied.value = false
  progress.reset()
}
</script>

<template>
  <p v-if="step === 'idle' || step === 'loading'" class="hero-description">
    Got a favorite website with no RSS feed? Just punch in the URL and our
    robots will manufacture one for you.
  </p>

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
        <Transition name="label-fade" mode="out-in">
          <span class="step-label" :key="progress.analyzingLabel.value">{{ progress.analyzingLabel.value }}</span>
        </Transition>
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
        <span class="step-label">Coming in loud and clear!</span>
      </div>
    </div>

    <p class="progress-hint">Hang tight &mdash; good feeds take a moment</p>
  </div>

  <div v-if="step === 'existing_feed'" class="existing-feed-box">
    <h2 class="existing-feed-heading">Good news, partner!</h2>
    <p class="existing-feed-message">
      This site already broadcasts {{ existingFeeds.length === 1 ? 'a feed' : 'feeds' }} loud and clear. No need for our machines!
    </p>
    <ul class="existing-feed-list">
      <li v-for="(feed, i) in existingFeeds" :key="i" class="existing-feed-item">
        <div class="existing-feed-url-row">
          <span class="feed-type-badge">{{ feed.feedType.toUpperCase() }}</span>
          <a :href="feed.url" target="_blank" rel="noopener noreferrer" class="existing-feed-link">
            {{ feed.title || feed.url }}
          </a>
        </div>
        <div class="existing-feed-actions">
          <code class="existing-feed-url">{{ feed.url }}</code>
          <button class="btn btn-secondary btn-sm" @click="handleCopyFeedUrl(feed.url)">
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </li>
    </ul>
    <div class="actions">
      <button class="btn btn-secondary" @click="handleReset">
        Try Another URL
      </button>
    </div>
  </div>

  <div v-if="step === 'unsuitable'" class="unsuitable-box">
    <h2 class="unsuitable-heading">Our robots refused!</h2>
    <p class="unsuitable-hint">
      RSS-O-Matic works best on pages with a list of posts, articles, or updates.
      Try submitting the blog index or news listing page instead.
    </p>
    <div class="error-actions">
      <button class="btn btn-secondary" @click="handleReset">
        Try Another URL
      </button>
      <a :href="unsuitableIssueUrl" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
        Report a Problem
      </a>
    </div>
  </div>

  <div v-if="step === 'snapshot_available'" class="unsuitable-box">
    <h2 class="unsuitable-heading">No feed signal&hellip; but we're picking up something!</h2>
    <p class="unsuitable-hint">
      This page doesn't have a list of items we can tune into, but it looks like
      it gets updated from time to time. We can keep an eye on it and drop a new
      item in your feed whenever the content changes.
    </p>
    <div class="error-actions">
      <button class="btn btn-primary" @click="handleCreateSnapshotFeed">
        Create Feed
      </button>
      <button class="btn btn-secondary" @click="handleReset">
        Try Another URL
      </button>
    </div>
  </div>

  <div v-if="step === 'preview' && generatedData">
    <div class="feed-url-box">
      <code>{{ origin }}{{ generatedData.feedUrl }}</code>
      <button class="btn btn-secondary" @click="handleCopy">
        {{ copied ? 'Copied!' : 'Copy' }}
      </button>
    </div>

    <template v-if="generatedData.feedType === 'snapshot'">
      <p class="section-label">Monitoring station tuned in!</p>
      <p class="unsuitable-hint">
        We've captured the current state of this page. Whenever the content
        changes and your reader checks in, you'll get a fresh item in the feed.
      </p>
      <ul v-if="generatedData.preview.items.length" class="items-list">
        <li v-for="(item, i) in generatedData.preview.items" :key="i">
          <h3>
            <a :href="item.link" target="_blank" rel="noopener noreferrer">
              {{ item.title }}
            </a>
          </h3>
          <div v-if="item.description" class="desc">
            {{
              item.description.length > 200
                ? item.description.slice(0, 200) + '...'
                : item.description
            }}
          </div>
        </li>
      </ul>
    </template>

    <template v-else>
      <p class="section-label">
        Preview ({{ generatedData.preview.items.length }} items from "{{ generatedData.preview.title }}")
      </p>
      <ul class="items-list">
        <li v-for="(item, i) in generatedData.preview.items.slice(0, 5)" :key="i">
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
        <pre>{{ JSON.stringify(generatedData.parserConfig, null, 2) }}</pre>
      </details>
    </template>

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

  <div class="feeds-columns">
    <section v-if="popularFeeds?.length" class="popular-feeds">
      <h2 class="section-label">Popular Feeds</h2>
      <ul class="popular-feeds-list">
        <li v-for="feed in popularFeeds" :key="feed.id">
          <a :href="feed.feedUrl" class="popular-feed-title">
            {{ feed.title || feed.url }}
          </a>
          <span class="popular-feed-source">{{ feed.url }}</span>
        </li>
      </ul>
    </section>

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
  </div>
</template>
