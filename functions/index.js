/**
 * Eddy's Hell — Cloud Functions (beta Web Push on checkinFeed create).
 *
 * BLOCKER: project eddy-s-hell has billingEnabled=false (Spark). Deploying
 * Cloud Functions requires Blaze. See README / DEPLOY-NOTES for Santiago steps.
 *
 * VAPID: set via `firebase functions:config:set webpush.public_key=... webpush.private_key=... webpush.subject=mailto:...`
 * or environment config. Falls back to reading ../secrets/vapid.json in emulator only.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();
const db = admin.firestore();

function loadVapid() {
  const cfg = (functions.config() && functions.config().webpush) || {};
  let publicKey = cfg.public_key || process.env.WEBPUSH_PUBLIC_KEY || "";
  let privateKey = cfg.private_key || process.env.WEBPUSH_PRIVATE_KEY || "";
  let subject = cfg.subject || process.env.WEBPUSH_SUBJECT || "mailto:sblanco2005@gmail.com";
  if (!publicKey || !privateKey) {
    try {
      const fs = require("fs");
      const path = require("path");
      const p = path.join(__dirname, "..", "secrets", "vapid.json");
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        publicKey = publicKey || j.publicKey;
        privateKey = privateKey || j.privateKey;
        subject = subject || j.subject || subject;
      }
    } catch (_) {
      /* ignore */
    }
  }
  return { publicKey, privateKey, subject };
}

function difficultyLabel(d) {
  const k = String(d || "").toLowerCase();
  if (k === "easy") return "Easy";
  if (k === "hard") return "Hard";
  if (k === "okay") return "Okay";
  return "checked in";
}

function shortName(displayName, email) {
  const name = String(displayName || "").trim();
  if (name) {
    const first = name.split(/\s+/)[0];
    if (first && first.indexOf("@") < 0) return first;
  }
  const local = String(email || "").split("@")[0] || "Member";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

exports.onCheckinFeedCreate = functions.firestore
  .document("checkinFeed/{docId}")
  .onCreate(async (snap) => {
    const row = snap.data() || {};
    const checkerUid = row.uid || "";
    const checkerEmail = String(row.email || "").toLowerCase();
    const who = shortName(row.displayName, row.email);
    const diff = difficultyLabel(row.difficulty);
    const title = "Eddy's Hell";
    const body = `${who} checked in · ${diff} — your turn?`;
    const payload = JSON.stringify({
      title,
      body,
      tag: `checkin-${row.pickId || ""}-${checkerEmail}`,
      url: "/",
      pickId: row.pickId || null,
    });

    const vapid = loadVapid();
    if (!vapid.publicKey || !vapid.privateKey) {
      console.error("Web Push VAPID keys not configured — skip send");
      return null;
    }
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

    const subsSnap = await db.collection("pushSubscriptions").where("enabled", "==", true).get();
    const jobs = [];
    for (const doc of subsSnap.docs) {
      const sub = doc.data() || {};
      if (!sub.enabled) continue;
      if (checkerUid && sub.uid === checkerUid) continue;
      if (checkerEmail && String(sub.email || "").toLowerCase() === checkerEmail) continue;
      if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) continue;
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      };
      jobs.push(
        webpush
          .sendNotification(pushSubscription, payload, { TTL: 60 * 60 * 12, urgency: "high" })
          .then(() => ({ id: doc.id, ok: true }))
          .catch(async (err) => {
            const status = err && (err.statusCode || err.status);
            console.warn("push fail", doc.id, status, err && err.message);
            // Gone / expired — disable
            if (status === 404 || status === 410) {
              try {
                await doc.ref.set({ enabled: false, disabledAt: new Date().toISOString(), disableReason: String(status) }, { merge: true });
              } catch (_) {
                /* ok */
              }
            }
            return { id: doc.id, ok: false, status };
          })
      );
    }
    const results = await Promise.all(jobs);
    console.log("checkin push sent", { checkerEmail, total: results.length, ok: results.filter((r) => r.ok).length });
    return null;
  });
