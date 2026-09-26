# Eddy's Hell — Thursday Workout

Live: **https://sblanco2005.github.io/eddys-hell/**

Static app with Google sign-in (Firebase) — or localhost mock roles until Firebase is configured.

## Roles

| Role | Who | Sees |
|------|-----|------|
| **Guest** | Not signed in | Landing + “Sign in with Google” (workout title locked) |
| **Member** | Signed in + email in `data/members.json` | This week’s workout + check-in only |
| **Admin** | Email in `data/admins.json` | Admin · Rule + Members + dry-run + Accept + check-in list |

Admin allowlist: **`data/admins.json`** — currently `sblanco2005@gmail.com` only. Edit the `emails` array to add more.

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
5. Authentication → Settings → Authorized domains → add `sblanco2005.github.io` (and `localhost` for local testing).
6. Rebuild `dist/` and run `scripts/publish-pages.sh`.

Until those keys are filled, production Pages shows **“Auth not configured”** and Google sign-in stays hidden. Localhost still has mock sign-in.

## This week’s pick (sharing with the group)

Static Pages can’t write the repo from the browser.

1. Admin hits **Accept as this week** → saves to `localStorage` and **downloads `this-week.json`**.
2. Drop that file into `data/this-week.json` (or `node scripts/set-this-week.js ~/Downloads/this-week.json`).
3. Rebuild dist + `scripts/publish-pages.sh` so members load the same pick from the repo.

Members read `data/this-week.json` first, then fall back to their browser’s `localStorage` last pick.

Seeded sample: dry-run pick `9f757b1922` (HR 140 Full).

## Members (friend allowlist)

1. Sign in as admin → **Admin · Rule** → **Members**.
2. Add emails (normalized lowercase/trim), remove as needed, hit **Save members**.
3. Save writes `localStorage` key `eddys-hell-members-v1` and **downloads `members.json`**.
4. Drop into `data/members.json` and re-run `scripts/publish-pages.sh` so friends on other devices are allowed (localStorage alone won’t sync).

Load order: repo `data/members.json` first, then override from localStorage if its `updatedAt` is newer.

## Check-ins

“I finished this workout” stores `{ email, displayName, pickId, at, notes }` in `localStorage` key `eddys-hell-checkins-v1` (keyed by pick id + email). Admin sees “Check-ins this week” for the current pick in **this browser only**. Structure is ready to sync to a backend later.

## Data files

- `data/catalog.json` — workout catalog
- `data/default-rule.json` / `data/state.json` — rule seed
- `data/this-week.json` — published pick for members
- `data/admins.json` — admin email allowlist
- `data/members.json` — member email allowlist (empty = admins only)
- `data/firebase-config.json` — Firebase web config (empty until you paste)

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

Rotate · Prefer recent · Full body · HR > 120 · last 8 weeks avoided.
