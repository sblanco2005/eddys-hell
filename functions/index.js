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
    secrets: [VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT],
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
