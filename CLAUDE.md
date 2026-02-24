This is a Nuxt 4 + NuxtHub app deployed to Cloudflare Workers.

## Commands

- `pnpm install` to install dependencies
- `pnpm dev` to start dev server
- `pnpm build` to build for production
- `pnpm deploy` to deploy to Cloudflare via NuxtHub

## Project structure

- `app/` - Frontend (Vue 3 pages, components, assets)
- `server/api/` - API routes (auto-prefixed with `/api`)
- `server/routes/` - Non-API server routes
- `server/utils/` - Server utilities (auto-imported)
- `server/db/schema.ts` - Drizzle ORM schema definition
- `server/db/migrations/` - SQL migrations

## Environment variables

- `NUXT_OPENROUTER_API_KEY` - Required. OpenRouter API key.
- `NUXT_OPENROUTER_MODEL` - Optional. Defaults to `anthropic/claude-sonnet-4`.
