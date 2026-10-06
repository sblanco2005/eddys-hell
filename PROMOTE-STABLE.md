# Promote beta → stable (friends)

Beta (live): https://eddy-s-hell-beta.web.app/
Stable (friends): https://eddy-s-hell.web.app/
Stable rollback tag: `v1.0.0` (do not move)
Freeze branch: `stable` @ `v1.0.0`

## This build (already on `main` + beta Hosting, tip `feab3d7`)
Since last promote (PR #1 / `7b7eb51`, 2026-09-27):

- Admin 4-step flow: Pick → Stage next week → Compress & Upload (Firestore job `jobs/compressUpload`, Mac poller) → Swap live now
- Staging: `config/nextWeek` vs live `config/thisWeek` (live never replaced without `youtubeId`)
- Admin activity log (`activityLog`)
- Check-in activity feed + unseen badge (**beta host only** today)
- Web Push for check-ins (**beta host only**; box/Mac poller until Blaze Functions)
- Easy / Okay / Hard check-ins; guest chrome fixes; Safari BETA badge hide on stable
- Auth race fix (false “Auth not configured”)
- `scripts/compress-queue.mjs`, `scripts/lib/google-token.mjs`; job-status labels
- Firestore rules updates (`nextWeek`, `jobs`, `activityLog`, `checkinFeed`, `userPrefs`, `pushSubscriptions`)

Cache-bust on this tip: `?v=20261005-job-status` / build meta `beta-queue-labels-20261005`.

## Merge this PR when
Eddy Hell QA has smoke-tested beta and Santiago is ready to promote friends to stable Hosting.

## After merge (do not do these in this PR)
1. Deploy Firestore rules if not already live: `firebase deploy --only firestore:rules --project eddy-s-hell` (or `scripts/deploy-rules-rest.mjs`)
2. `scripts/deploy-hosting.sh stable` — **only** when ready (does **not** touch beta)
3. Smoke https://eddy-s-hell.web.app/ (no BETA badge; Admin 4-step; stage/swap; check-ins)
4. Keep `v1.0.0` for rollback; do not force-push or rewrite history

## Out of scope / follow-ups
- Enabling check-in feed + Web Push on stable (still gated by `isBetaHost()`)
- Optional Blaze + Cloud Function push sender (today: `scripts/notify-checkin-push.mjs` / `run-push-poller.sh`)
- PT email / Slack alerts
