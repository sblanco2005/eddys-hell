/**
 * Eddy's Hell — Cloud Functions (2nd gen, Node 22, us-central1). Requires Blaze.
 *
 * onCheckinFeedCreate: first check-in of the week (checkinFeed/{pickId__email})
 *   → Web Push to every OTHER member's subscription saved from the SAME host
 *   (prod eddy-s-hell.web.app / beta eddy-s-hell-beta.web.app stay separate).
 * sendTestPush / sendBroadcastPush: admin callables, scoped to the caller's host.
 *
 * Secrets (set once; scripts/deploy-functions-beta-push.sh pipes them in):
 *   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const webpush = require("web-push");

initializeApp();

const VAPID_PUBLIC = defineSecret("VAPID_PUBLIC");
const VAPID_PRIVATE = defineSecret("VAPID_PRIVATE");
const VAPID_SUBJECT = defineSecret("VAPID_SUBJECT");
const STEPUP_SECRET = defineSecret("STEPUP_SECRET");

/** Only these site hosts receive check-in pushes (beta-only for now). */
/**
 * Hosts allowed to send/receive pushes. Each crew stays on its own host: a
 * check-in on host H only notifies subscriptions saved from host H (no double pings).
 */
const PUSH_HOSTS = new Set([
  "eddy-s-hell.web.app",
  "eddy-s-hell.firebaseapp.com",
  "eddy-s-hell-beta.web.app",
]);
const DEFAULT_HOST = "eddy-s-hell.web.app";
function clickUrlFor(host) {
  return `https://${PUSH_HOSTS.has(host) ? host : DEFAULT_HOST}/`;
}
const TTL_SECONDS = 60 * 60 * 12;

function shortName(displayName, email) {
  const name = String(displayName || "").trim();
  if (name && name.indexOf("@") < 0) return name;
  const local = String(email || "").split("@")[0] || "A friend";
  return local;
}

exports.onCheckinFeedCreate = onDocumentCreated(
  {
    document: "checkinFeed/{docId}",
    region: "us-central1",
    secrets: [VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT],
    retry: false,
    memory: "256MiB",
    maxInstances: 5,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const row = snap.data() || {};
    // Untagged (old clients) or unknown hosts → skip.
    const checkinHost = String(row.host || "");
    if (!PUSH_HOSTS.has(checkinHost)) {
      logger.info("skip untagged/unknown-host check-in", { docId: event.params && event.params.docId, host: row.host || null });
      return;
    }
    const db = getFirestore();
    const checkerUid = String(row.uid || "");
    const checkerEmail = String(row.email || "").toLowerCase();
    const who = shortName(row.displayName, row.email);

    const payload = JSON.stringify({
      title: `🔥 ${who} just did Eddy’s Hell`,
      body: "Your turn — this week’s workout is waiting.",
      tag: `checkin-${row.pickId || ""}-${checkerEmail}`,
      url: clickUrlFor(checkinHost),
      pickId: row.pickId || null,
    });

    const pub = (VAPID_PUBLIC.value() || "").trim();
    const priv = (VAPID_PRIVATE.value() || "").trim();
    const subject = (VAPID_SUBJECT.value() || "").trim() || "mailto:sblanco2005@gmail.com";
    if (!pub || !priv) {
      logger.error("VAPID secrets missing — skip send");
      return;
    }
    webpush.setVapidDetails(subject, pub, priv);

    const subsSnap = await db.collection("pushSubscriptions").get();
    let skippedSelf = 0;
    let skippedHost = 0;
    const jobs = [];
    for (const doc of subsSnap.docs) {
      const sub = doc.data() || {};
      if (sub.enabled === false) continue;
      if (String(sub.host || "") !== checkinHost) {
        skippedHost++;
        continue;
      }
      if (
        (checkerUid && sub.uid === checkerUid) ||
        (checkerEmail && String(sub.email || "").toLowerCase() === checkerEmail)
      ) {
        skippedSelf++;
        continue;
      }
      if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) continue;
      jobs.push(
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
            payload,
            { TTL: TTL_SECONDS, urgency: "high" }
          )
          .then(() => ({ id: doc.id, ok: true }))
          .catch(async (err) => {
            const status = err && (err.statusCode || err.status);
            logger.warn("push fail", { id: doc.id, status, message: err && err.message });
            if (status === 404 || status === 410) {
              try {
                await doc.ref.set(
                  { enabled: false, disabledAt: new Date().toISOString(), disableReason: String(status) },
                  { merge: true }
                );
              } catch (_) {
                /* ok */
              }
            }
            return { id: doc.id, ok: false, status };
          })
      );
    }
    const results = await Promise.all(jobs);
    const ok = results.filter((r) => r.ok).length;
    const summary = {
      checkerEmail,
      pickId: row.pickId || null,
      targets: results.length,
      ok,
      failed: results.length - ok,
      skippedSelf,
      skippedHost,
    };
    logger.info("checkin push sent", summary);

    // Cheap audit trail for Admin activity log (Admin SDK bypasses rules).
    try {
      await db.collection("activityLog").add({
        at: new Date().toISOString(),
        action: "checkin-push",
        source: "cloud-function",
        pickId: row.pickId || null,
        actor: checkerEmail || null,
        detail: `${who} checked in → push ${ok}/${results.length} delivered on ${checkinHost} (skipped self ${skippedSelf}, other-host ${skippedHost})`,
        targets: results.length,
        ok,
        failed: results.length - ok,
      });
    } catch (err) {
      logger.warn("activityLog write failed", { message: err && err.message });
    }
  }
);

