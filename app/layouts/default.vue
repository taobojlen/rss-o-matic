<template>
  <header class="retro-header">
    <div class="retro-header-inner">
      <h1 class="retro-title">RSS-O-Matic</h1>
      <p class="retro-tagline">
        <span class="tagline-burst">Atomic Feeds for the Modern Reader</span>
      </p>
    </div>
    <div class="price-tag">
      <span class="price-tag-hole" />
      <span class="price-tag-label">Price</span>
      <span class="price-tag-amount">$0.00</span>
    </div>
  </header>

  <div id="root">
    <div class="tab-switcher">
      <NuxtLink to="/" class="tab-btn" :class="{ active: $route.path === '/' }">
        Generate from URL
      </NuxtLink>
      <NuxtLink to="/newsletter" class="tab-btn" :class="{ active: $route.path === '/newsletter' }">
        Newsletter to RSS
      </NuxtLink>
    </div>

    <slot />

    <footer class="site-footer">
      <p>Est. 2026 | Assembled by <a href="https://btao.org/" target="_blank">Tao</a> | Contribute on <a href="https://github.com/taobojlen/rss-o-matic" target="_blank" rel="noopener noreferrer">GitHub</a></p>
    </footer>
  </div>
</template>
