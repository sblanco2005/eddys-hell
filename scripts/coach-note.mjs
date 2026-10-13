#!/usr/bin/env node
/**
 * Coach notes from Arni → users/{uid}/coachNotes/{id}, shown in Mine on that routine.
 * Auth via scripts/lib/google-token.mjs (same admin creds as trainer-queue.mjs; bypasses rules).
 *
 * Usage:
 *   node scripts/coach-note.mjs add (--queue <trainerQueueId> | --session <sessionId> | --workout <workoutId>)
 *        --text-file <path> [--kind session|plan] [--uid <uid>] [--no-push] [--dry-run]
 *     --queue    resolves uid/workoutId/sessionId/kind from trainerQueue/<id> (preferred; note id = q-<queueId>, so re-runs overwrite, never duplicate)
 *     --session  finds users/<uid>/sessions/<id> (uid defaults to Santiago) → its workoutId
 *     --workout  users/<uid>/workouts/<id> directly
 *     Push: Web Push ONLY to Santiago's own pushSubscriptions (uid Yv9iwvUTwVSsKVo2DJxCKp7sIC92), and only when the
 *     note belongs to him. Title "Arni left notes on <Workout>", body = first ~100 chars, opens https://<sub host>/?coach=<workoutId>.
 *     --dry-run: all reads, no Firestore write, no push.
 *   node scripts/coach-note.mjs list --workout <workoutId> [--uid <uid>]
 * Prints one JSON object.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { getGoogleAccessToken } from "./lib/google-token.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROJECT = "eddy-s-hell";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const SANTIAGO_UID = "Yv9iwvUTwVSsKVo2DJxCKp7sIC92";
const HOSTS = ["eddy-s-hell.web.app", "eddy-s-hell-beta.web.app"];
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function fromValue(v) {
  if (v == null || "nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
}
function fromFields(f) {
  const o = {};
  for (const [k, v] of Object.entries(f || {})) o[k] = fromValue(v);
  return o;
}
const str = (s) => ({ stringValue: String(s) });

async function api(method, url, token, body, { allow404 = false } = {}) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`${method} ${url.replace(BASE, "")} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const getDoc = async (token, p) => {
  const d = await api("GET", `${BASE}/${p}`, token, null, { allow404: true });
  return d ? { id: d.name.split("/").pop(), ...fromFields(d.fields) } : null;
};

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-push") o.noPush = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a.startsWith("--")) o[a.slice(2).replace(/-(.)/g, (_, c) => c.toUpperCase())] = argv[++i];
    else o._.push(a);
  }
  return o;
}
const need = (v, name) => {
  if (!v || !ID_RE.test(v)) throw new Error(`bad or missing ${name}`);
  return v;
};

async function resolveTarget(token, a) {
  let uid = a.uid || null, workoutId = a.workout || null, sessionId = a.session || null, kind = a.kind || null, queueId = null;
  if (a.queue) {
    queueId = need(a.queue, "--queue");
    const q = await getDoc(token, `trainerQueue/${queueId}`);
    if (!q) throw new Error(`trainerQueue/${queueId} not found`);
    uid = q.uid;
    const tail = (p, k) => (typeof p === "string" && p.split("/")[2] === k ? p.split("/")[3] : null);
    workoutId = q.workoutId || tail(q.workoutPath, "workouts") || workoutId;
    sessionId = q.sessionId || tail(q.sessionPath, "sessions") || sessionId;
    kind = kind || (q.type === "plan" ? "plan" : "session");
  }
  uid = need(uid || SANTIAGO_UID, "uid");
  if (sessionId && !workoutId) {
    const s = await getDoc(token, `users/${uid}/sessions/${need(sessionId, "--session")}`);
    if (!s) throw new Error(`users/${uid}/sessions/${sessionId} not found`);
    workoutId = s.workoutId;
  }
  need(workoutId, "workoutId (routine)");
  const w = await getDoc(token, `users/${uid}/workouts/${workoutId}`);
  if (!w) throw new Error(`users/${uid}/workouts/${workoutId} not found`);
  return { uid, workoutId, workoutName: w.name || "your routine", sessionId: sessionId || null, kind: kind || (sessionId ? "session" : "plan"), queueId };
}

async function santiagoSubs(token) {
  const rows = await api("POST", `${BASE}:runQuery`, token, {
    structuredQuery: { from: [{ collectionId: "pushSubscriptions" }], where: { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: str(SANTIAGO_UID) } }, limit: 50 },
  });
  return (rows || [])
    .filter((r) => r.document)
    .map((r) => ({ id: r.document.name.split("/").pop(), ...fromFields(r.document.fields) }))
    .filter((s) => s.uid === SANTIAGO_UID && s.enabled && s.endpoint && s.keys && s.keys.p256dh && s.keys.auth); // belt + braces
}

async function pushSantiago(token, t, text, dryRun) {
  const subs = await santiagoSubs(token);
  const body = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const short = body.length > 100 ? body.slice(0, 99).replace(/\s+\S*$/, "") + "…" : body;
  const title = `Arni left notes on ${t.workoutName}`;
  const targets = subs.map((s) => {
    const host = HOSTS.includes(s.host) ? s.host : HOSTS[0];
    return { sub: s, host, url: `https://${host}/?coach=${encodeURIComponent(t.workoutId)}` };
  });
  const out = { title, body: short, uid: SANTIAGO_UID, targets: targets.map((x) => ({ subId: x.sub.id, host: x.host, url: x.url })), sent: 0, failed: 0 };
  if (dryRun) return { ...out, dryRun: true };
  const require = createRequire(import.meta.url);
  let webpush;
  try {
    webpush = require(path.join(ROOT, "functions", "node_modules", "web-push"));
  } catch (_) {
    webpush = require("/tmp/webpush-tools/node_modules/web-push");
  }
  const vapid = JSON.parse(fs.readFileSync(path.join(ROOT, "secrets", "vapid.json"), "utf8"));
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  for (const x of targets) {
    try {
      await webpush.sendNotification({ endpoint: x.sub.endpoint, keys: { p256dh: x.sub.keys.p256dh, auth: x.sub.keys.auth } },
        JSON.stringify({ title, body: short, url: x.url, tag: `coach-${t.workoutId}` }), { TTL: 86400 });
      out.sent++;
    } catch (err) {
      out.failed++;
      (out.errors = out.errors || []).push(`${x.sub.id}: ${err.statusCode || ""} ${String(err.body || err.message || err).slice(0, 120)}`);
    }
  }
  return out;
}

async function add(token, a) {
  if (!a.textFile) throw new Error("--text-file <path> required");
  const text = fs.readFileSync(a.textFile, "utf8").trim();
  if (!text) throw new Error("text file is empty");
  if (text.length > 20000) throw new Error("note too long (>20000 chars)");
  if (a.kind && !["session", "plan"].includes(a.kind)) throw new Error("--kind must be session|plan");
  const t = await resolveTarget(token, a);
  const noteId = t.queueId ? `q-${t.queueId}` : `n-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const fields = { workoutId: str(t.workoutId), workoutName: str(t.workoutName), kind: str(t.kind), text: str(text), from: str("Arni Trainer"), createdAt: { timestampValue: now } };
  if (t.sessionId) fields.sessionId = str(t.sessionId);
  if (t.queueId) fields.queueId = str(t.queueId);
  const notePath = `users/${t.uid}/coachNotes/${noteId}`;
  if (!a.dryRun) await api("PATCH", `${BASE}/${notePath}`, token, { fields }); // full write (re-run replaces, readAt cleared)
  let push;
  if (a.noPush) push = { skipped: "--no-push" };
  else if (t.uid !== SANTIAGO_UID) push = { skipped: "note owner is not Santiago; push goes only to Santiago" };
  else push = await pushSantiago(token, t, text, a.dryRun);
  console.log(JSON.stringify({ ok: true, dryRun: !!a.dryRun, notePath, ...t, chars: text.length, createdAt: now, push }, null, 2));
}

async function list(token, a) {
  const uid = need(a.uid || SANTIAGO_UID, "uid");
  const wid = need(a.workout, "--workout");
  const rows = await api("POST", `${BASE}/users/${uid}:runQuery`, token, {
    structuredQuery: { from: [{ collectionId: "coachNotes" }], where: { fieldFilter: { field: { fieldPath: "workoutId" }, op: "EQUAL", value: str(wid) } }, limit: 100 },
  });
  const notes = (rows || []).filter((r) => r.document).map((r) => ({ id: r.document.name.split("/").pop(), ...fromFields(r.document.fields) }))
    .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  console.log(JSON.stringify({ ok: true, uid, workoutId: wid, count: notes.length, notes }, null, 2));
}

const a = parseArgs(process.argv.slice(2));
const cmd = a._[0];
try {
  const token = await getGoogleAccessToken();
  if (cmd === "add") await add(token, a);
  else if (cmd === "list") await list(token, a);
  else {
    console.error("usage: node scripts/coach-note.mjs add (--queue <id>|--session <id>|--workout <id>) --text-file <path> [--kind session|plan] [--uid <uid>] [--no-push] [--dry-run]\n       node scripts/coach-note.mjs list --workout <id> [--uid <uid>]");
    process.exit(2);
  }
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
  process.exit(1);
}
