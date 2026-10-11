#!/usr/bin/env node
// One-time import of Santiago's Steal data (gear + saved Mine workouts) into
// users/{uid}/gym/kit and users/{uid}/workouts/{id}. MERGE ONLY:
//   gym: union of existing items + snapshot gear (never removes)
//   workouts: create-only (precondition doc must not exist) — never overwrites
// Usage: node scripts/import-steal-snapshot.mjs --uid <uid> --only gym|workouts [--dry-run]
//        [--snapshot /workspace/merge-recon/source/server-data-snapshot.json]
import fs from "fs";
import { getGoogleAccessToken } from "./lib/google-token.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const UID = arg("--uid");
const ONLY = arg("--only", "gym");
const DRY = process.argv.includes("--dry-run");
const SNAP = arg("--snapshot", "/workspace/merge-recon/source/server-data-snapshot.json");
if (!UID) throw new Error("--uid required");

const base = "https://firestore.googleapis.com/v1/projects/eddy-s-hell/databases/(default)/documents";
const H = { Authorization: `Bearer ${await getGoogleAccessToken()}`, "Content-Type": "application/json" };

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}
function toFields(o) {
  const f = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) f[k] = toValue(v);
  return f;
}
function fromValue(v) {
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("stringValue" in v) return v.stringValue;
  return null;
}

const state = JSON.parse(fs.readFileSync(SNAP, "utf8")).state;
const now = new Date().toISOString();

if (ONLY === "gym") {
  const url = `${base}/users/${UID}/gym/kit`;
  const cur = await fetch(url, { headers: H });
  const existing = cur.ok ? fromValue((await cur.json()).fields?.items || { arrayValue: {} }) || [] : [];
  const items = [...new Set([...existing, ...(state.gear || [])])];
  console.log("existing", existing.length, "snapshot", (state.gear || []).length, "→ merged", items.length, items);
  if (!DRY) {
    const body = { fields: toFields({ items, importedFromStealAt: now }) };
    const r = await fetch(`${url}?updateMask.fieldPaths=items&updateMask.fieldPaths=importedFromStealAt`, {
      method: "PATCH", headers: H, body: JSON.stringify(body),
    });
    console.log("PATCH", r.status, r.ok ? "ok" : await r.text());
  }
} else if (ONLY === "workouts") {
  // Mine showed built routines that were saved or logged. Extracts (Stolen) are dropped.
  const keep = (state.routines || []).filter((r) => r.sourceKind === "built" && (r.savedAt || r.loggedAt));
  const skipped = (state.routines || []).filter((r) => !keep.includes(r)).map((r) => `${r.name} (${r.sourceKind}${r.savedAt || r.loggedAt ? "" : ", never saved"})`);
  console.log("import", keep.map((r) => r.name), "skip", skipped);
  for (const r of keep) {
    const doc = {
      id: r.id,
      name: r.name,
      notes: r.notes || "",
      exercises: r.exercises.map((e) => ({
        id: e.id, libId: e.libId || "", name: e.name, muscle: e.muscle, equipment: e.equipment,
        isBarbell: !!e.isBarbell, sets: e.sets, reps: String(e.reps), restSeconds: e.restSeconds ?? 90,
        setup: e.setup || "", notes: e.notes || "", formUrl: e.formUrl || "", startSeconds: e.startSeconds ?? null,
      })),
      createdAt: r.createdAt || now,
      savedAt: r.savedAt || r.loggedAt || now,
      lastDoneAt: r.loggedAt || null,
      updatedAt: now,
      source: "steal-import",
    };
    if (DRY) { console.log("would create", r.id, r.name, doc.exercises.length, "moves"); continue; }
    const res = await fetch(`${base}/users/${UID}/workouts/${r.id}?currentDocument.exists=false`, {
      method: "PATCH", headers: H, body: JSON.stringify({ fields: toFields(doc) }),
    });
    console.log("create", r.name, res.status, res.ok ? "ok" : (await res.text()).slice(0, 200));
  }
}
