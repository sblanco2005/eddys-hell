/**
 * Shared Google OAuth access token for Firestore REST scripts.
 * Prefer GOOGLE_ACCESS_TOKEN; else refresh firebase-tools credentials every run
 * (cached access_token expires ~1h; refresh_token lives in firebase-tools.json).
 */
import fs from "fs";
import path from "path";
import https from "https";
import { execFileSync } from "child_process";

const FIREBASE_CLIENT_ID =
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function configPath() {
  return path.join(
    process.env.HOME || "",
    ".config/configstore/firebase-tools.json"
  );
}

function postForm(url, fields) {
  const body = new URLSearchParams(fields).toString();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
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
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function tryGcloudAccessToken() {
  try {
    const out = execFileSync("gcloud", ["auth", "print-access-token"], {
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const token = String(out || "").trim();
    return token || null;
  } catch (_) {
    return null;
  }
}

/**
 * Always refresh firebase-tools tokens when a refresh_token is present,
 * then persist the new access_token / expires_at back to configstore.
 * Falls back to GOOGLE_ACCESS_TOKEN, then gcloud auth print-access-token.
 */
export async function getGoogleAccessToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    return process.env.GOOGLE_ACCESS_TOKEN;
  }

  const cfgPath = configPath();
  let cfg = null;
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  } catch (err) {
    cfg = null;
  }

  const refreshToken =
    cfg && cfg.tokens && cfg.tokens.refresh_token
      ? cfg.tokens.refresh_token
      : null;

  if (refreshToken) {
    const res = await postForm(TOKEN_URL, {
      client_id: FIREBASE_CLIENT_ID,
      client_secret: FIREBASE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (res.status === 200 && res.json && res.json.access_token) {
      const expiresIn = Number(res.json.expires_in) || 3600;
      cfg.tokens = {
        ...cfg.tokens,
        access_token: res.json.access_token,
        expires_at: Date.now() + expiresIn * 1000,
        expires_in: expiresIn,
        token_type: res.json.token_type || cfg.tokens.token_type || "Bearer",
        scope: res.json.scope || cfg.tokens.scope,
      };
      if (res.json.refresh_token) {
        cfg.tokens.refresh_token = res.json.refresh_token;
      }
      if (res.json.id_token) {
        cfg.tokens.id_token = res.json.id_token;
      }
      try {
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, "\t"));
      } catch (_) {
        // Best-effort persist; still return the fresh token.
      }
      return cfg.tokens.access_token;
    }
    const errBody = (res.json && JSON.stringify(res.json)) || res.text || "";
    const gcloud = tryGcloudAccessToken();
    if (gcloud) return gcloud;
    throw new Error(
      `Google token refresh failed HTTP ${res.status}: ${errBody.slice(0, 400)}. ` +
        `Run: firebase login --reauth`
    );
  }

  if (cfg && cfg.tokens && cfg.tokens.access_token) {
    // No refresh_token — last resort: stale cached token (often 401).
    return cfg.tokens.access_token;
  }

  const gcloud = tryGcloudAccessToken();
  if (gcloud) return gcloud;

  throw new Error(
    "No Google credentials: set GOOGLE_ACCESS_TOKEN or run firebase login --reauth"
  );
}
