#!/usr/bin/env bash
set -euo pipefail
APP="${HOME}/eddys-hell-app"
OUT="${APP}/out"
echo "== free space before =="
df -h "$HOME" | tail -1
echo "== large media under out/ (before) =="
find "$OUT" -type f \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.mkv' -o -iname '*.m4v' \) -print -exec ls -lh {} \; 2>/dev/null || true
find /tmp -maxdepth 2 -type f \( -iname '*week*.mp4' -o -iname '*week*.mov' -o -iname '*eddy*.mp4' -o -iname '*eddy*.mov' -o -iname 'source*.mov' -o -iname 'source*.mp4' \) -print -exec ls -lh {} \; 2>/dev/null || true

# Prefer already-synced app; if BOX_DIST sync was copied in, use it
if [[ -d "$APP/dist" ]]; then
  echo "== publishing via scripts/publish-pages.sh =="
  bash "$APP/scripts/publish-pages.sh"
else
  echo "ERROR: $APP/dist missing" >&2
  exit 1
fi

echo "== deleting large workout media =="
rm -fv "$OUT/week.mp4" "$OUT/source-week.mov" "$OUT/source.mov" 2>/dev/null || true
# Any other large video copies under out/
find "$OUT" -type f \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.mkv' -o -iname '*.m4v' \) -print -delete 2>/dev/null || true
# /tmp leftovers matching workout exports
find /tmp -maxdepth 2 -type f \( -iname '*week*.mp4' -o -iname '*week*.mov' -o -iname 'source-week.mov' -o -iname 'source.mov' -o -iname 'week.mp4' \) -print -delete 2>/dev/null || true

echo "== remaining under out/ =="
ls -lah "$OUT" 2>/dev/null || echo "(no out dir)"
echo "== free space after =="
df -h "$HOME" | tail -1
echo "DONE"
