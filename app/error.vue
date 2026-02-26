<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const is404 = computed(() => props.error.status === 404)

const heading = computed(() =>
  is404.value ? 'Off the Air' : 'Technical Difficulties',
)

const message = computed(() =>
  is404.value
    ? 'That frequency doesn\'t exist on our dial. The page you\'re looking for has drifted into the static.'
    : 'Our tubes have overheated! The engineering crew has been alerted. Please stand by.',
)

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div>
    <header class="retro-header">
      <div class="retro-header-inner">
        <h1 class="retro-title">RSS-O-Matic</h1>
        <p class="retro-tagline">
          <span class="tagline-burst">Instant Feeds for the Modern Reader</span>
        </p>
      </div>
    </header>

    <div id="root">
      <div class="error-page-box">
        <div class="error-page-code">{{ error.status }}</div>
        <h2 class="error-page-heading">{{ heading }}</h2>
        <p class="error-page-message">{{ message }}</p>
        <div class="error-page-actions">
          <button class="btn btn-primary" @click="goHome">
            Back to Home Base
          </button>
        </div>
      </div>

      <footer class="site-footer">
        <p>Est. 2026 | Assembled by <a href="https://btao.org/" target="_blank">Tao</a> | Contribute on <a href="https://github.com/taobojlen/rss-o-matic" target="_blank" rel="noopener noreferrer">GitHub</a></p>
      </footer>
    </div>
  </div>
</template>