/** Caller's site host: validated `host` param, else the request Origin header. */
function callerHost(request) {
  const fromParam = String((request.data && request.data.host) || "").trim().toLowerCase();
  if (PUSH_HOSTS.has(fromParam)) return fromParam;
  const origin = String((request.rawRequest && request.rawRequest.headers && request.rawRequest.headers.origin) || "");
  try {
    const h = new URL(origin).hostname.toLowerCase();
    if (PUSH_HOSTS.has(h)) return h;
  } catch (_) {
    /* no/invalid origin */
  }
  return null;
}

/** Mirrors firestore.rules isAdmin() / data/admins.json. */
const ADMIN_EMAILS = new Set(["sblanco2005@gmail.com"]);

/**
 * sendTestPush (callable, admin only): sends a test notification to the
 * CALLER's own enabled beta subscriptions. Never writes checkins/checkinFeed,
 * never notifies anyone else.
 */
exports.sendTestPush = onCall(
  {
    region: "us-central1",
    secrets: [VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT],
    memory: "256MiB",
    maxInstances: 2,
  },
  async (request) => {
    let auth = request.auth;
    if (!auth || !auth.uid) {
      // Fallback: verify a Bearer ID token ourselves (callable normally does this).
      const hdr = String((request.rawRequest && request.rawRequest.headers && request.rawRequest.headers.authorization) || "");
      const m = hdr.match(/^Bearer\s+(.+)$/i);
      if (m) {
        try {
          const token = await getAuth().verifyIdToken(m[1]);
          auth = { uid: token.uid, token };
        } catch (err) {
          logger.warn("sendTestPush bearer verify failed", { message: err && err.message });
        }
      }
    }
    if (!auth || !auth.uid) throw new HttpsError("unauthenticated", "Sign in first.");
    const email = String((auth.token && auth.token.email) || "").toLowerCase();
    if (!email || !ADMIN_EMAILS.has(email) || (auth.token && auth.token.email_verified === false)) {
      throw new HttpsError("permission-denied", "Admins only.");
    }
    const pub = (VAPID_PUBLIC.value() || "").trim();
    const priv = (VAPID_PRIVATE.value() || "").trim();
    const subject = (VAPID_SUBJECT.value() || "").trim() || "mailto:sblanco2005@gmail.com";
    if (!pub || !priv) throw new HttpsError("failed-precondition", "Push keys not configured.");
    webpush.setVapidDetails(subject, pub, priv);

    const db = getFirestore();
    const [byUid, byEmail] = await Promise.all([
      db.collection("pushSubscriptions").where("uid", "==", auth.uid).get(),
      db.collection("pushSubscriptions").where("email", "==", email).get(),
    ]);
    const docs = new Map();
    for (const d of [...byUid.docs, ...byEmail.docs]) docs.set(d.id, d);

    const host = callerHost(request);
    if (!host) throw new HttpsError("invalid-argument", "Unknown site host.");
    const name = shortName(auth.token && auth.token.name, email);
    const payload = JSON.stringify({
      title: `🔥 Test — ${name} just did Eddy’s Hell`,
      body: "Your turn — this week’s workout is waiting.",
      tag: `test-push-${Date.now()}`,
      url: clickUrlFor(host),
    });

    const jobs = [];
    for (const doc of docs.values()) {
      const sub = doc.data() || {};
      if (sub.enabled === false) continue;
      if (String(sub.host || "") !== host) continue;
      // Belt and braces: only the caller's own subscriptions.
      if (sub.uid !== auth.uid && String(sub.email || "").toLowerCase() !== email) continue;
      if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) continue;
      jobs.push(
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
            payload,
            { TTL: TTL_SECONDS, urgency: "high" }
          )
          .then(() => true)
          .catch(async (err) => {
            const status = err && (err.statusCode || err.status);
            logger.warn("test push fail", { id: doc.id, status, message: err && err.message });
            if (status === 404 || status === 410) {
              try {
                await doc.ref.set(
                  { enabled: false, disabledAt: new Date().toISOString(), disableReason: String(status) },
                  { merge: true }
                );
              } catch (_) {
                /* ok */
              }
            }
            return false;
          })
      );
    }
    const results = await Promise.all(jobs);
    const sent = results.filter(Boolean).length;
    const out = { sent, failed: results.length - sent, subscriptions: results.length };
    logger.info("test push", { email, ...out });
    try {
      await db.collection("activityLog").add({
        at: new Date().toISOString(),
        action: "test-push",
        source: "cloud-function",
        actor: email,
        detail: `Test push → ${sent}/${results.length} of own devices on ${host}`,
        ...out,
      });
    } catch (_) {
      /* best-effort */
    }
    return out;
  }
);

