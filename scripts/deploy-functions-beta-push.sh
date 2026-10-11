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
# Admin Face ID step-up signing key (HMAC). Generated once into gitignored secrets/, never echoed.
STEPUP_FILE="${STEPUP_FILE:-$ROOT/secrets/stepup-secret.txt}"
if [ ! -s "$STEPUP_FILE" ]; then
  umask 077
  node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64url"))' > "$STEPUP_FILE"
  echo "generated: $STEPUP_FILE"
fi
$FB functions:secrets:set STEPUP_SECRET --project eddy-s-hell --data-file "$STEPUP_FILE" --non-interactive --force >/dev/null
echo "secret set: STEPUP_SECRET"
$FB deploy --only functions --project eddy-s-hell --non-interactive --force
