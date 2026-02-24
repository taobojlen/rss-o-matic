#!/usr/bin/env bash
set -euo pipefail

set -a
source "${BASH_SOURCE[0]%/*}/../.env"
set +a

pnpm exec posthog-cli sourcemap inject --directory .output/public --ignore '**/node_modules/**' --release-name rss-o-matic
pnpm exec posthog-cli sourcemap inject --directory .output/server --ignore '**/node_modules/**' --release-name rss-o-matic
pnpm exec posthog-cli sourcemap upload --directory .output --ignore '**/node_modules/**' --delete-after