// ——— Admin broadcast (beta) ———

/** Same auth pattern as sendTestPush: request.auth, else verify Bearer ID token. */
async function resolveCallableAuth(request) {
  let auth = request.auth;
  if (!auth || !auth.uid) {
    const hdr = String((request.rawRequest && request.rawRequest.headers && request.rawRequest.headers.authorization) || "");
    const m = hdr.match(/^Bearer\s+(.+)$/i);
    if (m) {
      try {
        const token = await getAuth().verifyIdToken(m[1]);
        auth = { uid: token.uid, token };
      } catch (err) {
        logger.warn("bearer verify failed", { message: err && err.message });
      }
    }
  }
  if (!auth || !auth.uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const email = String((auth.token && auth.token.email) || "").toLowerCase();
  if (!email || !ADMIN_EMAILS.has(email) || (auth.token && auth.token.email_verified === false)) {
    throw new HttpsError("permission-denied", "Admins only.");
  }
  return { uid: auth.uid, email, token: auth.token || {} };
}

const BROADCAST_MIN_INTERVAL_MS = 30 * 1000;
const BROADCAST_SELF_MIN_INTERVAL_MS = 5 * 1000;
function safeBroadcastUrl(raw, host) {
  const root = clickUrlFor(host);
  const s = String(raw || "").trim();
  if (!s) return root;
  try {
    const origin = new URL(root).origin;
    const u = new URL(s, origin);
    // Only allow links back into the same app (no open redirects from a push).
    if (u.origin !== origin) return root;
    return u.href;
  } catch (_) {
    return root;
  }
}

exports.sendBroadcastPush = onCall(
  {
    region: "us-central1",
    secrets: [VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, STEPUP_SECRET],
    memory: "256MiB",
    maxInstances: 1,
  },
  async (request) => {
    const caller = await resolveCallableAuth(request);
    const data = request.data || {};
    const title = String(data.title || "").trim();
    const body = String(data.body || "").trim();
    // target: "self" = only caller's own beta devices (test); "all" = every beta device incl. caller.
    const target = data.target === "self" ? "self" : "all";
    const host = callerHost(request);
    if (!host) throw new HttpsError("invalid-argument", "Unknown site host.");
    // Beta: "Send to everyone" requires a Face ID step-up (prod has no step-up yet).
    if (target === "all" && STEPUP_HOSTS.has(host)) {
      requireStepUp(data.stepUp, caller.uid, host);
    }
    const url = safeBroadcastUrl(data.url, host);
    if (title.length < 1 || title.length > 60) {
      throw new HttpsError("invalid-argument", "Title must be 1–60 characters.");
    }
    if (body.length < 1 || body.length > 200) {
      throw new HttpsError("invalid-argument", "Message must be 1–200 characters.");
    }

    const pub = (VAPID_PUBLIC.value() || "").trim();
    const priv = (VAPID_PRIVATE.value() || "").trim();
    const subject = (VAPID_SUBJECT.value() || "").trim() || "mailto:sblanco2005@gmail.com";
    if (!pub || !priv) throw new HttpsError("failed-precondition", "Push keys not configured.");
    webpush.setVapidDetails(subject, pub, priv);

    const db = getFirestore();
    // Rate limit + reservation in one transaction so double-taps can't both send.
    // Self tests use their own (5s) lock so they never block a real broadcast.
    const lockRef = db.collection("broadcastMeta").doc((target === "self" ? "lockSelf__" : "lock__") + host);
    const minGap = target === "self" ? BROADCAST_SELF_MIN_INTERVAL_MS : BROADCAST_MIN_INTERVAL_MS;
    const now = Date.now();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      const last = snap.exists ? Number(snap.get("lastAtMs") || 0) : 0;
      if (now - last < minGap) {
        const wait = Math.ceil((minGap - (now - last)) / 1000);
        throw new HttpsError("resource-exhausted", `Slow down — try again in ${wait}s.`);
      }
      tx.set(lockRef, { lastAtMs: now, lastBy: caller.email }, { merge: true });
    });

    const subsSnap = await db.collection("pushSubscriptions").where("host", "==", host).get();
    const payload = JSON.stringify({
      title,
      body,
      tag: `broadcast-${now}`,
      url,
    });
    const jobs = [];
    for (const doc of subsSnap.docs) {
      const sub = doc.data() || {};
      if (sub.enabled === false) continue;
      if (String(sub.host || "") !== host) continue;
      const isSelf = sub.uid === caller.uid || String(sub.email || "").toLowerCase() === caller.email;
      if (target === "self" && !isSelf) continue;
      if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) continue;
      jobs.push(
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
            payload,
            { TTL: TTL_SECONDS, urgency: "high" }
          )
          .then(() => true)
          .catch(async (err) => {
            const status = err && (err.statusCode || err.status);
            logger.warn("broadcast push fail", { id: doc.id, status, message: err && err.message });
            if (status === 404 || status === 410) {
              try {
                await doc.ref.set(
                  { enabled: false, disabledAt: new Date().toISOString(), disableReason: String(status) },
                  { merge: true }
                );
              } catch (_) {
                /* ok */
              }
            }
            return false;
          })
      );
    }
    const results = await Promise.all(jobs);
    const sent = results.filter(Boolean).length;
    const out = { sent, failed: results.length - sent, recipients: results.length };
    const sentAt = new Date().toISOString();
    logger.info("broadcast", { by: caller.email, target, host, ...out });
    if (target === "all") {
      try {
        await db.collection("broadcasts").add({
          title,
          body,
          url,
          target,
          host,
          sentBy: caller.email,
          sentAt,
          ...out,
        });
      } catch (err) {
        logger.warn("broadcasts write failed", { message: err && err.message });
      }
    }
    try {
      await db.collection("activityLog").add({
        at: sentAt,
        action: target === "self" ? "broadcast-test" : "broadcast",
        source: "cloud-function",
        actor: caller.email,
        title,
        detail:
          target === "self"
            ? `Test broadcast “${title}” → ${sent}/${results.length} of own devices on ${host}`
            : `Broadcast “${title}” → ${sent}/${results.length} devices on ${host}`,
        ...out,
      });
    } catch (_) {
      /* best-effort */
    }
    return out;
  }
);

