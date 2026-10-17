#!/usr/bin/env node
/**
 * trainerQueue helper — hands finished Mine sessions to Santiago's personal-trainer bot.
 * Auth via scripts/lib/google-token.mjs (same as compress-queue.mjs).
 *
 * Usage:
 *   node scripts/trainer-queue.mjs list
 *     → prints a JSON array of pending items ({id, type, workoutId, sessionId, ...doc}; type 'plan'|'session', missing → 'session') oldest first, or NONE (exit 0)
 *     p15: pending type 'logParse' items come LAST with relay:false + handTo:'parent' — never relay/mark them; hand to the parent
 *     (node scripts/log-parse.mjs list / apply). Their parsed result is re-queued here as a normal 'session' item (id la-<logParseId>).
 *   node scripts/trainer-queue.mjs mark <id> sent|failed [reason...]
 *     → trainerQueue/<id>: status, sentAt (ISO), reason (if given), updatedAt
 *       and users/{uid}/sessions/{sid} (from sessionPath): trainerStatus, trainerSentAt
 *       (session update requires the doc to exist; never creates one)
 */
import { getGoogleAccessToken } from "./lib/google-token.mjs";

const PROJECT = "eddy-s-hell";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function fromValue(v) {
  if (v == null) return null;
  if ("nullValue" in v) return null;
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

async function api(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}
  if (!res.ok) throw new Error(`${method} ${url.replace(BASE, "")} → ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

async function list(token) {
  const rows = await api("POST", `${BASE}:runQuery`, token, {
    structuredQuery: {
      from: [{ collectionId: "trainerQueue" }],
      where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: str("pending") } },
      limit: 50,
    },
  });
  const items = (rows || [])
    .filter((r) => r.document)
    .map((r) => {
      const d = fromFields(r.document.fields);
      return relayFormat({ id: r.document.name.split("/").pop(), type: d.type || "session", ...d, ...(d.type ? {} : { type: "session" }), ...ids(d) });
    })
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  // p15: logParse items are NOT for Arni — hand them to the parent bot to parse (scripts/log-parse.mjs). Listed last, flagged.
  const relay = items.filter((x) => x.type !== "logParse");
  const parse = items
    .filter((x) => x.type === "logParse")
    .map((x) => ({
      id: x.id, type: "logParse", relay: false, handTo: "parent",
      instruction: "DO NOT send to Arni and DO NOT mark. Hand to the parent bot: it runs `node scripts/log-parse.mjs list`, reads text/photo, then `node scripts/log-parse.mjs apply --id <id> --json-file <path>`.",
      name: x.name || null, sessionId: x.sessionId || null, workoutId: x.workoutId || null, text: x.text || "", hasPhoto: !!x.hasPhoto, createdAt: x.createdAt || null,
    }));
  const all = [...relay, ...parse];
  console.log(all.length ? JSON.stringify(all, null, 2) : "NONE");
}

/** Relay-facing formatting: each move's `name` becomes its `label` when present
 * (e.g. "Chest-supported dumbbell row (swapped from Barbell row)"); the raw name stays in `moveName`.
 * Also adds summary.movesText: one ready-to-send line per move. */
export function relayFormat(item) {
  const sum = item && item.summary;
  if (!sum || !Array.isArray(sum.moves)) return item;
  sum.moves = sum.moves.map((m) => ({ ...m, moveName: m.name, name: m.label || m.name }));
  // Supersets: one block per group ("Superset A: X / Y" + rounds in order); other moves one line each.
  const ss = new Map((sum.supersets || []).map((g) => [g.letter, g]));
  const done = new Set();
  if (Array.isArray(sum.movesText) && sum.movesText.length) return item; // app already wrote the relay lines (p13+)
  sum.movesText = [];
  for (const m of sum.moves) {
    if (m.superset && ss.has(m.superset)) {
      if (done.has(m.superset)) continue;
      done.add(m.superset);
      const g = ss.get(m.superset);
      if (g.text || g.title) {
        sum.movesText.push(g.text || [g.title, ...(Array.isArray(g.rounds) ? g.rounds : [])].join("\n"));
        continue;
      }
      // older item without app-written text: build header + rounds from the grouped moves
      const ms = sum.moves.filter((x) => x.superset === m.superset);
      const u = sum.unit || "lb";
      const st = (x) => (x.txt ? x.txt : x.t != null ? `${x.t}s` : x.w != null ? `${x.w ? x.w + " " + u : "BW"} × ${x.r}` : `${x.r} reps`);
      const n = Math.max(...ms.map((x) => (x.sets || []).length));
      const lines = [`Superset ${m.superset} (alternated, rest after each round): ${ms.map((x) => x.name).join(" + ")}`];
      for (let k = 0; k < n; k++) lines.push(`Round ${k + 1}: ` + ms.filter((x) => x.sets && x.sets[k]).map((x) => `${x.name} ${st(x.sets[k])}`).join(" → "));
      sum.movesText.push(lines.join("\n"));
      continue;
    }
    const sets = (m.sets || []).map((st) => st.txt || (st.t != null ? `${st.t}s` : st.w != null ? `${st.w || "BW"} × ${st.r}` : `${st.r} reps`));
    sum.movesText.push(Array.isArray(m.sets) && sets.length ? `${m.name}: ${sets.join(", ")}` : m.name);
  }
  return item;
}

/** workoutId / sessionId for mapping Arni's reply back (scripts/coach-note.mjs --queue <id>). */
function ids(d) {
  const tail = (p, k) => (typeof p === "string" && p.split("/")[2] === k ? p.split("/")[3] : null);
  return { workoutId: d.workoutId || tail(d.workoutPath, "workouts") || null, sessionId: d.sessionId || tail(d.sessionPath, "sessions") || null };
}

async function mark(token, id, status, reason) {
  if (!id || !["sent", "failed"].includes(status)) {
    throw new Error("usage: mark <id> sent|failed [reason]");
  }
  const now = new Date().toISOString();
  const docUrl = `${BASE}/trainerQueue/${encodeURIComponent(id)}`;
  const doc = await api("GET", docUrl, token);
  const cur = fromFields(doc.fields);
  if (cur.type === "logParse") throw new Error(`${id} is a logParse item — use scripts/log-parse.mjs apply, not mark`);
  const fields = { status: str(status), sentAt: { timestampValue: now }, updatedAt: { timestampValue: now } };
  const mask = ["status", "sentAt", "updatedAt"];
  if (reason) {
    fields.reason = str(reason);
    mask.push("reason");
  }
  await api(
    "PATCH",
    `${docUrl}?${mask.map((m) => "updateMask.fieldPaths=" + m).join("&")}&currentDocument.exists=true`,
    token,
    { fields }
  );
  let sessionUpdated = false;
  if (cur.sessionPath && /^users\/[^/]+\/sessions\/[^/]+$/.test(cur.sessionPath)) {
    await api(
      "PATCH",
      `${BASE}/${cur.sessionPath}?updateMask.fieldPaths=trainerStatus&updateMask.fieldPaths=trainerSentAt&currentDocument.exists=true`,
      token,
      { fields: { trainerStatus: str(status), trainerSentAt: str(now) } }
    );
    sessionUpdated = true;
  }
  console.log(JSON.stringify({ ok: true, id, status, sentAt: now, uid: cur.uid || null, ...ids(cur), workoutName: cur.name || (cur.summary && cur.summary.name) || null, sessionPath: cur.sessionPath || null, sessionUpdated }));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
const [cmd, ...args] = isMain ? process.argv.slice(2) : ["__import__"];
if (isMain) {
const token = await getGoogleAccessToken();
try {
  if (cmd === "list") await list(token);
  else if (cmd === "mark") await mark(token, args[0], args[1], args.slice(2).join(" ").trim());
  else {
    console.error("usage: node scripts/trainer-queue.mjs list | mark <id> sent|failed [reason]");
    process.exit(2);
  }
} catch (err) {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
}
}
