# Eddy's Hell — Thursday Workout Admin

First-version admin for Santiago’s Thursday pick from the Eddy’s Hell video catalog.

Live: **https://sblanco2005.github.io/eddys-hell/**

## Run

```bash
./serve.sh
```

Open [http://127.0.0.1:8777/](http://127.0.0.1:8777/)

## What it does

- **Admin · Rule** — set folder types, min HR, recency, rotate window, optional tag filter. Saves to `localStorage` (`eddys-hell-admin-v1`).
- **Dry-run pick** — filters the catalog, respects rotate history, shows why it matched.
- **Accept as this week** — stores `lastPick` and appends to used history. Skipped Thursdays keep the last pick.

No YouTube upload or Gmail in this version.

## Data

- `data/catalog.json` — copy of Eddy’s Hell catalog
- `data/default-rule.json` — rotate · prefer recent · Full · HR > 120
- `data/state.json` — optional seed (browser uses localStorage)

## Default rule

Rotate · Prefer recent · Full body · HR > 120 · last 8 weeks avoided.