// ——— Admin Face ID (passkeys / WebAuthn) — beta step-up ———
const crypto = require("crypto");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

/** RP IDs we accept (passkeys are bound to the exact host). */
const PASSKEY_RP_HOSTS = new Set(["eddy-s-hell-beta.web.app", "eddy-s-hell.web.app"]);
/** Hosts where server-side step-up is enforced today (beta only; prod later). */
const STEPUP_HOSTS = new Set(["eddy-s-hell-beta.web.app", "eddy-s-hell.web.app"]);
const STEPUP_TTL_MS = 12 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromB64url(str) {
  return Buffer.from(String(str).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function signStepUp(uid, email, host) {
  const secret = (STEPUP_SECRET.value() || "").trim();
  if (!secret) throw new HttpsError("failed-precondition", "Step-up secret not configured.");
  const now = Date.now();
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ sub: uid, email, host, iat: Math.floor(now / 1000), exp: Math.floor((now + STEPUP_TTL_MS) / 1000), amr: ["passkey", "uv"] })
  );
  const sig = b64url(crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return { token: `${header}.${payload}.${sig}`, expiresAtMs: now + STEPUP_TTL_MS };
}

/** Throws unless token is a valid, unexpired step-up for uid on host. */
function requireStepUp(token, uid, host) {
  const secret = (STEPUP_SECRET.value() || "").trim();
  const fail = () => {
    throw new HttpsError("permission-denied", "Unlock Admin with Face ID first.");
  };
  if (!secret || !token || typeof token !== "string") fail();
  const parts = token.split(".");
  if (parts.length !== 3) fail();
  const expect = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  const got = fromB64url(parts[2]);
  if (got.length !== expect.length || !crypto.timingSafeEqual(got, expect)) fail();
  let p;
  try {
    p = JSON.parse(fromB64url(parts[1]).toString("utf8"));
  } catch (_) {
    fail();
  }
  if (!p || p.sub !== uid || p.host !== host || !(p.exp * 1000 > Date.now())) fail();
  return p;
}

