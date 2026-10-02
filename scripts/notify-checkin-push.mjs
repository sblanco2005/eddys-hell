#!/usr/bin/env node
/**
 * Pragmatic beta sender: poll Firestore checkinFeed, send Web Push to other
 * members' pushSubscriptions. Used until Cloud Functions (Blaze) is available.
 *
 * Usage:
 *   GOOGLE_ACCESS_TOKEN=... node scripts/notify-checkin-push.mjs
 *   # or reads ~/.config/configstore/firebase-tools.json
 *
 * Secrets: ../secrets/vapid.json (gitignored)
 * State:   ../.cache/checkin-push-seen.json
 */
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

// Prefer sibling install, then /tmp/webpush-tools
let webpush;
try {
  webpush = require(path.join(ROOT, "functions", "node_modules", "web-push"));
} catch (_) {
  webpush = require("/tmp/webpush-tools/node_modules/web-push");
}

const PROJECT = "eddy-s-hell";
const SEEN_PATH = path.join(ROOT, ".cache", "checkin-push-seen.json");
const VAPID_PATH = path.join(ROOT, "secrets", "vapid.json");

function loadToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN;
  const cfgPath = path.join(
    process.env.HOME || "",
    ".config/configstore/firebase-tools.json"
  );
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  return cfg.tokens.access_token;
}

function req(method, url, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = data.length;
    }
    const r = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {}
          resolve({ status: res.statusCode, text, json });
        });
      }
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

async function listCollection(token, collectionId) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collectionId}`;
  let pageToken = "";
  const docs = [];
  do {
    const url =
      base +
      "?pageSize=100" +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const res = await req("GET", url, { token });
    if (res.status !== 200) {
      throw new Error(`list ${collectionId} HTTP ${res.status}: ${res.text.slice(0, 300)}`);
    }
    for (const d of res.json.documents || []) {
      docs.push(fromFirestoreDoc(d));
    }
    pageToken = res.json.nextPageToken || "";
  } while (pageToken);
  return docs;
}

function fromFirestoreDoc(doc) {
  const name = doc.name || "";
  const id = name.split("/").pop();
  const fields = doc.fields || {};
  const out = { id };
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeValue(v);
  }
  return out;
}

function decodeValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) {
    const m = {};
    for (const [k, vv] of Object.entries((v.mapValue && v.mapValue.fields) || {})) {
      m[k] = decodeValue(vv);
    }
    return m;
  }
  if ("arrayValue" in v) {
    return ((v.arrayValue && v.arrayValue.values) || []).map(decodeValue);
  }
  return null;
}

function shortName(displayName, email) {
  const name = String(displayName || "").trim();
  if (name) {
    const first = name.split(/\s+/)[0];
    if (first && first.indexOf("@") < 0) return first;
  }
  const local = String(email || "").split("@")[0] || "Member";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function difficultyLabel(d) {
  const k = String(d || "").toLowerCase();
  if (k === "easy") return "Easy";
  if (k === "hard") return "Hard";
  if (k === "okay") return "Okay";
  return "checked in";
}

function loadSeen() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_PATH, "utf8"));
  } catch (_) {
    return { ids: [] };
  }
}

function saveSeen(seen) {
  fs.mkdirSync(path.dirname(SEEN_PATH), { recursive: true });
  fs.writeFileSync(SEEN_PATH, JSON.stringify(seen, null, 2));
}

async function main() {
  const token = loadToken();
  const vapid = JSON.parse(fs.readFileSync(VAPID_PATH, "utf8"));
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  // Prefer checkinFeed; fall back to checkins (older rows may predate feed).
  let feed = await listCollection(token, "checkinFeed");
  let feedSource = "checkinFeed";
  if (!feed.length) {
    feed = await listCollection(token, "checkins");
    feedSource = "checkins";
  }
  const subs = (await listCollection(token, "pushSubscriptions")).filter(
    (s) => s.enabled && s.endpoint && s.keys && s.keys.p256dh && s.keys.auth
  );
  const seen = loadSeen();
  const seenSet = new Set(seen.ids || []);
  // First run: seed without sending (avoid spamming history)
  const seedMode = seenSet.size === 0;
  const newRows = feed.filter((r) => r.id && !seenSet.has(r.id));

  if (seedMode) {
    for (const r of feed) if (r.id) seenSet.add(r.id);
    saveSeen({ ids: [...seenSet], seededAt: new Date().toISOString() });
    console.log(
      JSON.stringify({
        seed_mode: true,
        feed: feed.length,
        subs: subs.length,
        seeded: seenSet.size,
      })
    );
    return;
  }

  const alerts = [];
  for (const row of newRows) {
    const checkerUid = row.uid || "";
    const checkerEmail = String(row.email || "").toLowerCase();
    const who = shortName(row.displayName, row.email);
    const diff = difficultyLabel(row.difficulty);
    const payload = JSON.stringify({
      title: "Eddy's Hell",
      body: `${who} checked in · ${diff} — your turn?`,
      tag: `checkin-${row.pickId || ""}-${checkerEmail}`,
      url: "/",
      pickId: row.pickId || null,
    });
    const targets = subs.filter((s) => {
      if (checkerUid && s.uid === checkerUid) return false;
      if (checkerEmail && String(s.email || "").toLowerCase() === checkerEmail)
        return false;
      return true;
    });
    let ok = 0;
    let fail = 0;
    for (const s of targets) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
          payload,
          { TTL: 60 * 60 * 12, urgency: "high" }
        );
        ok++;
      } catch (err) {
        fail++;
        console.warn("push fail", s.id, err.statusCode || err.status, err.message);
      }
    }
    alerts.push({
      id: row.id,
      email: checkerEmail,
      targets: targets.length,
      ok,
      fail,
    });
    seenSet.add(row.id);
  }
  saveSeen({ ids: [...seenSet], updatedAt: new Date().toISOString() });
  console.log(
    JSON.stringify({
      seed_mode: false,
      new: newRows.length,
      alerts,
      subs: subs.length,
      feed: feed.length,
      feedSource,
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
