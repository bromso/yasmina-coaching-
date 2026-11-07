#!/usr/bin/env bash
#
# Download the pre-built graphify knowledge graph (graphify-out/) from the
# `graphify-snapshot` GitHub release, so you don't have to re-run /graphify
# (which costs tokens) after cloning.
#
# Usage:  bash scripts/fetch-graph.sh
#
# Refresh the snapshot after re-running /graphify:
#   tar -czf graphify-out.tar.gz graphify-out
#   gh release upload graphify-snapshot graphify-out.tar.gz --clobber
#
set -euo pipefail

# The repo this checkout belongs to, so a clone of the boilerplate fetches its own snapshot.
REPO="${GRAPH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo bromso/boilerplate-bun)}"
TAG="graphify-snapshot"
ASSET="graphify-out.tar.gz"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"

if [ -d graphify-out ]; then
  echo "graphify-out/ already exists — remove it first to re-fetch. Skipping."
  exit 0
fi

echo "Downloading $ASSET from $REPO@$TAG ..."
if command -v gh >/dev/null 2>&1; then
  gh release download "$TAG" --repo "$REPO" --pattern "$ASSET" --output "$ASSET"
else
  curl -fsSL -o "$ASSET" \
    "https://github.com/$REPO/releases/download/$TAG/$ASSET"
fi

echo "Extracting ..."
tar -xzf "$ASSET"
rm -f "$ASSET"
echo "Done — graphify-out/ is ready."
