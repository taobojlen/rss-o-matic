<script setup lang="ts">
interface NewsletterDetail {
  id: string
  title: string
  emailAddress: string
  feedUrl: string
  fullFeedUrl: string
  itemCount: number
  createdAt: string
}

const route = useRoute()
const feedId = route.params.id as string

const feed = ref<NewsletterDetail | null>(null)
const loading = ref(true)
const loadError = ref('')

const isEditingTitle = ref(false)
const editTitle = ref('')
const savingTitle = ref(false)
const saveError = ref('')

const showDeleteConfirm = ref(false)
const deleting = ref(false)
const deleteError = ref('')

const copiedField = ref<'email' | 'feed' | null>(null)
const origin = ref('')

onMounted(async () => {
  origin.value = window.location.origin
  await loadFeed()
})

async function loadFeed() {
  loading.value = true
  loadError.value = ''
  try {
    feed.value = await $fetch<NewsletterDetail>(`/api/newsletters/${feedId}`)
  } catch (err: any) {
    loadError.value =
      err?.data?.statusMessage || err?.message || 'Something went wrong'
  } finally {
    loading.value = false
  }
}

function startEditing() {
  if (!feed.value) return
  editTitle.value = feed.value.title
  isEditingTitle.value = true
  saveError.value = ''
}

function cancelEditing() {
  isEditingTitle.value = false
  editTitle.value = ''
  saveError.value = ''
}

async function saveTitle() {
  if (!editTitle.value.trim()) return
  savingTitle.value = true
  saveError.value = ''
  try {
    const updated = await $fetch<NewsletterDetail>(
      `/api/newsletters/${feedId}`,
      {
        method: 'PATCH',
        body: { title: editTitle.value.trim() },
      }
    )
    feed.value = updated
    isEditingTitle.value = false
  } catch (err: any) {
    saveError.value =
      err?.data?.statusMessage || err?.message || 'Could not save'
  } finally {
    savingTitle.value = false
  }
}

async function executeDelete() {
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch(`/api/newsletters/${feedId}`, { method: 'DELETE' })
    await navigateTo('/newsletter')
  } catch (err: any) {
    deleteError.value =
      err?.data?.statusMessage || err?.message || 'Could not delete'
    deleting.value = false
  }
}

function copyToClipboard(text: string, field: 'email' | 'feed') {
  navigator.clipboard.writeText(text)
  copiedField.value = field
  setTimeout(() => {
    copiedField.value = null
  }, 2000)
}

useHead({
  title: () => feed.value?.title ?? 'Newsletter Inbox',
})
</script>

<template>
  <div v-if="loading" class="newsletter-result" style="text-align: center;">
    <p class="newsletter-result-intro">Tuning in...</p>
  </div>

  <div v-else-if="loadError" class="error-box">
    <p>{{ loadError }}</p>
    <div class="error-actions">
      <NuxtLink to="/newsletter" class="btn btn-primary">
        Back to Newsletters
      </NuxtLink>
    </div>
  </div>

  <div v-else-if="feed" class="newsletter-result">
    <div v-if="!isEditingTitle" class="newsletter-detail-header">
      <h2 class="newsletter-result-heading">{{ feed.title }}</h2>
      <button class="btn btn-secondary btn-sm" @click="startEditing">
        Rename
      </button>
    </div>

    <form
      v-else
      class="inline-edit-form"
      @submit.prevent="saveTitle"
    >
      <input
        v-model="editTitle"
        type="text"
        class="inline-edit-input"
        maxlength="200"
        autofocus
        @keydown.escape="cancelEditing"
      />
      <button
        type="submit"
        class="btn btn-primary btn-sm"
        :disabled="savingTitle"
      >
        {{ savingTitle ? 'Saving...' : 'Save' }}
      </button>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        @click="cancelEditing"
      >
        Cancel
      </button>
    </form>
    <p v-if="saveError" class="save-error">{{ saveError }}</p>

    <p class="newsletter-result-intro">
      Subscribe to newsletters using this email address. Each incoming issue
      will appear in your Atom feed automatically.
    </p>

    <div class="newsletter-field">
      <label class="newsletter-field-label">Email Address</label>
      <div class="feed-url-box">
        <code>{{ feed.emailAddress }}</code>
        <button
          class="btn btn-secondary btn-sm"
          @click="copyToClipboard(feed.emailAddress, 'email')"
        >
          {{ copiedField === 'email' ? 'Copied!' : 'Copy' }}
        </button>
      </div>
    </div>

    <div class="newsletter-field">
      <label class="newsletter-field-label">Atom Feed URL</label>
      <div class="feed-url-box">
        <code>{{ origin }}{{ feed.feedUrl }}</code>
        <button
          class="btn btn-secondary btn-sm"
          @click="copyToClipboard(`${origin}${feed.feedUrl}`, 'feed')"
        >
          {{ copiedField === 'feed' ? 'Copied!' : 'Copy' }}
        </button>
      </div>
    </div>

    <p class="newsletter-meta">
      {{ feed.itemCount }} {{ feed.itemCount === 1 ? 'issue' : 'issues' }} received
      &middot; Created {{ new Date(feed.createdAt).toLocaleDateString() }}
    </p>

    <div class="actions">
      <NuxtLink to="/newsletter" class="btn btn-secondary">
        Create Another Inbox
      </NuxtLink>
      <button
        v-if="!showDeleteConfirm"
        class="btn btn-danger btn-sm"
        @click="showDeleteConfirm = true"
      >
        Decommission Inbox
      </button>
    </div>

    <div v-if="showDeleteConfirm" class="delete-confirm-box">
      <p>
        Are you sure, partner? This will permanently remove this inbox
        and all {{ feed.itemCount }} received
        {{ feed.itemCount === 1 ? 'issue' : 'issues' }}. This cannot be undone.
      </p>
      <p v-if="deleteError" class="save-error">{{ deleteError }}</p>
      <div class="error-actions">
        <button
          class="btn btn-danger-solid"
          :disabled="deleting"
          @click="executeDelete"
        >
          {{ deleting ? 'Decommissioning...' : 'Yes, Decommission It' }}
        </button>
        <button
          class="btn btn-secondary"
          @click="showDeleteConfirm = false"
        >
          Keep It
        </button>
      </div>
    </div>
  </div>
</template>
