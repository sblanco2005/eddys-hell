#!/usr/bin/env node
/**
 * trainerQueue helper — hands finished Mine sessions to Santiago's personal-trainer bot.
 * Auth via scripts/lib/google-token.mjs (same as compress-queue.mjs).
 *
 * Usage:
 *   node scripts/trainer-queue.mjs list
 *     → prints a JSON array of pending items ({id, type, ...doc}; type 'plan'|'session', missing → 'session') oldest first, or NONE (exit 0)
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
      return { id: r.document.name.split("/").pop(), type: d.type || "session", ...d, ...(d.type ? {} : { type: "session" }) };
    })
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  console.log(items.length ? JSON.stringify(items, null, 2) : "NONE");
}

async function mark(token, id, status, reason) {
  if (!id || !["sent", "failed"].includes(status)) {
    throw new Error("usage: mark <id> sent|failed [reason]");
  }
  const now = new Date().toISOString();
  const docUrl = `${BASE}/trainerQueue/${encodeURIComponent(id)}`;
  const doc = await api("GET", docUrl, token);
  const cur = fromFields(doc.fields);
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
  console.log(JSON.stringify({ ok: true, id, status, sentAt: now, sessionPath: cur.sessionPath || null, sessionUpdated }));
}

const [cmd, ...args] = process.argv.slice(2);
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
