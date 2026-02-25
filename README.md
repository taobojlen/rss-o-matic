# RSS-O-Matic

AI-powered Atom feed generator. Paste any website URL and get an Atom feed. Built with [Nuxt](https://nuxt.com) and [NuxtHub](https://hub.nuxt.com) for Cloudflare Workers.

## Setup

```bash
pnpm install
```

Create a `.env` file:

```
NUXT_OPENROUTER_API_KEY=your-key-here
NUXT_OPENROUTER_MODEL=anthropic/claude-sonnet-4
```

## Development

```bash
pnpm dev
```

## Deploy to Cloudflare Workers

Resource bindings (D1 database, KV namespace) are already configured in `nuxt.config.ts`. NuxtHub auto-generates `wrangler.json` at build time.

### 1. Set environment variables

```bash
npx wrangler secret put NUXT_OPENROUTER_API_KEY
```

The model (`NUXT_OPENROUTER_MODEL`) is configured as a plain variable in `wrangler.jsonc`.

### 2. Deploy

```bash
pnpm build && npx wrangler deploy
```

Or connect your GitHub repo to Cloudflare Workers for automatic deploys on push.
