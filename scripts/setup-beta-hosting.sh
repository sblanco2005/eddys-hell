#!/usr/bin/env bash
# One-shot: create beta Hosting site (if missing) and deploy known-good build to beta only.
# Requires: firebase login (or GOOGLE_APPLICATION_CREDENTIALS for a short-lived SA).
# Does NOT deploy stable. Does NOT move git tags.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.local/bin:$PATH"

if ! command -v firebase >/dev/null 2>&1; then
  echo "ERROR: firebase CLI missing" >&2
  exit 2
fi

if ! firebase login:list 2>/dev/null | rg -q '@'; then
  echo "AUTH_NEEDED: run: firebase login --no-localhost" >&2
  echo "Then: firebase login <authorizationCode>" >&2
  exit 3
fi

echo "Ensuring site eddy-s-hell-beta exists..."
if firebase hosting:sites:list --project eddy-s-hell 2>/dev/null | rg -q 'eddy-s-hell-beta'; then
  echo "Site already exists."
else
  firebase hosting:sites:create eddy-s-hell-beta --project eddy-s-hell
fi

# Apply target (idempotent with our .firebaserc)
firebase target:apply hosting beta eddy-s-hell-beta --project eddy-s-hell || true
firebase target:apply hosting stable eddy-s-hell --project eddy-s-hell || true

echo "Deploying to beta only..."
"$ROOT/scripts/deploy-hosting.sh" beta

echo
echo "Manual OAuth checklist (Console):"
echo "  Auth authorized domain: eddy-s-hell-beta.web.app"
echo "  JS origin: https://eddy-s-hell-beta.web.app"
echo "  Redirect: https://eddy-s-hell-beta.web.app/__/auth/handler"
echo "BETA_URL=https://eddy-s-hell-beta.web.app/"
