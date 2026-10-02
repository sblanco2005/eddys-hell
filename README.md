# Eddy's Hell — Thursday Workout

Live (preferred for sign-in): **https://eddy-s-hell.web.app/**  
Mirror: https://sblanco2005.github.io/eddys-hell/ (may fail Google sign-in on many iPhones — use web.app)

Static app with Google sign-in (Firebase) — or localhost mock roles until Firebase is configured.

## Roles

| Role | Who | Sees |
|------|-----|------|
| **Guest** | Not signed in | Landing + “Sign in with Google” (workout title locked) |
| **Member** | Signed in + email in `data/members.json` | This week’s workout + check-in only |
| **Admin** | Email in `data/admins.json` | Admin · Rule + Members + dry-run + Accept + check-in list |

Admin allowlist: **`data/admins.json`** — currently `sblanco2005@gmail.com` only. Edit the `emails` array to add more.

PT summary destination: **`data/pt.json`**. Admin · Rule → **PT summary** lets you edit the email for Thursday check-in summaries, saves it to localStorage key `eddys-hell-pt-v1`, and downloads `pt.json` for publishing. Load order is repo `data/pt.json` first, then newer localStorage.

Member allowlist: **`data/members.json`**. Empty `emails` = **strict** — only admins can use the app. Anyone else who signs in is signed out with “Ask Santiago to add your email.” Admins are always allowed even if missing from the members list. Santiago should add friends’ emails (Admin · Rule → Members, or edit the JSON), then re-publish so other devices get the list.

Localhost debug: `?admin=1` grants admin UI **only on localhost / 127.0.0.1**. Disabled automatically on `*.github.io`.

## Run locally

```bash
./serve.sh
```

Open http://127.0.0.1:8777/

Without Firebase config, localhost shows **Continue as Admin / Member** mock buttons so you can test the role split.

## Firebase setup (Google sign-in on Pages)

