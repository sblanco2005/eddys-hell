#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/.cache/checkin-push-poller.log"
# refresh token helper
refresh() {
  python3 - <<'PY'
import json, urllib.parse, urllib.request, time
cfg = json.load(open("/home/box/.config/configstore/firebase-tools.json"))
rt = cfg["tokens"]["refresh_token"]
data = urllib.parse.urlencode({
  "client_id": "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
  "client_secret": "j9iVZfS8kkCEFUPaAeJV0sAi",
  "grant_type": "refresh_token",
  "refresh_token": rt,
}).encode()
req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
with urllib.request.urlopen(req, timeout=30) as r:
  body = json.loads(r.read().decode())
cfg["tokens"]["access_token"] = body["access_token"]
if body.get("refresh_token"):
  cfg["tokens"]["refresh_token"] = body["refresh_token"]
cfg["tokens"]["expires_at"] = time.time()*1000 + body.get("expires_in",3600)*1000
json.dump(cfg, open("/home/box/.config/configstore/firebase-tools.json","w"), indent="\t")
PY
}
while true; do
  refresh 2>>"$LOG" || true
  echo "[$(date -Iseconds)] poll" >>"$LOG"
  node "$ROOT/scripts/notify-checkin-push.mjs" >>"$LOG" 2>&1 || true
  sleep 60
done
