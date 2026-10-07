# Promote beta → stable (friends)

Beta (live): https://eddy-s-hell-beta.web.app/
Stable (friends): https://eddy-s-hell.web.app/
Stable rollback tag: `v1.0.0` (do not move)
Freeze branch: `stable` @ `v1.0.0`

## This build (feed + push on for prod too)
Since last promote (PR #1 / `7b7eb51`, 2026-09-27):

- Admin 4-step flow: Pick → Stage next week → Compress & Upload (Firestore job `jobs/compressUpload`, Mac poller) → Swap live now
- Staging: `config/nextWeek` vs live `config/thisWeek` (live never replaced without `youtubeId`)
- Admin activity log (`activityLog`)
- Check-in activity feed + unseen badge (**enabled on beta + stable**)
- Web Push for check-ins (**enabled on beta + stable**; box/Mac poller until Blaze Functions)
- Easy / Okay / Hard check-ins; guest chrome fixes; Safari BETA badge hide on stable
- Auth race fix (false “Auth not configured”)
- `scripts/compress-queue.mjs`, `scripts/lib/google-token.mjs`; job-status labels
- Firestore rules updates (`nextWeek`, `jobs`, `activityLog`, `checkinFeed`, `userPrefs`, `pushSubscriptions`)

Cache-bust: `?v=20261006-feed-push-prod` / build meta `feed-push-prod-20261006`.

## Gates
- Feed + push UI: `isCheckinFeedEnabled()` → Firebase Hosting (beta + stable) + localhost
- `enableCheckinPush()` no longer beta-only
- Yellow **BETA** badge + title still `isBetaHost()` only (hidden on `eddy-s-hell.web.app`)

## After merge / when deploying
1. Deploy Firestore rules if not already live: `firebase deploy --only firestore:rules --project eddy-s-hell`
2. `scripts/deploy-hosting.sh both` (or `stable` then `beta`) so both sites share the same gate-off code + cache-bust
3. Smoke https://eddy-s-hell.web.app/ — no BETA badge; feed/push available when signed in; Admin 4-step; stage/swap; check-ins
4. Keep `v1.0.0` for rollback; do not force-push or rewrite history; do not write `youtubeId: null` over live `thisWeek`

## Out of scope / follow-ups
- Optional Blaze + Cloud Function push sender (today: `scripts/notify-checkin-push.mjs` / `run-push-poller.sh`)
- PT email / Slack alerts