function passkeyHost(request) {
  const h = callerHost(request);
  if (!h || !PASSKEY_RP_HOSTS.has(h)) throw new HttpsError("invalid-argument", "Face ID isn’t available on this site.");
  return h;
}

function credsCol(db, uid) {
  return db.collection("adminPasskeys").doc(uid).collection("creds");
}

async function credsForHost(db, uid, host) {
  const snap = await credsCol(db, uid).get();
  return snap.docs.map((d) => ({ docId: d.id, ...d.data() })).filter((c) => (c.rpID || host) === host);
}

async function saveChallenge(db, uid, kind, host, challenge) {
  await db.collection("passkeyChallenges").doc(`${uid}__${kind}`).set({
    challenge,
    host,
    expiresAtMs: Date.now() + CHALLENGE_TTL_MS,
    createdAt: new Date().toISOString(),
  });
}

/** Single-use: read + delete; throws if missing/expired/wrong host. */
async function consumeChallenge(db, uid, kind, host) {
  const ref = db.collection("passkeyChallenges").doc(`${uid}__${kind}`);
  const snap = await ref.get();
  await ref.delete().catch(() => {});
  const c = snap.exists ? snap.data() : null;
  if (!c || c.host !== host || !(Number(c.expiresAtMs) > Date.now())) {
    throw new HttpsError("deadline-exceeded", "Face ID request expired — try again.");
  }
  return c.challenge;
}

async function writeAdminSession(db, uid, host, expiresAtMs) {
  try {
    await db.collection("adminSessions").doc(uid).set(
      { verifiedUntil: new Date(expiresAtMs), host, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (_) {
    /* best-effort (future rules hook) */
  }
}

const PASSKEY_OPTS = {
  region: "us-central1",
  secrets: [STEPUP_SECRET],
  memory: "256MiB",
  maxInstances: 2,
};

exports.passkeyRegisterOptions = onCall(PASSKEY_OPTS, async (request) => {
  const caller = await resolveCallableAuth(request);
  const host = passkeyHost(request);
  const db = getFirestore();
  const existing = await credsForHost(db, caller.uid, host);
  // First device: Google admin sign-in is enough. More devices: need a current Face ID unlock.
  if (existing.length) requireStepUp((request.data || {}).stepUp, caller.uid, host);
  const options = await generateRegistrationOptions({
    rpName: "Eddy’s Hell Admin",
    rpID: host,
    userName: caller.email,
    userDisplayName: (caller.token && caller.token.name) || caller.email,
    userID: new TextEncoder().encode(caller.uid),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credId || c.docId, transports: c.transports || undefined })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
    timeout: 60000,
  });
  await saveChallenge(db, caller.uid, "reg", host, options.challenge);
  return { options };
});

exports.passkeyRegisterVerify = onCall(PASSKEY_OPTS, async (request) => {
  const caller = await resolveCallableAuth(request);
  const host = passkeyHost(request);
  const data = request.data || {};
  const db = getFirestore();
  const expectedChallenge = await consumeChallenge(db, caller.uid, "reg", host);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: data.response,
      expectedChallenge,
      expectedOrigin: `https://${host}`,
      expectedRPID: host,
      requireUserVerification: true,
    });
  } catch (err) {
    logger.warn("passkey register verify failed", { message: err && err.message });
    throw new HttpsError("invalid-argument", "Face ID setup couldn’t be verified — try again.");
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new HttpsError("invalid-argument", "Face ID setup couldn’t be verified — try again.");
  }
  const cred = verification.registrationInfo.credential;
  const label = String(data.deviceLabel || "").trim().slice(0, 60) || "This device";
  await credsCol(db, caller.uid).doc(cred.id).set({
    credId: cred.id,
    publicKey: b64url(cred.publicKey),
    counter: cred.counter || 0,
    transports: cred.transports || [],
    deviceType: verification.registrationInfo.credentialDeviceType || null,
    backedUp: !!verification.registrationInfo.credentialBackedUp,
    rpID: host,
    deviceLabel: label,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  });
  // Registration required user verification (Face ID/passcode) → unlock now too.
  const step = signStepUp(caller.uid, caller.email, host);
  await writeAdminSession(db, caller.uid, host, step.expiresAtMs);
  return { ok: true, credId: cred.id, ...step };
});

