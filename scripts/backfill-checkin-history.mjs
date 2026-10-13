#!/usr/bin/env node
// Backfill checkins/{pickId__email} with video info for the history view.
// Merge-only (updateMask), never deletes, skips docs that already have videoFilename.
// Usage: node scripts/backfill-checkin-history.mjs [--dry-run]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getGoogleAccessToken } from "./lib/google-token.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const base = "https://firestore.googleapis.com/v1/projects/eddy-s-hell/databases/(default)/documents";
const H = { Authorization: `Bearer ${await getGoogleAccessToken()}`, "Content-Type": "application/json" };
const str = (f) => (f && (f.stringValue ?? (f.integerValue != null ? String(f.integerValue) : f.doubleValue != null ? String(f.doubleValue) : null))) ?? null;

const known = new Map(); // pickId -> {filename, folderType, hr, relPath, youtubeId}
const add = (id, v) => {
  if (!id) return;
  const prev = known.get(id) || {};
  const merged = { ...prev };
  for (const [k, val] of Object.entries(v)) if (val != null && val !== "" && merged[k] == null) merged[k] = val;
  known.set(id, merged);
};
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "data/catalog.json"), "utf8"));
for (const f of cat.files || []) add(f.id, { filename: f.filename, folderType: f.folderType, hr: f.hr, relPath: f.relPath });
try {
  const tw = JSON.parse(fs.readFileSync(path.join(ROOT, "data/this-week.json"), "utf8"));
  add(tw.pickId || tw.id, { filename: tw.filename, folderType: tw.folderType, hr: tw.hr, relPath: tw.relPath, youtubeId: tw.youtubeId });
} catch (_) {}
for (const k of ["thisWeek", "nextWeek"]) {
  const j = await (await fetch(`${base}/config/${k}`, { headers: H })).json();
  const f = j.fields || {};
  add(str(f.pickId) || str(f.id), { filename: str(f.filename), folderType: str(f.folderType), hr: str(f.hr), relPath: str(f.relPath), youtubeId: str(f.youtubeId) });
}
const al = await (await fetch(`${base}/activityLog?pageSize=300`, { headers: H })).json();
for (const d of al.documents || []) {
  const f = d.fields || {};
  add(str(f.pickId), { filename: str(f.filename), youtubeId: str(f.youtubeId) });
}

const ck = await (await fetch(`${base}/checkins?pageSize=1000`, { headers: H })).json();
let patched = 0, skipped = 0, unmatched = 0;
for (const d of ck.documents || []) {
  const f = d.fields || {};
  const id = d.name.split("/").pop();
  if (str(f.videoFilename)) { skipped++; continue; }
  const v = known.get(str(f.pickId));
  if (!v || !v.filename) { unmatched++; console.log("no video match:", id); continue; }
  const fields = {};
  fields.videoFilename = { stringValue: String(v.filename) };
  if (v.folderType) fields.videoType = { stringValue: String(v.folderType) };
  if (v.hr != null && Number.isFinite(Number(v.hr))) fields.videoHR = { integerValue: String(Math.round(Number(v.hr))) };
  if (v.youtubeId) fields.youtubeId = { stringValue: String(v.youtubeId) };
  if (v.relPath) fields.videoRelPath = { stringValue: String(v.relPath) };
  fields.historyBackfilledAt = { stringValue: new Date().toISOString() };
  const mask = Object.keys(fields).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  console.log((DRY ? "[dry] " : "") + "patch", id, "→", v.filename, v.youtubeId || "(no youtubeId)");
  if (!DRY) {
    const r = await fetch(`https://firestore.googleapis.com/v1/${d.name}?${mask}&currentDocument.exists=true`, {
      method: "PATCH", headers: H, body: JSON.stringify({ fields }),
    });
    if (!r.ok) { console.error("failed", id, r.status, await r.text()); continue; }
  }
  patched++;
}
console.log(JSON.stringify({ total: (ck.documents || []).length, patched, skipped, unmatched, dryRun: DRY }));
