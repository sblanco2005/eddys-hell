#!/usr/bin/env node
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROJECT = "eddy-s-hell";

function loadToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN;
  const cfg = JSON.parse(
    fs.readFileSync(path.join(process.env.HOME, ".config/configstore/firebase-tools.json"), "utf8")
  );
  return cfg.tokens.access_token;
}

function request(method, url, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = data.length;
    }
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers },
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
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const token = loadToken();
  const content = fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8");
  const create = await request("POST", `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`, {
    token,
    body: { source: { files: [{ name: "firestore.rules", content }] } },
  });
  if (create.status >= 300) throw new Error(`ruleset ${create.status}: ${create.text.slice(0, 500)}`);
  const rulesetName = create.json.name;
  console.log("ruleset", rulesetName);
  const release = await request(
    "PATCH",
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`,
    { token, body: { release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName } } }
  );
  // If release missing, create
  if (release.status === 404) {
    const created = await request("POST", `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`, {
      token,
      body: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName },
    });
    if (created.status >= 300) throw new Error(`release create ${created.status}: ${created.text}`);
    console.log("RELEASE_CREATED", rulesetName);
  } else if (release.status >= 300) {
    throw new Error(`release ${release.status}: ${release.text.slice(0, 500)}`);
  } else {
    console.log("RELEASE_OK", rulesetName);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
