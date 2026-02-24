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

## Testing

- `pnpm test` - Run unit tests
- `pnpm test:watch` - Unit tests in watch mode
- `pnpm test:unit` - Unit tests explicitly
- `pnpm test:integration` - Integration tests (boots a Nuxt dev server)

Unit tests live in `tests/unit/`, integration tests in `tests/integration/`. Unit tests use plain Vitest (no Nuxt runtime). Integration tests use `@nuxt/test-utils` with `dev: true`.

**Follow red/green TDD when writing new code or fixing bugs:**

1. **Red**: Write a failing test first that captures the expected behavior or reproduces the bug.
2. **Green**: Write the minimum code to make the test pass.
3. **Refactor**: Clean up while keeping tests green.

Always run `pnpm test` after making changes to ensure nothing is broken.

## Environment variables

- `NUXT_OPENROUTER_API_KEY` - Required. OpenRouter API key.
- `NUXT_OPENROUTER_MODEL` - Required.

ALWAYS refer to the relevant docs when fixing a bug or implementing a new feature. This is always better than going off memory; things may have changed.

- [NuxtHub](https://hub.nuxt.com/llms.txt)
- [Nuxt](https://nuxt.com/llms.txt)
- [Cloudflare Workers](https://workers.cloudflare.com/llms.txt)
- [OpenRouter](https://openrouter.ai/docs/llms.txt)
- [PostHog](https://posthog.com/llms.txt)
