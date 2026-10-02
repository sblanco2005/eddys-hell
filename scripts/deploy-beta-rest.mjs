#!/usr/bin/env node
/**
 * Deploy dist/ to Firebase Hosting site eddy-s-hell-beta via REST.
 * Workaround for firebase-tools "Premature close" on this environment.
 *
 * Usage: node scripts/deploy-beta-rest.mjs
 * Auth: firebase-tools.json access token (refresh first if needed)
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const SITE = "eddy-s-hell-beta";
const PROJECT = "eddy-s-hell";

function loadToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN;
  const cfg = JSON.parse(
    fs.readFileSync(
      path.join(process.env.HOME, ".config/configstore/firebase-tools.json"),
      "utf8"
    )
  );
  return cfg.tokens.access_token;
}

function request(method, url, { token, body, headers = {}, rawBody } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = rawBody || (body ? Buffer.from(JSON.stringify(body)) : null);
    const h = { Authorization: `Bearer ${token}`, ...headers };
    if (payload && !h["Content-Type"] && body) h["Content-Type"] = "application/json";
    if (payload) h["Content-Length"] = payload.length;
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers: h },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, text, json, buf });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function walk(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

function gzipHash(buf) {
  const gz = zlib.gzipSync(buf, { level: 9 });
  const hash = crypto.createHash("sha256").update(gz).digest("hex");
  return { gz, hash };
}

async function main() {
  if (!fs.existsSync(DIST)) throw new Error("dist/ missing — sync first");
  const token = loadToken();
  const files = walk(DIST).filter((f) => !f.startsWith("."));
  console.log("files", files.length);

  // 1) create version
  let res = await request(
    "POST",
    `https://firebasehosting.googleapis.com/v1beta1/projects/-/sites/${SITE}/versions`,
    { token, body: { status: "CREATED", labels: { "deployment-tool": "eddys-hell-rest" } } }
  );
  if (res.status >= 300) throw new Error(`create version ${res.status}: ${res.text.slice(0, 400)}`);
  const versionName = res.json.name; // projects/-/sites/.../versions/ID
  console.log("version", versionName);

  // 2) hash files
  const filesMap = {}; // path -> hash
  const byHash = {}; // hash -> {gz, path}
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(DIST, rel));
    const { gz, hash } = gzipHash(buf);
    const urlPath = "/" + rel;
    filesMap[urlPath] = hash;
    byHash[hash] = { gz, rel: urlPath };
  }

  // 3) populateFiles
  res = await request("POST", `https://firebasehosting.googleapis.com/v1beta1/${versionName}:populateFiles`, {
    token,
    body: { files: filesMap },
  });
  if (res.status >= 300) throw new Error(`populateFiles ${res.status}: ${res.text.slice(0, 500)}`);
  const uploadUrl = res.json.uploadUrl;
  const toUpload = res.json.uploadRequiredHashes || [];
  console.log("upload required", toUpload.length, "uploadUrl", !!uploadUrl);

  // 4) upload each required hash
  for (const hash of toUpload) {
    const item = byHash[hash];
    if (!item) {
      console.warn("missing hash local", hash);
      continue;
    }
    const up = await request("POST", `${uploadUrl}/${hash}`, {
      token,
      rawBody: item.gz,
      headers: {
        "Content-Type": "application/octet-stream",
        Authorization: `Bearer ${token}`,
      },
    });
    if (up.status >= 300) {
      throw new Error(`upload ${hash} ${up.status}: ${up.text.slice(0, 200)}`);
    }
    process.stdout.write(".");
  }
  console.log("\nuploads done");

  // 5) finalize
  res = await request("PATCH", `https://firebasehosting.googleapis.com/v1beta1/${versionName}?updateMask=status`, {
    token,
    body: { status: "FINALIZED" },
  });
  if (res.status >= 300) throw new Error(`finalize ${res.status}: ${res.text.slice(0, 400)}`);
  console.log("finalized", res.json.status);

  // 6) release
  res = await request(
    "POST",
    `https://firebasehosting.googleapis.com/v1beta1/projects/-/sites/${SITE}/releases?versionName=${encodeURIComponent(versionName)}`,
    { token, body: {} }
  );
  if (res.status >= 300) throw new Error(`release ${res.status}: ${res.text.slice(0, 400)}`);
  console.log("RELEASE_OK", versionName.split("/").pop());
  console.log("BETA_URL=https://eddy-s-hell-beta.web.app/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
