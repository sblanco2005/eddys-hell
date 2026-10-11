#!/usr/bin/env bash
# Deploy Cloud Functions (check-in push) — requires Blaze on eddy-s-hell.
# Sets VAPID secrets from secrets/vapid.json via stdin (values never echoed), then deploys functions only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# firebase-tools 13.x hits "Premature close" here; 15.x works.
FB="${FIREBASE_BIN:-npx -y firebase-tools@latest}"
VAPID="${VAPID_JSON:-$ROOT/secrets/vapid.json}"
for pair in VAPID_PUBLIC:publicKey VAPID_PRIVATE:privateKey VAPID_SUBJECT:subject; do
  name="${pair%%:*}"; key="${pair##*:}"
  node -e 'const j=require(process.argv[1]); process.stdout.write(String(j[process.argv[2]]||""))' "$VAPID" "$key" \
    | $FB functions:secrets:set "$name" --project eddy-s-hell --data-file - --non-interactive --force >/dev/null
  echo "secret set: $name"
done
$FB deploy --only functions --project eddy-s-hell --non-interactive --force
