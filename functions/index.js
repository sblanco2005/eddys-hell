/**
 * Eddy's Hell — Cloud Functions (2nd gen).
 *
 * onCheckinFeedCreate: when a member's checkinFeed/{pickId__email} doc is
 * created (first check-in of the week), send Web Push to every OTHER member's
 * BETA subscription (host == eddy-s-hell-beta.web.app). Prod subscriptions are
 * ignored until we deliberately widen BETA_HOSTS.
 *
 * Requires Blaze. Secrets (set once):
 *   firebase functions:secrets:set VAPID_PUBLIC  --project eddy-s-hell
 *   firebase functions:secrets:set VAPID_PRIVATE --project eddy-s-hell
 *   firebase functions:secrets:set VAPID_SUBJECT --project eddy-s-hell
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const webpush = require("web-push");

initializeApp();

const VAPID_PUBLIC = defineSecret("VAPID_PUBLIC");
const VAPID_PRIVATE = defineSecret("VAPID_PRIVATE");
const VAPID_SUBJECT = defineSecret("VAPID_SUBJECT");

/** Only these site hosts receive check-in pushes (beta-only for now). */
const PUSH_HOSTS = new Set(["eddy-s-hell-beta.web.app"]);
const CLICK_URL = "https://eddy-s-hell-beta.web.app/";
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
    // Beta-only: prod check-ins carry no host field (or a non-beta host) → skip.
    if (!PUSH_HOSTS.has(String(row.host || ""))) {
      logger.info("skip non-beta check-in", { docId: event.params && event.params.docId, host: row.host || null });
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
      url: CLICK_URL,
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
      if (!PUSH_HOSTS.has(String(sub.host || ""))) {
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
        detail: `${who} checked in → push ${ok}/${results.length} delivered (skipped self ${skippedSelf}, non-beta ${skippedHost})`,
        targets: results.length,
        ok,
        failed: results.length - ok,
      });
    } catch (err) {
      logger.warn("activityLog write failed", { message: err && err.message });
    }
  }
);

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
    const auth = request.auth;
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

    const name = shortName(auth.token && auth.token.name, email);
    const payload = JSON.stringify({
      title: `🔥 Test — ${name} just did Eddy’s Hell`,
      body: "Your turn — this week’s workout is waiting.",
      tag: `test-push-${Date.now()}`,
      url: CLICK_URL,
    });

    const jobs = [];
    for (const doc of docs.values()) {
      const sub = doc.data() || {};
      if (sub.enabled === false) continue;
      if (!PUSH_HOSTS.has(String(sub.host || ""))) continue;
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
        detail: `Test push → ${sent}/${results.length} of own beta devices`,
        ...out,
      });
    } catch (_) {
      /* best-effort */
    }
    return out;
  }
);