exports.passkeyAuthOptions = onCall(PASSKEY_OPTS, async (request) => {
  const caller = await resolveCallableAuth(request);
  const host = passkeyHost(request);
  const db = getFirestore();
  const creds = await credsForHost(db, caller.uid, host);
  if (!creds.length) return { hasCredentials: false };
  const options = await generateAuthenticationOptions({
    rpID: host,
    allowCredentials: creds.map((c) => ({ id: c.credId || c.docId, transports: c.transports || undefined })),
    userVerification: "required",
    timeout: 60000,
  });
  await saveChallenge(db, caller.uid, "auth", host, options.challenge);
  return { hasCredentials: true, options };
});

exports.passkeyAuthVerify = onCall(PASSKEY_OPTS, async (request) => {
  const caller = await resolveCallableAuth(request);
  const host = passkeyHost(request);
  const data = request.data || {};
  const db = getFirestore();
  const expectedChallenge = await consumeChallenge(db, caller.uid, "auth", host);
  const credId = data.response && data.response.id;
  if (!credId) throw new HttpsError("invalid-argument", "Missing Face ID response.");
  const ref = credsCol(db, caller.uid).doc(String(credId));
  const snap = await ref.get();
  if (!snap.exists || (snap.get("rpID") || host) !== host) {
    throw new HttpsError("not-found", "This Face ID device isn’t registered — set it up again.");
  }
  const c = snap.data();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: data.response,
      expectedChallenge,
      expectedOrigin: `https://${host}`,
      expectedRPID: host,
      credential: {
        id: c.credId || snap.id,
        publicKey: new Uint8Array(fromB64url(c.publicKey)),
        counter: Number(c.counter) || 0,
        transports: c.transports || undefined,
      },
      requireUserVerification: true,
    });
  } catch (err) {
    logger.warn("passkey auth verify failed", { message: err && err.message });
    throw new HttpsError("permission-denied", "Face ID couldn’t be verified — try again.");
  }
  if (!verification.verified) throw new HttpsError("permission-denied", "Face ID couldn’t be verified — try again.");
  await ref.set(
    { counter: verification.authenticationInfo.newCounter || 0, lastUsedAt: new Date().toISOString() },
    { merge: true }
  );
  const step = signStepUp(caller.uid, caller.email, host);
  await writeAdminSession(db, caller.uid, host, step.expiresAtMs);
  return { ok: true, ...step };
});

/** List this admin's Face ID devices for the current site (needs a valid unlock). */
exports.passkeyList = onCall(PASSKEY_OPTS, async (request) => {
  const caller = await resolveCallableAuth(request);
  const host = passkeyHost(request);
  requireStepUp((request.data || {}).stepUp, caller.uid, host);
  const creds = await credsForHost(getFirestore(), caller.uid, host);
  return {
    devices: creds.map((c) => ({
      credId: c.credId || c.docId,
      deviceLabel: c.deviceLabel || "Device",
      createdAt: c.createdAt || null,
      lastUsedAt: c.lastUsedAt || null,
    })),
  };
});

/** Remove one Face ID device (needs a valid unlock). */
exports.passkeyDelete = onCall(PASSKEY_OPTS, async (request) => {
  const caller = await resolveCallableAuth(request);
  const host = passkeyHost(request);
  const data = request.data || {};
  requireStepUp(data.stepUp, caller.uid, host);
  const id = String(data.credId || "");
  if (!id) throw new HttpsError("invalid-argument", "Missing device id.");
  const ref = credsCol(getFirestore(), caller.uid).doc(id);
  const snap = await ref.get();
  if (!snap.exists || (snap.get("rpID") || host) !== host) throw new HttpsError("not-found", "Device not found.");
  await ref.delete();
  return { ok: true };
});