1. Create a Firebase project at https://console.firebase.google.com/
2. Add a **Web** app; copy the config object.
3. Paste into `data/firebase-config.json` (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
4. Authentication → Sign-in method → enable **Google**.
5. Authentication → Settings → Authorized domains → add `sblanco2005.github.io` (and `localhost` for local testing). **Already configured** for project `eddy-s-hell`: `localhost`, `eddy-s-hell.firebaseapp.com`, `eddy-s-hell.web.app`, `sblanco2005.github.io`.
6. **Prefer Firebase Hosting** so the app origin matches `authDomain`: deploy `dist/` with `firebase deploy --only hosting` (project `eddy-s-hell`). Live URL: https://eddy-s-hell.web.app/
7. Optionally still publish the GitHub Pages mirror with `scripts/publish-pages.sh` (banner steers friends to web.app).

**GitHub Pages + mobile:** `signInWithRedirect` cannot restore the session when `authDomain` is `*.firebaseapp.com` (browsers partition that storage). The app uses **popup** sign-in on `*.github.io`. Allow popups for the site if the browser blocks them. Making redirect work would require self-hosting Firebase `/__/auth` helpers on `sblanco2005.github.io` and setting `authDomain` to that host, plus adding `https://sblanco2005.github.io/__/auth/handler` under Google Cloud → Credentials → OAuth 2.0 Web client → Authorized redirect URIs.

Until those keys are filled, production Pages shows **“Auth not configured”** and Google sign-in stays hidden. Localhost still has mock sign-in.

## This week’s pick (sharing with the group)

**Live source of truth (beta):** Cloud Firestore docs `config/thisWeek` and `config/rule`.
Members see `config/thisWeek` (YouTube embed). Admin **Save rule** writes `config/rule`.

**Stage vs live (pick is always manual):**
- **Pick again** (= dry-run) → **Reveal in Finder** → **Stage next week** — Santiago always does these himself. Never auto-picked by the scheduler.
- **Stage next week** (candidate with no `youtubeId`) → Firestore `config/nextWeek` + localStorage `eddys-hell-next-week-v1`. Toast: *Staged — live week stays until YouTube upload.* Does **not** write `config/thisWeek`.
- **Compress & Stage YouTube** (Admin, optional) pastes a URL/id onto staged `config/nextWeek` only (after Mac compress + unlisted upload done offline). If nothing is staged yet but a dry-run candidate exists, that candidate is staged **with** the `youtubeId` in one `stageNextWeek` call. Never publishes / never compresses in the browser. Toast: *YouTube staged on next week — live week unchanged.* API: `EddysHell.stageYoutubeOnly` / `saveYoutubeToStaged`.
- **Swap live now** (Admin, optional) calls `promoteStagedToLive` using the staged `youtubeId` (argument optional — omitted/null uses `staged.youtubeId`). No upload in that step. Enabled only when staged next week already has a video id. API: `EddysHell.swapLiveNow`.
- **Live `config/thisWeek`** updates only when the pick already has `youtubeId` (re-publish same pick, Swap live now, or `EddysHell.promoteAfterYoutubeUpload(youtubeId)` / `Auth.promoteStagedToLive`). Never writes `youtubeId: null` over a live doc.
- Hosting `data/this-week.json` via `set-this-week.js` still requires `youtubeId`.
- **Activity log** — Admin Non-live **Activity** list + Firestore `activityLog`. Manual stage/swap and Wednesday scheduler append the same shape (`source: manual|scheduler`). See below.
- **`rotateWeeks`** applies to **Pick again** dry-run filtering only. Wednesday does **not** skip a whole run just because rotate says “off week.”

Load order (live): **Firestore thisWeek → repo JSON → localStorage**. Staged is separate (`config/nextWeek`).

1. Admin **Pick again** → **Reveal** → **Stage next week** → `config/nextWeek` (live unchanged).
2. Optional: after Mac compress + unlisted YouTube upload, **Compress & Stage YouTube** saves the id on next week only. Optional: **Swap live now** promotes staged → live (no upload).
3. **Wednesday scheduler** (beta Hosting only; never stable/production) — never auto-picks / never writes a new nextWeek from the rule:
   - Compare staged `config/nextWeek` vs live `config/thisWeek` (by pickId/id).
   - **No staged** OR staged same as live → **skip** (Slack FYI to Santiago).
   - Staged ≠ live **and** staged already has `youtubeId` → **swap only** (promote to live). Do not re-upload.
   - Staged ≠ live **and** no `youtubeId` → **compress + YouTube unlisted upload + stage youtubeId on nextWeek, then promote/swap**.
   - Hard rule: never write `youtubeId: null` over live; never change live without a real `youtubeId`.
   - After successful YouTube upload, delete Mac media under `eddys-hell-app/out` (`week.mp4`, `source-week.mov`, `source.mov`).

### Activity log (Admin + Wednesday)

Firestore collection **`activityLog`** (admin read/create only). Each entry:

| field | notes |
|---|---|
| `at` | ISO timestamp (ET-ish / UTC ISO) |
| `action` | `compress_stage_youtube` \| `stage_youtube` \| `swap_live` \| `skip` \| `fail` |
| `source` | `manual` \| `scheduler` |
| `pickId` / `filename` / `title` | optional |
| `youtubeId` | optional |
| `detail` | short human string (e.g. `drive not mounted`, `promoted HR149`) |
| `actor` | email or `wednesday-job` |

Admin UI (**Next week staged → Activity**) shows the last ~30 entries newest first; refreshes on load and after stage/swap.

**Scheduler / agent** should append the same shape (best-effort; never block the main action):

```js
// From a signed-in admin browser session / console on beta:
await EddysHell.logActivity({
  action: "skip",            // or compress_stage_youtube | stage_youtube | swap_live | fail
  source: "scheduler",
  actor: "wednesday-job",
  pickId: null,
  detail: "drive not mounted", // when /Volumes/EddysHell is missing
});
```

Also available as `EddysHellAuth.logActivity(entry)` / `EddysHellAuth.bestEffortLogActivity(entry)`.

Wednesday should log:
- **skip** when `/Volumes/EddysHell` is not connected, or nothing new (no staged / same as live)
- **compress_stage_youtube** after compress + unlisted upload + stage youtubeId
- **swap_live** after promote
- **fail** on errors (include message in `detail`)

4. **Save rule** → Firestore `config/rule` (forces `autoPick: false`; Auto-pick UI is hidden/deprecated).
5. Optional: sync Hosting JSON via Mac routine / `scripts/deploy-hosting.sh` for offline bootstrap (beta only for experiments).

Seeded bootstrap sample may change with deploys; trust Firestore on beta after Publish.

## Members (friend allowlist)

1. Sign in as admin → **Admin · Rule** → **Members**.
2. Add emails (normalized lowercase/trim), remove as needed, hit **Save members**.
3. Save writes `localStorage` key `eddys-hell-members-v1` and **downloads `members.json`**.
4. Drop into `data/members.json` and re-run `scripts/publish-pages.sh` so friends on other devices are allowed (localStorage alone won’t sync).

Load order: repo `data/members.json` first, then override from localStorage if its `updatedAt` is newer.

## Check-ins (friend accountability)

Friends (members on the allowlist) sign in with Google, watch this week’s workout, then tap **Check in — I finished**. Optional notes are fine.

Data shape: `{ email, displayName, pickId, at, notes }`.

- **Preferred store:** Cloud Firestore collection `checkins` (doc id `pickId__email`) when Firebase Auth + Firestore are available — syncs across devices so admin sees everyone’s check-ins.
- **Fallback:** `localStorage` key `eddys-hell-checkins-v1` (same browser only) if Firestore isn’t enabled yet.

Admin → **This week’s pick** → **Who checked in this week** lists emails + timestamps.

### Enable Firestore (one-time, for cross-device sync)

1. Firebase console → project **eddy-s-hell** → Build → Firestore Database → Create database (production mode is fine).
2. Paste rules from `firestore.rules` (authenticated users can read all check-ins; each user may write only their own email’s docs).
3. Google Cloud → enable **Cloud Firestore API** for the project if prompted.
4. Reload the live site; member check-ins should show “Synced across devices.”

Until Firestore is enabled, check-ins still work on each friend’s device, but Santiago only sees them on that same browser.


## In-app check-in feed (beta)

On **beta** (`eddy-s-hell-beta.web.app`), signed-in members see a **Check-ins** bell on This week’s workout:

- **Feed** — “Notifications · Who checked in” for the live week (newest first), e.g. `Arianna · Okay · 5:12 PM` (first name / member label — not full email).
- **Badge** — count of unseen check-ins from others; clears when you open the feed (tracked via `localStorage` `eddys-hell-checkin-feed-seen-v1`, best-effort mirrored to Firestore `userPrefs/{uid}`).
- **Live toast** — subtle toast if the app is already open and someone else checks in (Firestore `onSnapshot` on the feed).

**Storage:** Firestore collection `checkinFeed` (doc id `pickId__email`), written on successful check-in alongside `checkins`. Shape: `{ email, displayName, pickId, difficulty, at, uid }`. Members can read the current week’s feed; each user may only write their own email/uid.

Admin Slack self-DM check-in alerts (if any) stay separate — this path is member-facing in-app only.

### Web Push (beta only)

Phone / lock-screen notifications when **someone else** checks in (social pressure). In-app feed + Slack admin self-DM stay as-is.

**Enable on your phone (beta):**
1. Open **https://eddy-s-hell-beta.web.app/** and sign in.
2. **Android / desktop Chrome:** allow notifications when prompted; flip **Notify me when someone checks in**.
3. **iPhone (Safari):** iOS **16.4+** required. Share → **Add to Home Screen**, open from that icon (standalone PWA), then enable the toggle. In-tab Safari cannot receive Web Push.
4. Hard-refresh once after a beta deploy (`?v=` cache-bust).

**How it works:** service worker `sw.js` + VAPID (`data/vapid-public.json`); subscriptions in Firestore `pushSubscriptions`. Ideal send path = Cloud Function `onCheckinFeedCreate` (needs **Blaze billing**). Until Blaze: pragmatic poller `scripts/notify-checkin-push.mjs` (box/agent) sends with the private key in `secrets/vapid.json` (gitignored).

**FCM status:** FCM APIs are enabled on `eddy-s-hell`, but full FCM Web Push still needs a Console **Web Push certificate (VAPID)** generate/import (no public API) **and** Blaze for Cloud Functions. This beta ships **standard Web Push** (same lock-screen UX) with our own VAPID pair so subscribe works without Console clicks. To switch to FCM later: Console → Project settings → Cloud Messaging → Web Push certificates → Generate key pair (or import ours), put the public key in client `getToken`, and send via Admin `messaging().send`.

**Santiago — unblock Cloud Function send (exact steps):**
1. Firebase Console → project **eddy-s-hell** → upgrade to **Blaze** (billing account).
2. `firebase deploy --only functions --project eddy-s-hell` (from repo; sets `functions/`).
3. `firebase functions:config:set webpush.public_key="..." webpush.private_key="..." webpush.subject="mailto:sblanco2005@gmail.com"` using values from `secrets/vapid.json`, then redeploy functions.
4. Optional FCM: Cloud Messaging → Web Push certificates → Generate/import; not required for the current Web Push path.

Stable Hosting is untouched. Admin Slack self-DM check-in alerts stay separate.

### PT email

`data/pt.json` holds the summary destination (`eddy_pazmino@yahoo.com`). Automatic Thursday email to the PT is **not wired yet** (manual / deferred). Check-in recording in the app works independently.


## YouTube (this week’s video)

`data/this-week.json` may include optional `youtubeId` and `youtubeUrl`.

- **Members / admin This week**: if `youtubeId` is set, a responsive privacy-enhanced iframe embeds from `youtube-nocookie.com`. If missing, the UI shows **Video not published yet** while workout meta stays visible.
- **Admin → This week’s pick → YouTube video**: paste a YouTube URL or 11-character id → **Save video** (writes localStorage + downloads `this-week.json`, same pattern as Accept). **Clear video** removes the link.
- Mac helpers: `scripts/compress-workout.sh` (ffmpeg H.264/AAC ~720p) and `scripts/upload-youtube.md` (Studio unlisted upload; OAuth API later).

## Data files

- `data/catalog.json` — workout catalog
- `data/default-rule.json` / `data/state.json` — rule seed
- `data/this-week.json` — Hosting bootstrap/fallback pick (live pick is Firestore `config/thisWeek`; optional `youtubeId` / `youtubeUrl`)
- `data/admins.json` — admin email allowlist
- `data/members.json` — member email allowlist (empty = admins only)
- `data/pt.json` — editable PT summary email destination
- `data/firebase-config.json` — Firebase web config (Auth configured; enable Firestore for check-in sync)
- `firestore.rules` — check-ins + `checkinFeed` + `userPrefs` + `pushSubscriptions` + admin-only write to `config/thisWeek` / `config/nextWeek` / `config/rule` + admin `activityLog`
- `data/vapid-public.json` — Web Push VAPID public key (beta)
- `sw.js` / `manifest.webmanifest` / `icons/` — PWA + push SW (beta)

## Publish

```bash
# from Mac app folder — copy source into dist then push gh-pages
rm -rf dist && mkdir -p dist
cp index.html app.js auth.js styles.css README.md serve.sh dist/
cp -R data dist/
touch dist/.nojekyll
./scripts/publish-pages.sh
```

## Default rule

Rotate · Prefer recent · Full body · HR > 120 · last 8 weeks avoided · **pick always manual** (`autoPick: false`, deprecated).

`autoPick` still exists on Firestore `config/rule` / `data/default-rule.json` / `data/state.json` / `localStorage` (`eddys-hell-admin-v2`) for schema compatibility, but it is **ignored**. Admin UI hides the Auto-pick checkbox; **Save rule** always writes `autoPick: false`. Wednesday **never** auto-picks — it only compares staged `nextWeek` vs live `thisWeek` (see Stage vs live above). `rotateWeeks` still filters **Pick again** dry-runs only.
