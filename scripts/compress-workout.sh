#!/usr/bin/env bash
# Compress a workout video for YouTube upload (H.264/AAC ~720p).
# Usage:
#   ./scripts/compress-workout.sh /path/to/input.mov
#   ./scripts/compress-workout.sh /path/to/input.mov /path/to/out.mp4
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_OUT="$ROOT/out/week.mp4"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <input.mov|mp4> [output.mp4]" >&2
  echo "Default output: $DEFAULT_OUT" >&2
  exit 1
fi

INPUT="$1"
OUTPUT="${2:-$DEFAULT_OUT}"

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR: input not found: $INPUT" >&2
  exit 1
fi

FFMPEG_BIN="$(command -v ffmpeg || true)"
if [[ -z "$FFMPEG_BIN" && -x "$ROOT/bin/ffmpeg" ]]; then
  FFMPEG_BIN="$ROOT/bin/ffmpeg"
fi
if [[ -z "$FFMPEG_BIN" ]]; then
  echo "ERROR: ffmpeg not found. Install with: brew install ffmpeg" >&2
  echo "  (or place a binary at $ROOT/bin/ffmpeg)" >&2
  exit 2
fi
echo "Using ffmpeg: $FFMPEG_BIN"

mkdir -p "$(dirname "$OUTPUT")"

echo "Compressing:"
echo "  in:  $INPUT"
echo "  out: $OUTPUT"
echo "  preset: H.264 CRF 23 · max ~720p · AAC 128k · faststart"

# Scale down to 720p max height, keep aspect, even dimensions for H.264
"$FFMPEG_BIN" -y -i "$INPUT" \
  -c:v libx264 -preset medium -crf 23 \
  -vf "scale=-2:'min(720,ih)'" \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  "$OUTPUT"

echo "Done: $OUTPUT ($(du -h "$OUTPUT" | awk '{print $1}'))"
echo "Next: upload unlisted via YouTube Studio (see scripts/upload-youtube.md),"
echo "then paste the URL into Admin → This week's pick → YouTube video."
