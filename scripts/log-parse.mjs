#!/usr/bin/env node
/**
 * Log after (p15): Santiago types/dictates or photographs a cardio/Hyrox workout in Mine → the app saves the session as
 * logAfter.status 'pending' and enqueues trainerQueue/{id} {type:'logParse', status:'pending', text, photoPath, ...}.
 * Parsing happens off-app (the parent bot reads text/photo and writes structured JSON), then `apply` finishes the job.
 * Auth via scripts/lib/google-token.mjs (admin creds; bypasses rules).
 *
 * Usage:
 *   node scripts/log-parse.mjs list
 *     → JSON array of pending logParse items (oldest first) or NONE. Photos are saved to /workspace/logparse/<id>.jpg (photoFile).
 *   node scripts/log-parse.mjs apply --id <queueId> --json-file <path> [--dry-run] [--no-push] [--no-trainer]
 *     → writes users/{uid}/sessions/{sid}.logAfter {status:'parsed', parsed:{moves, note, roundCount, movesText, parsedAt}},
 *       marks the logParse item status 'parsed', and (if sendToTrainer was ticked) enqueues the normal trainerQueue
 *       {type:'session', status:'pending', summary} item that the 15-min trainer routine relays to Arni as usual.
 *       Push ONLY to Santiago (uid Yv9iwvUTwVSsKVo2DJxCKp7sIC92): "Your <Routine> log is in" → /?log=<sessionId>.
 *   node scripts/log-parse.mjs delete --id <queueId> --yes      (test cleanup: deletes queue item, its session, photo, and any relay item it created)
 *
 * apply JSON:
 *   { "moves": [ { "name": "Assault runner", "notes": "optional",
 *                  "rounds": [ { "distance_m": 500, "time_s": 112, "reps": null, "cals": null, "pace": "1:52/500m",
 *                                "weight": null, "weightUnit": null, "notes": "" } ] } ],
 *     "note": "optional overall note", "durationMin": 34 }
 *   time_s accepts seconds or "m:ss"/"h:mm:ss"; every round field is optional but each round needs at least one value.
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
const OUT_DIR = "/workspace/logparse";
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
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}
function toFields(o) {
  const f = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) f[k] = toValue(v);
  return f;
}
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
const patch = (token, p, obj, mask, exists = true) =>
  api("PATCH", `${BASE}/${p}?${(mask || Object.keys(obj)).map((m) => "updateMask.fieldPaths=" + encodeURIComponent(m)).join("&")}${exists ? "&currentDocument.exists=true" : ""}`, token, { fields: toFields(obj) });

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--dry-run", "--no-push", "--no-trainer", "--yes"].includes(a)) o[a.slice(2).replace(/-(.)/g, (_, c) => c.toUpperCase())] = true;
    else if (a.startsWith("--")) o[a.slice(2).replace(/-(.)/g, (_, c) => c.toUpperCase())] = argv[++i];
    else o._.push(a);
  }
  return o;
}
const need = (v, n) => {
  if (!v || !ID_RE.test(v)) throw new Error(`bad or missing ${n}`);
  return v;
};

export async function pendingLogParse(token) {
  const rows = await api("POST", `${BASE}:runQuery`, token, {
    structuredQuery: { from: [{ collectionId: "trainerQueue" }], where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "pending" } } }, limit: 100 },
  });
  return (rows || [])
    .filter((r) => r.document)
    .map((r) => ({ id: r.document.name.split("/").pop(), ...fromFields(r.document.fields) }))
    .filter((d) => d.type === "logParse")
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

async function list(token) {
  const items = await pendingLogParse(token);
  if (!items.length) return console.log("NONE");
  const out = [];
  for (const q of items) {
    let photoFile = null;
    if (q.photoPath && /^users\/[^/]+\/logPhotos\/[^/]+$/.test(q.photoPath)) {
      const ph = await getDoc(token, q.photoPath);
      const m = ph && typeof ph.dataUrl === "string" && ph.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (m) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
        photoFile = path.join(OUT_DIR, `${q.id}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
        fs.writeFileSync(photoFile, Buffer.from(m[2], "base64"));
      } else photoFile = "MISSING (photo doc not found)";
    }
    out.push({
      id: q.id, type: "logParse", uid: q.uid, name: q.name, sessionId: q.sessionId, workoutId: q.workoutId,
      text: q.text || "", photoPath: q.photoPath || null, photoFile, sendToTrainer: q.sendToTrainer !== false,
      plannedMoves: q.plannedMoves || [], startedAt: q.startedAt || null, finishedAt: q.finishedAt || null, createdAt: q.createdAt || null,
      next: `node scripts/log-parse.mjs apply --id ${q.id} --json-file /workspace/logparse/${q.id}.json`,
    });
  }
  console.log(JSON.stringify(out, null, 2));
}

function toSec(t) {
  if (t == null || t === "") return null;
  if (typeof t === "number") return t >= 0 && t < 86400 ? Math.round(t) : NaN;
  const p = String(t).trim().split(":").map(Number);
  if (p.some((x) => !Number.isFinite(x))) return NaN;
  return Math.round(p.reduce((a, x) => a * 60 + x, 0));
}
const mmss = (n) => {
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const num = (v, f) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Error(`bad number for ${f}: ${v}`);
  return n;
};
export function normalize(j) {
  if (!j || !Array.isArray(j.moves) || !j.moves.length) throw new Error("JSON needs moves: [ {name, rounds:[...]} ]");
  const moves = j.moves.map((m, i) => {
    const name = String(m.name || "").trim();
    if (!name) throw new Error(`moves[${i}].name missing`);
    const rounds = (Array.isArray(m.rounds) ? m.rounds : []).map((r, k) => {
      const t = toSec(r.time_s ?? r.time);
      if (Number.isNaN(t)) throw new Error(`moves[${i}].rounds[${k}].time_s bad: ${r.time_s ?? r.time}`);
      const o = {
        distance_m: num(r.distance_m, "distance_m"), time_s: t, reps: num(r.reps, "reps"), cals: num(r.cals, "cals"),
        pace: r.pace ? String(r.pace).slice(0, 40) : null, weight: num(r.weight, "weight"),
        weightUnit: r.weightUnit ? String(r.weightUnit).slice(0, 8) : null, notes: r.notes ? String(r.notes).slice(0, 300) : null,
      };
      if (Object.values(o).every((x) => x == null)) throw new Error(`moves[${i}].rounds[${k}] is empty`);
      return o;
    });
    if (!rounds.length) throw new Error(`moves[${i}] (${name}) has no rounds`);
    return { name: name.slice(0, 120), rounds, notes: m.notes ? String(m.notes).slice(0, 500) : null };
  });
  const rt = (r) => [r.distance_m != null ? `${r.distance_m}m` : "", r.reps != null ? `${r.reps} reps` : "", r.cals != null ? `${r.cals} cal` : "",
    r.weight != null ? `${r.weight}${r.weightUnit ? " " + r.weightUnit : ""}` : "", r.time_s != null ? mmss(r.time_s) : "", r.pace ? `@ ${r.pace}` : "",
    r.notes ? `(${r.notes})` : ""].filter(Boolean).join(" ");
  const movesText = moves.map((m) => `${m.name}: ${m.rounds.map(rt).join(", ")}${m.notes ? ` — ${m.notes}` : ""}`);
  return {
    moves, movesText, note: j.note ? String(j.note).slice(0, 1000) : null,
    durationMin: j.durationMin != null ? num(j.durationMin, "durationMin") : null,
    roundCount: moves.reduce((n, m) => n + m.rounds.length, 0),
  };
}

async function pushSantiago(token, name, sessionId, body, dryRun) {
  const rows = await api("POST", `${BASE}:runQuery`, token, {
    structuredQuery: { from: [{ collectionId: "pushSubscriptions" }], where: { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: { stringValue: SANTIAGO_UID } } }, limit: 50 },
  });
  const subs = (rows || []).filter((r) => r.document).map((r) => ({ id: r.document.name.split("/").pop(), ...fromFields(r.document.fields) }))
    .filter((s) => s.uid === SANTIAGO_UID && s.enabled && s.endpoint && s.keys && s.keys.p256dh && s.keys.auth);
  const title = `Your ${name || "Hyrox"} log is in`;
  const targets = subs.map((s) => {
    const host = HOSTS.includes(s.host) ? s.host : HOSTS[0];
    return { sub: s, host, url: `https://${host}/?log=${encodeURIComponent(sessionId)}` };
  });
  const out = { title, body, uid: SANTIAGO_UID, targets: targets.map((x) => ({ subId: x.sub.id, host: x.host, url: x.url })), sent: 0, failed: 0 };
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
        JSON.stringify({ title, body, url: x.url, tag: `logparse-${sessionId}` }), { TTL: 86400 });
      out.sent++;
    } catch (err) {
      out.failed++;
      (out.errors = out.errors || []).push(`${x.sub.id}: ${err.statusCode || ""} ${String(err.body || err.message || err).slice(0, 120)}`);
    }
  }
  return out;
}

async function apply(token, a) {
  const id = need(a.id, "--id");
  if (!a.jsonFile) throw new Error("--json-file <path> required");
  const parsed = normalize(JSON.parse(fs.readFileSync(a.jsonFile, "utf8")));
  const q = await getDoc(token, `trainerQueue/${id}`);
  if (!q) throw new Error(`trainerQueue/${id} not found`);
  if (q.type !== "logParse") throw new Error(`trainerQueue/${id} is type ${q.type}, not logParse`);
  const uid = need(q.uid, "uid"), sid = need(q.sessionId, "sessionId");
  const sessPath = `users/${uid}/sessions/${sid}`;
  const sess = await getDoc(token, sessPath);
  if (!sess) throw new Error(`${sessPath} not found`);
  const now = new Date().toISOString();
  const la = { ...(sess.logAfter || {}), status: "parsed", parsed: { ...parsed, parsedAt: now }, queueId: id };
  const sendToTrainer = q.sendToTrainer !== false && !a.noTrainer;
  const name = sess.name || q.name || "Workout";
  const finishedAt = sess.finishedAt || q.finishedAt || now;
  const startedAt = sess.startedAt || q.startedAt || finishedAt;
  const durationMin = parsed.durationMin != null ? parsed.durationMin : Math.max(0, Math.round((new Date(finishedAt) - new Date(startedAt)) / 60000));
  const summary = {
    source: "logAfter", workoutName: name, startedAt, finishedAt, durationMin, unit: sess.unit || "lb",
    moves: parsed.moves.map((m) => ({ name: m.name, kind: "cardio", notes: m.notes, sets: m.rounds.map((r) => ({ ...r })) })),
    movesText: parsed.movesText, supersets: [], totalSets: parsed.roundCount, loggedSetCount: parsed.roundCount, totalVolume: 0,
    ...(parsed.note || sess.note ? { note: [sess.note, parsed.note].filter(Boolean).join(" — ") } : {}),
  };
  const result = { ok: true, dryRun: !!a.dryRun, id, uid, sessionId: sid, workoutId: sess.workoutId || null, name, sessionPath: sessPath, parsed, sendToTrainer };
  if (!a.dryRun) {
    const sessUpd = { logAfter: la, ...(sendToTrainer ? { shareWithTrainer: true, trainerStatus: "pending" } : {}) };
    await patch(token, sessPath, sessUpd);
    if (sendToTrainer) {
      const relayId = `la-${id}`; // deterministic → re-running apply never double-sends
      const relay = {
        type: "session", status: "pending", uid, email: q.email || "", displayName: q.displayName || "", sessionId: sid,
        sessionPath: sessPath, ...(sess.workoutId ? { workoutId: sess.workoutId, workoutPath: `users/${uid}/workouts/${sess.workoutId}` } : {}),
        logParseId: id, summary: JSON.parse(JSON.stringify(summary)),
      };
      const existing = await getDoc(token, `trainerQueue/${relayId}`);
      if (!existing || existing.status === "pending") {
        await api("PATCH", `${BASE}/trainerQueue/${relayId}`, token, { fields: { ...toFields(relay), createdAt: { timestampValue: now } } });
        result.trainerQueueId = relayId;
      } else result.trainerQueueId = `${relayId} (already ${existing.status}; not re-queued)`;
    }
    await patch(token, `trainerQueue/${id}`, { status: "parsed", parsedAt: now, updatedAt: now });
  } else result.summaryPreview = summary;
  const body = parsed.movesText.join(" · ").slice(0, 110);
  if (a.noPush) result.push = { skipped: "--no-push" };
  else if (uid !== SANTIAGO_UID) result.push = { skipped: "log owner is not Santiago; push goes only to Santiago" };
  else result.push = await pushSantiago(token, name, sid, body, a.dryRun);
  console.log(JSON.stringify(result, null, 2));
}

async function del(token, a) {
  const id = need(a.id, "--id");
  if (!a.yes) throw new Error("delete needs --yes");
  const q = await getDoc(token, `trainerQueue/${id}`);
  if (!q || q.type !== "logParse") throw new Error(`trainerQueue/${id} missing or not logParse`);
  const gone = [];
  const rm = async (p) => {
    if (await getDoc(token, p)) {
      await api("DELETE", `${BASE}/${p}`, token);
      gone.push(p);
    }
  };
  if (q.uid && q.sessionId) await rm(`users/${q.uid}/sessions/${q.sessionId}`);
  if (q.photoPath) await rm(q.photoPath);
  await rm(`trainerQueue/la-${id}`);
  await rm(`trainerQueue/${id}`);
  console.log(JSON.stringify({ ok: true, deleted: gone }));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const a = parseArgs(process.argv.slice(2));
  try {
    const token = await getGoogleAccessToken();
    if (a._[0] === "list") await list(token);
    else if (a._[0] === "apply") await apply(token, a);
    else if (a._[0] === "delete") await del(token, a);
    else {
      console.error("usage: node scripts/log-parse.mjs list | apply --id <id> --json-file <path> [--dry-run] [--no-push] [--no-trainer] | delete --id <id> --yes");
      process.exit(2);
    }
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
    process.exit(1);
  }
}
