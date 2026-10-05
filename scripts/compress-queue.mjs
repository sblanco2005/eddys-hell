#!/usr/bin/env node
/**
 * Firestore jobs/compressUpload queue helper (beta).
 * Same auth approach as notify-checkin-push.mjs:
 *   GOOGLE_ACCESS_TOKEN=... or ~/.config/configstore/firebase-tools.json
 *
 * Usage:
 *   node scripts/compress-queue.mjs check
 *     → prints JSON of jobs/compressUpload if status==requested, else NONE (exit 0)
 *   node scripts/compress-queue.mjs set <status> [youtubeId] [message]
 *     → updates status (running|done|failed), optional youtubeId/message, updatedAt
 */
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROJECT = "eddy-s-hell";
const DOC_PATH = `projects/${PROJECT}/databases/(default)/documents/jobs/compressUpload`;
const DOC_URL = `https://firestore.googleapis.com/v1/${DOC_PATH}`;

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

function fromFirestoreDoc(doc) {
  const name = (doc && doc.name) || "";
  const id = name.split("/").pop() || "compressUpload";
  const fields = (doc && doc.fields) || {};
  const out = { id };
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeValue(v);
  }
  return out;
}

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    if (Number.isInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(encodeValue) } };
  }
  if (typeof v === "object") {
    const fields = {};
    for (const [k, vv] of Object.entries(v)) {
      fields[k] = encodeValue(vv);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

async function cmdCheck(token) {
  const res = await req("GET", DOC_URL, { token });
  if (res.status === 404) {
    console.log("NONE");
    return 0;
  }
  if (res.status !== 200) {
    throw new Error(`check HTTP ${res.status}: ${res.text.slice(0, 400)}`);
  }
  const data = fromFirestoreDoc(res.json);
  if (data.status === "requested") {
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }
  console.log("NONE");
  return 0;
}

async function cmdSet(token, status, youtubeId, message) {
  const allowed = new Set(["running", "done", "failed"]);
  if (!allowed.has(status)) {
    throw new Error(`status must be one of: running|done|failed (got ${status})`);
  }
  const fields = {
    status: encodeValue(status),
    updatedAt: encodeValue(new Date().toISOString()),
  };
  const mask = ["status", "updatedAt"];
  if (youtubeId !== undefined && youtubeId !== "") {
    fields.youtubeId = encodeValue(youtubeId);
    mask.push("youtubeId");
  }
  if (message !== undefined && message !== "") {
    fields.message = encodeValue(message);
    mask.push("message");
  }
  const qs = mask.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&");
  const res = await req("PATCH", `${DOC_URL}?${qs}`, {
    token,
    body: { fields },
  });
  if (res.status >= 300) {
    throw new Error(`set HTTP ${res.status}: ${res.text.slice(0, 500)}`);
  }
  console.log(JSON.stringify(fromFirestoreDoc(res.json), null, 2));
  return 0;
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || !["check", "set"].includes(cmd)) {
    console.error(
      "Usage:\n  node scripts/compress-queue.mjs check\n  node scripts/compress-queue.mjs set <running|done|failed> [youtubeId] [message]"
    );
    process.exit(2);
  }
  const token = loadToken();
  if (cmd === "check") {
    process.exit(await cmdCheck(token));
  }
  const [status, youtubeId, ...msgParts] = rest;
  if (!status) {
    console.error("set requires <status>");
    process.exit(2);
  }
  const message = msgParts.length ? msgParts.join(" ") : undefined;
  process.exit(await cmdSet(token, status, youtubeId, message));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
