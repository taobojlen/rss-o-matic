#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${BASH_SOURCE[0]%/*}/../.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

WRANGLER_CONFIG=".output/server/wrangler.json"
WRANGLER_BUNDLE=".output/wrangler-bundle"

# === Client sourcemaps (uploaded from Nitro output — these are served as-is) ===
pnpm exec posthog-cli sourcemap inject --directory .output/public --ignore '**/node_modules/**' --release-name rss-o-matic
pnpm exec posthog-cli sourcemap upload --directory .output/public --ignore '**/node_modules/**' --delete-after

# === Server sourcemaps ===
# Wrangler re-bundles the Nitro output into a single index.js, so sourcemaps
# must be generated from the final wrangler bundle, not the intermediate chunks.

# 1. Enable sourcemap generation in the auto-generated wrangler config
node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$WRANGLER_CONFIG', 'utf8'));
cfg.upload_source_maps = true;
fs.writeFileSync('$WRANGLER_CONFIG', JSON.stringify(cfg, null, 2));
"

# 2. Build the wrangler bundle without deploying
#    Use absolute path because --outdir resolves relative to the config file
rm -rf "$WRANGLER_BUNDLE"
npx wrangler deploy --dry-run --outdir "$(pwd)/$WRANGLER_BUNDLE" --config "$WRANGLER_CONFIG"

# 3. Inject PostHog release markers and upload sourcemaps from the bundle
pnpm exec posthog-cli sourcemap inject --directory "$WRANGLER_BUNDLE" --ignore '**/node_modules/**' --release-name rss-o-matic
pnpm exec posthog-cli sourcemap upload --directory "$WRANGLER_BUNDLE" --ignore '**/node_modules/**' --delete-after

# 4. Point wrangler config at the injected bundle for the real deploy
ENTRY_FILE=$(basename "$(ls "$WRANGLER_BUNDLE"/*.js | head -1)")
node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$WRANGLER_CONFIG', 'utf8'));
cfg.main = '../wrangler-bundle/$ENTRY_FILE';
delete cfg.upload_source_maps;
fs.writeFileSync('$WRANGLER_CONFIG', JSON.stringify(cfg, null, 2));
"
