#!/usr/bin/env bash
# Deploy Eddy's Hell to Firebase Hosting targets: beta | stable | both
# Usage:
#   scripts/deploy-hosting.sh beta
#   scripts/deploy-hosting.sh stable
#   scripts/deploy-hosting.sh both
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-}"
if [[ -z "$TARGET" || ! "$TARGET" =~ ^(beta|stable|both)$ ]]; then
  echo "Usage: $0 {beta|stable|both}" >&2
  exit 1
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "ERROR: firebase CLI not found. Install: npm i -g firebase-tools" >&2
  exit 2
fi

sync_dist() {
  echo "Syncing root → dist/ ..."
  mkdir -p dist/data
  cp -f app.js auth.js index.html styles.css dist/
  cp -a data/. dist/data/
  touch dist/.nojekyll
  # Keep README/serve.sh in dist if present at root (Pages mirror parity)
  [[ -f README.md ]] && cp -f README.md dist/ || true
  [[ -f serve.sh ]] && cp -f serve.sh dist/ || true
}

sync_dist

case "$TARGET" in
  beta)
    echo "Deploying hosting:beta only (stable untouched) ..."
    firebase deploy --only hosting:beta --project eddy-s-hell
    echo "BETA_URL=https://eddy-s-hell-beta.web.app/"
    ;;
  stable)
    echo "Deploying hosting:stable ..."
    firebase deploy --only hosting:stable --project eddy-s-hell
    echo "STABLE_URL=https://eddy-s-hell.web.app/"
    ;;
  both)
    echo "Deploying hosting:beta and hosting:stable ..."
    firebase deploy --only hosting:beta,hosting:stable --project eddy-s-hell
    echo "BETA_URL=https://eddy-s-hell-beta.web.app/"
    echo "STABLE_URL=https://eddy-s-hell.web.app/"
    ;;
esac
