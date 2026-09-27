#!/usr/bin/env bash
# Publish eddys-hell-app/dist to sblanco2005/eddys-hell (GitHub Pages)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
OWNER="sblanco2005"
REPO="eddys-hell"
FULL="$OWNER/$REPO"
BRANCH="gh-pages"

if [[ ! -d "$DIST" ]]; then
  echo "ERROR: dist/ missing. Build dist/ first." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "AUTH_NEEDED: gh CLI not installed" >&2
  exit 2
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "AUTH_NEEDED: gh not authenticated. Run: gh auth login" >&2
  exit 2
fi

# Ensure public repo exists
if ! gh repo view "$FULL" >/dev/null 2>&1; then
  echo "Creating public repo $FULL ..."
  gh repo create "$FULL" --public --description "Eddy's Hell — Thursday Workout Admin" || true
fi

WORK="$(mktemp -d /tmp/eh-pages-XXXXXX)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# Clone existing gh-pages or start fresh orphan
if gh api "repos/$FULL/branches/$BRANCH" >/dev/null 2>&1; then
  git clone --branch "$BRANCH" --single-branch "https://github.com/$FULL.git" "$WORK/repo"
  cd "$WORK/repo"
  find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
else
  mkdir -p "$WORK/repo"
  cd "$WORK/repo"
  git init
  git checkout -b "$BRANCH"
  git remote add origin "https://github.com/$FULL.git" 2>/dev/null || git remote set-url origin "https://github.com/$FULL.git"
fi

cp -a "$DIST"/. .
git remote set-url origin "https://github.com/$FULL.git" 2>/dev/null || true

git add -A
if git diff --cached --quiet; then
  echo "No content changes to publish."
else
  git -c user.email="sblanco2005@users.noreply.github.com" -c user.name="Santiago Blanco" \
    commit -m "Publish Eddy's Hell admin $(date -u +%Y-%m-%dT%H:%MZ)"
fi

gh auth setup-git 2>/dev/null || true
git push -u origin "$BRANCH" --force

# Enable Pages from gh-pages root
PAGES_JSON=$(gh api "repos/$FULL/pages" 2>/dev/null || true)
if [[ -z "$PAGES_JSON" ]]; then
  gh api -X POST "repos/$FULL/pages" \
    -f build_type=legacy \
    -F source[branch]="$BRANCH" \
    -F source[path]="/" \
    >/dev/null || true
else
  gh api -X PUT "repos/$FULL/pages" \
    -f build_type=legacy \
    -F source[branch]="$BRANCH" \
    -F source[path]="/" \
    >/dev/null 2>&1 || true
fi

LIVE="https://${OWNER}.github.io/${REPO}/"
echo "LIVE_URL=$LIVE"
