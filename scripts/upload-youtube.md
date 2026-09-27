# Upload workout video to YouTube (unlisted)

Automated API upload is **not wired yet** (needs Google OAuth + YouTube Data API).
Until then, use Studio + paste the link into the app.

## Flow (this pass)

1. **Compress** on the Mac (Drive stays local — do not copy multi‑GB files to the box):

   ```bash
   cd ~/eddys-hell-app
   ./scripts/compress-workout.sh "/Volumes/SantiTB/Eddy's Hell/…/workout.mov"
   # → ~/eddys-hell-app/out/week.mp4
   ```

2. **Upload unlisted** in [YouTube Studio](https://studio.youtube.com/):
   - Create → Upload videos → pick `out/week.mp4`
   - Visibility: **Unlisted**
   - Title e.g. `Eddy's Hell · YYYY-MM-DD · HR ###`
   - Copy the video URL (`https://youtu.be/…` or `watch?v=…`)

3. **Paste into the app** (admin):
   - Open live app → sign in as admin → **This week’s pick**
   - **YouTube video** → paste URL or 11‑char id → **Save video**
   - Drop downloaded `this-week.json` into `data/` (or `node scripts/set-this-week.js …`)
   - Re-run `scripts/publish-pages.sh`

4. Members see a privacy-enhanced embed (`youtube-nocookie.com`). If no id yet: **Video not published yet** (meta still shows).

## ffmpeg on this Mac

Homebrew under `/usr/local` is currently broken (`Version value must be a string`), so `brew install ffmpeg` failed.
A working **x86_64** `ffmpeg` 9.0.2 (Rosetta) is at `~/eddys-hell-app/bin/ffmpeg` (from evermeet.cx). `compress-workout.sh` uses it automatically when `ffmpeg` is not on `PATH`. Do not commit `bin/` (gitignored; ~77MB).

## Next step — OAuth API upload (optional later)

1. Google Cloud Console → create/select project → enable **YouTube Data API v3**.
2. OAuth consent screen (External or Internal) → add yourself as test user.
3. Create OAuth **Desktop** client → download `client_secret.json` into a private path (never commit).
4. On Mac:

   ```bash
   pip3 install google-api-python-client google-auth-oauthlib google-auth-httplib2
   # then a small upload script (stub not shipped this pass) that:
   # - runs InstalledAppFlow once → stores token.json locally
   # - videos.insert with privacyStatus=unlisted
   # - prints the video id / URL
   ```

5. Paste that URL into Admin (same as Studio), or extend the script to write `youtubeId` / `youtubeUrl` into `data/this-week.json`.

Do **not** upload without OAuth credentials ready. Manual Studio upload is enough for the embed integration.
