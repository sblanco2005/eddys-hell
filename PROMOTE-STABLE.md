# Promote beta → stable (friends)

Beta (live): https://eddy-s-hell-beta.web.app/
Stable rollback tag: `v1.0.0` (do not move)
Freeze branch: `stable` @ `v1.0.0`

## This build (already on `main` + beta Hosting)
- Firestore **Publish this week** + **Save rule** (`config/thisWeek`, `config/rule`)
- Auto-pick toggle, Admin Rule candidate + Reveal in Finder
- Shared check-ins; EddysHell archive paths

## Merge this PR when
Eddy Hell QA has smoke-tested beta and Santiago is ready to promote friends.

## After merge
1. `scripts/deploy-hosting.sh stable`
2. Smoke https://eddy-s-hell.web.app/
3. Keep `v1.0.0` for rollback

## Out of scope for this promote
- PT email
- Slack alerts (separate)
