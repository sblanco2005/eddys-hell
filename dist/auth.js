/**
 * Eddy's Hell — Auth (Firebase Google OR localhost mock)
 * Exposes window.EddysHellAuth
 */
(function () {
  "use strict";

  const CHECKINS_KEY = "eddys-hell-checkins-v1";
  const MOCK_SESSION_KEY = "eddys-hell-mock-user-v1";
  const MEMBERS_KEY = "eddys-hell-members-v1";

  /** @type {{ email: string, displayName: string, photoURL: string|null, uid: string, provider: string }|null} */
  let currentUser = null;
  /** @type {string[]} */
  let adminEmails = [];
  /** @type {string[]} */
  let memberEmails = [];
  /** @type {string|null} */
  let membersUpdatedAt = null;
  /** @type {string|null} */
  let blockMessage = null; // member allowlist denial only
  /** @type {string|null} */
  let authHintMessage = null; // redirect/popup/privacy hints (NOT member denial)
  /** @type {object|null} */
  let firebaseConfig = null;
  /** @type {boolean} */
  let firebaseReady = false;
  /** @type {boolean} */
  let gating = false;
  /** @type {boolean} */
  let initSettled = false;
  /** @type {((v?: void) => void)|null} */
  let initResolve = null;
  /** Resolves when Auth.init() finishes (success or failure). */
  const initReadyPromise = new Promise((resolve) => {
    initResolve = resolve;
  });
  /** @type {Array<(u: object|null) => void>} */
  const listeners = [];

  function markInitDone() {
    if (initSettled) return;
    initSettled = true;
    if (initResolve) {
      try {
        initResolve();
      } catch (_) {
        /* ok */
      }
      initResolve = null;
    }
  }

  function isInitPending() {
    return !initSettled;
  }

  /**
   * Await Auth.init() completion. Resolves after success or failure.
   * @param {number} [timeoutMs=20000]
   */
  async function waitForInit(timeoutMs) {
    const ms = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 20000;
    if (initSettled) return;
    let timer = null;
    try {
      await Promise.race([
        initReadyPromise,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const err = new Error("Auth init timed out");
            err.code = "auth-init-timeout";
            reject(err);
          }, ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function isLocalhost() {
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function isGithubPages() {
    return /\.github\.io$/i.test(location.hostname);
  }

  /** True on the beta Hosting site (eddy-s-hell-beta.web.app). Never steer beta → stable. */
  function isBetaHost() {
    const h = location.hostname || "";
    return /beta/i.test(h) || h === "eddy-s-hell-beta.web.app";
  }

  /** Firebase Hosting origins (stable + beta + any *.web.app / *.firebaseapp.com). */
  function isFirebaseHosting() {
    const h = location.hostname;
    return (
      h === "eddy-s-hell.web.app" ||
      h === "eddy-s-hell-beta.web.app" ||
      h === "eddy-s-hell.firebaseapp.com" ||
      h === "eddy-s-hell-beta.firebaseapp.com" ||
      /\.web\.app$/i.test(h) ||
      /\.firebaseapp\.com$/i.test(h)
    );
  }

  /** Hostname to mention in popup/privacy hints (current host on beta/stable). */
  function hostingHintHost() {
    if (isFirebaseHosting()) return location.hostname;
    return "eddy-s-hell.web.app";
  }

  /**
   * In-app browsers (WhatsApp, Instagram, FB, Messenger, Line, etc.) break
   * Google popup/redirect auth — Firebase often throws auth/argument-error.
   * Detect and steer users to Safari/Chrome instead of attempting sign-in.
   */
  function isInAppBrowser() {
    const ua = navigator.userAgent || "";
    // Explicit in-app tokens
    if (
      /WhatsApp/i.test(ua) ||
      /Instagram/i.test(ua) ||
      /FBAN|FBAV|FB_IAB|FBAN\//i.test(ua) ||
      /Messenger/i.test(ua) ||
      /Line\//i.test(ua) ||
      /Twitter/i.test(ua) ||
      /LinkedInApp/i.test(ua) ||
      /Snapchat/i.test(ua) ||
      /Pinterest/i.test(ua) ||
      /TikTok/i.test(ua) ||
      /BytedanceWebview|musical_ly/i.test(ua) ||
      /MicroMessenger/i.test(ua) || // WeChat
      /Discord/i.test(ua) ||
      /Slack/i.test(ua) ||
      /Telegram/i.test(ua)
    ) {
      return true;
    }
    // Android WebView heuristic (not Chrome/Firefox standalone)
    if (/Android/i.test(ua) && /wv\)/i.test(ua)) return true;
    // iOS: standalone Safari has "Safari" or Version/; many IABs omit Safari
    // but keep Google Chrome iOS (CriOS) and Firefox iOS (FxiOS) as real browsers.
    const isIOS =
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) {
      const isRealBrowser =
        /Safari/i.test(ua) || /CriOS/i.test(ua) || /FxiOS/i.test(ua) || /EdgiOS/i.test(ua);
      // Some IABs still include "Safari" in UA — the explicit tokens above catch those.
      if (!isRealBrowser) return true;
    }
    return false;
  }

  function publicAppUrl() {
    try {
      const u = new URL(location.href);
      // Drop ephemeral hash noise; keep path/query for deep links.
      u.hash = "";
      return u.toString().replace(/\/$/, "") || location.origin + location.pathname;
    } catch (_) {
      return location.href.split("#")[0];
    }
  }

  function openInBrowserMessage() {
    const isIOS =
      /iPad|iPhone|iPod/i.test(navigator.userAgent || "") ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const browser = isIOS ? "Safari" : "your browser (Chrome)";
    return (
      "Google sign-in does not work inside WhatsApp / Instagram / Facebook. " +
      "Tap ⋯ or Open in " +
      browser +
      ", then sign in there."
    );
  }

  function preferredLiveUrl() {
    // Beta is first-class — never auto-steer beta users to stable.
    if (isBetaHost()) return "https://eddy-s-hell-beta.web.app/";
    return "https://eddy-s-hell.web.app/";
  }

  function friendlyAuthError(err) {
    const code = (err && err.code) || "";
    const msg = (err && err.message) || String(err || "");
    if (
      code === "auth/argument-error" ||
      /auth\/argument-error/i.test(msg) ||
      /argument-error/i.test(msg)
    ) {
      if (isInAppBrowser()) return openInBrowserMessage();
      if (isGithubPages()) {
        return (
          "Sign-in on this GitHub Pages mirror is unreliable on many phones. " +
          "Open " + preferredLiveUrl() + " instead (same app, matching auth domain), then sign in."
        );
      }
      if (isFirebaseHosting()) {
        return (
          "Sign-in could not start. Allow popups for " + hostingHintHost() + ", or in Safari " +
          "turn off \"Reduce Advanced Privacy Protections\" for this site, then try again."
        );
      }
      return (
        "Sign-in could not start. Allow popups for this site, or in Safari turn off " +
        "\"Reduce Advanced Privacy Protections\" for this site / try again."
      );
    }
    if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
      if (isFirebaseHosting()) {
        return (
          "Popup blocked or closed. Allow popups for this site, or reduce privacy " +
          "protections for " + hostingHintHost() + ", then try again."
        );
      }
      return (
        "Popup blocked or closed. Allow popups for this site and try again, " +
        "or open " + preferredLiveUrl() + " in Safari."
      );
    }
    if (code === "auth/unauthorized-domain") {
      return "This site is not authorized for Google sign-in. Tell Santiago.";
    }
    if (code === "auth/network-request-failed") {
      return "Network error during sign-in. Check your connection and try again.";
    }
    if (/^Firebase:\s*Error\s*\(/i.test(msg) && code) {
      return "Sign-in failed (" + code + "). Try again.";
    }
    return msg || "Sign-in failed. Try again.";
  }

  /** ?admin=1 bypass — localhost only, never on github.io */
  function adminBypassEnabled() {
    if (isGithubPages()) return false;
    if (!isLocalhost()) return false;
    const q = new URLSearchParams(location.search);
    return q.get("admin") === "1";
  }

  function configLooksReady(cfg) {
    if (!cfg || typeof cfg !== "object") return false;
    const key = (cfg.apiKey || "").trim();
    const project = (cfg.projectId || "").trim();
    return key.length > 8 && project.length > 0;
  }

  function normalizeEmail(e) {
    return String(e || "").trim().toLowerCase();
  }

  function isAdminEmail(email) {
    const e = normalizeEmail(email);
    if (!e) return false;
    return adminEmails.some((a) => normalizeEmail(a) === e);
  }

  function isMemberEmail(email) {
    const e = normalizeEmail(email);
    if (!e) return false;
    return memberEmails.some((m) => normalizeEmail(m) === e);
  }

  /** Admins always allowed. Empty members list = strict (nobody else). */
  function isAllowedEmail(email) {
    if (adminBypassEnabled()) return true;
    if (isAdminEmail(email)) return true;
    return isMemberEmail(email);
  }

  function getRole(user) {
    if (adminBypassEnabled()) return "admin";
    if (!user) return "guest";
    if (isAdminEmail(user.email)) return "admin";
    return "member";
  }

  function notify() {
    const snap = currentUser ? { ...currentUser, role: getRole(currentUser) } : null;
    for (const fn of listeners) {
      try {
        fn(snap);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function setUser(user) {
    currentUser = user;
    notify();
  }

  function onAuthChange(fn) {
    listeners.push(fn);
    fn(currentUser ? { ...currentUser, role: getRole(currentUser) } : null);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  // ——— Members allowlist ———

  function parseMembersPayload(data) {
    const emails = Array.isArray(data && data.emails)
      ? data.emails.map(normalizeEmail).filter(Boolean)
      : [];
    // de-dupe preserve order
    const seen = new Set();
    const unique = [];
    for (const e of emails) {
      if (seen.has(e)) continue;
      seen.add(e);
      unique.push(e);
    }
    return {
      emails: unique,
      updatedAt: (data && data.updatedAt) || null,
    };
  }

  function applyMembers(parsed) {
    memberEmails = parsed.emails;
    membersUpdatedAt = parsed.updatedAt;
  }

  async function loadMembers() {
    let fileParsed = { emails: [], updatedAt: null };
    try {
      const res = await fetch("data/members.json", { cache: "no-store" });
      if (res.ok) {
        fileParsed = parseMembersPayload(await res.json());
      }
    } catch (_) {
      /* empty = strict */
    }

    let localParsed = null;
    try {
      const raw = localStorage.getItem(MEMBERS_KEY);
      if (raw) localParsed = parseMembersPayload(JSON.parse(raw));
    } catch (_) {
      localParsed = null;
    }

    if (localParsed && localParsed.updatedAt) {
      const localTs = Date.parse(localParsed.updatedAt);
      const fileTs = fileParsed.updatedAt ? Date.parse(fileParsed.updatedAt) : 0;
      if (
        Number.isFinite(localTs) &&
        localTs > (Number.isFinite(fileTs) ? fileTs : 0)
      ) {
        applyMembers(localParsed);
        return getMembers();
      }
    }
    applyMembers(fileParsed);
    return getMembers();
  }

  function getMembers() {
    return {
      emails: [...memberEmails],
      updatedAt: membersUpdatedAt,
    };
  }

  /** Update in-memory + localStorage; returns payload for download/publish. */
  function saveMembers(emails) {
    const parsed = parseMembersPayload({
      emails,
      updatedAt: new Date().toISOString(),
    });
    applyMembers(parsed);
    const payload = {
      emails: parsed.emails,
      updatedAt: parsed.updatedAt,
    };
    try {
      localStorage.setItem(MEMBERS_KEY, JSON.stringify(payload));
    } catch (_) {
      /* ok */
    }
    return payload;
  }

  function getBlockMessage() {
    return blockMessage;
  }

  function getAuthHintMessage() {
    return authHintMessage;
  }

  /** Banner for landing: member denial vs sign-in hint (separate titles in UI). */
  function getAuthBanner() {
    if (blockMessage) {
      return {
        kind: "denied",
        title: "Not on the member list",
        message: blockMessage,
      };
    }
    if (authHintMessage) {
      return {
        kind: "hint",
        title: "Sign-in issue",
        message: authHintMessage,
      };
    }
    return null;
  }

  function clearBlockMessage() {
    blockMessage = null;
  }

  function clearAuthHintMessage() {
    authHintMessage = null;
  }

  // ——— Check-ins (Firestore when available, else localStorage) ———

  /** @type {any} */
  let fbDb = null;
  /** @type {boolean} */
  let firestoreReady = false;
  /** @type {string|null} */
  let firestoreStatus = null; // "cloud" | "local" | "error"
  /** @type {(() => void)|null} */
  let checkinsUnsub = null;
  /** @type {string|null} */
  let checkinsWatchPickId = null;
  /** @type {Array<() => void>} */
  const checkinListeners = [];

  function loadCheckins() {
    try {
      const raw = localStorage.getItem(CHECKINS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveCheckins(list) {
    localStorage.setItem(CHECKINS_KEY, JSON.stringify(list));
  }

  function mergeCheckinRow(list, row) {
    const e = normalizeEmail(row.email);
    const idx = list.findIndex(
      (c) => normalizeEmail(c.email) === e && c.pickId === row.pickId
    );
    if (idx >= 0) {
      const prev = list[idx];
      const prevTs = Date.parse(prev.at || 0) || 0;
      const nextTs = Date.parse(row.at || 0) || 0;
      if (nextTs >= prevTs) list[idx] = { ...prev, ...row, email: e };
    } else {
      list.push({ ...row, email: e });
    }
    return list;
  }

  function notifyCheckins() {
    for (const fn of checkinListeners) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
  }

  function onCheckinsChange(fn) {
    checkinListeners.push(fn);
    return () => {
      const i = checkinListeners.indexOf(fn);
      if (i >= 0) checkinListeners.splice(i, 1);
    };
  }

  function checkinDocId(pickId, email) {
    const e = normalizeEmail(email).replace(/[^a-z0-9@._-]/g, "_");
    return `${pickId}__${e}`;
  }

  function getCheckinSyncMode() {
    if (firestoreReady && firestoreStatus !== "error") return "cloud";
    if (firestoreStatus === "error") return "local-error";
    return "local";
  }

  function upsertCheckinLocal({ email, displayName, pickId, difficulty, notes, at }) {
    const list = loadCheckins();
    const e = normalizeEmail(email);
    const diff = String(difficulty || "").toLowerCase();
    const row = {
      email: e,
      displayName: displayName || e,
      pickId,
      at: at || new Date().toISOString(),
      difficulty: ["easy", "okay", "hard"].includes(diff) ? diff : "",
      notes: (notes || "").trim(),
    };
    mergeCheckinRow(list, row);
    saveCheckins(list);
    return row;
  }

  async function upsertCheckin({ email, displayName, pickId, difficulty, notes }) {
    const row = upsertCheckinLocal({ email, displayName, pickId, difficulty, notes });
    notifyCheckins();

    if (firestoreReady && fbDb && firestoreSetDoc && firestoreDoc) {
      try {
        const id = checkinDocId(pickId, row.email);
        const payload = {
          email: row.email,
          displayName: row.displayName,
          pickId: row.pickId,
          at: row.at,
          notes: row.notes || "",
        };
        if (row.difficulty) payload.difficulty = row.difficulty;
        await firestoreSetDoc(
          firestoreDoc(fbDb, "checkins", id),
          payload,
          { merge: true }
        );
        firestoreStatus = "cloud";
      } catch (err) {
        console.warn("Firestore check-in write failed:", err);
        firestoreStatus = "error";
      }
    }
    notifyCheckins();
    return row;
  }

  function checkinsForPick(pickId) {
    return loadCheckins()
      .filter((c) => c.pickId === pickId)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }

  function myCheckin(pickId, email) {
    const e = normalizeEmail(email);
    return (
      loadCheckins().find(
        (c) => c.pickId === pickId && normalizeEmail(c.email) === e
      ) || null
    );
  }

  async function refreshCheckinsForPick(pickId) {
    if (!pickId) return checkinsForPick(pickId);
    if (!firestoreReady || !fbDb || !firestoreGetDocs) {
      firestoreStatus = firestoreReady ? firestoreStatus : "local";
      return checkinsForPick(pickId);
    }
    try {
      const q = firestoreQuery(
        firestoreCollection(fbDb, "checkins"),
        firestoreWhere("pickId", "==", pickId)
      );
      const snap = await firestoreGetDocs(q);
      const list = loadCheckins();
      snap.forEach((d) => {
        const data = d.data();
        if (data && data.pickId && data.email) mergeCheckinRow(list, data);
      });
      saveCheckins(list);
      firestoreStatus = "cloud";
      notifyCheckins();
    } catch (err) {
      console.warn("Firestore check-in read failed:", err);
      firestoreStatus = "error";
      notifyCheckins();
    }
    return checkinsForPick(pickId);
  }

  function watchCheckinsForPick(pickId) {
    if (checkinsUnsub) {
      try {
        checkinsUnsub();
      } catch (_) {
        /* ok */
      }
      checkinsUnsub = null;
      checkinsWatchPickId = null;
    }
    if (!pickId || !firestoreReady || !fbDb || !firestoreOnSnapshot) {
      return;
    }
    checkinsWatchPickId = pickId;
    try {
      const q = firestoreQuery(
        firestoreCollection(fbDb, "checkins"),
        firestoreWhere("pickId", "==", pickId)
      );
      checkinsUnsub = firestoreOnSnapshot(
        q,
        (snap) => {
          const list = loadCheckins();
          snap.forEach((d) => {
            const data = d.data();
            if (data && data.pickId && data.email) mergeCheckinRow(list, data);
          });
          saveCheckins(list);
          firestoreStatus = "cloud";
          notifyCheckins();
        },
        (err) => {
          console.warn("Firestore check-in watch failed:", err);
          firestoreStatus = "error";
          notifyCheckins();
        }
      );
    } catch (err) {
      console.warn("Firestore check-in watch setup failed:", err);
      firestoreStatus = "error";
    }
  }

  // ——— Config: this-week + rule (Firestore live source of truth) ———

  /** Strip undefined so Firestore setDoc does not reject. */
  function scrubUndefined(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const out = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      out[k] = v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)
        ? scrubUndefined(v)
        : v;
    }
    return out;
  }

  function requireFirestoreWrite() {
    if (!firestoreReady || !fbDb || !firestoreSetDoc || !firestoreDoc) {
      const err = new Error("Firestore not ready — cannot publish yet.");
      err.code = "firestore-not-ready";
      throw err;
    }
  }

  function sameThisWeekPick(a, b) {
    if (!a || !b) return false;
    const aId = a.pickId || a.id || "";
    const bId = b.pickId || b.id || "";
    if (aId && bId && aId === bId) return true;
    if (a.relPath && b.relPath && String(a.relPath) === String(b.relPath)) return true;
    if (a.filename && b.filename && String(a.filename) === String(b.filename)) return true;
    return false;
  }

  async function publishThisWeek(payload) {
    requireFirestoreWrite();
    const base = payload && typeof payload === "object" ? payload : {};
    const pickId = base.pickId || base.id;
    if (!pickId) {
      throw new Error("publishThisWeek: missing pickId");
    }
    let youtubeId = base.youtubeId || null;
    let youtubeUrl = base.youtubeUrl || null;
    // Preserve existing youtubeId when re-publishing the same pick/file without one.
    // Writing null with merge:true previously wiped a live YouTube id.
    if (!youtubeId) {
      try {
        const existing = await loadThisWeekFromCloud();
        if (
          existing &&
          existing.youtubeId &&
          sameThisWeekPick(existing, { pickId, filename: base.filename, relPath: base.relPath })
        ) {
          youtubeId = existing.youtubeId;
          youtubeUrl =
            youtubeUrl ||
            existing.youtubeUrl ||
            ("https://www.youtube.com/watch?v=" + existing.youtubeId);
        }
      } catch (err) {
        console.warn("publishThisWeek youtube preserve read failed:", err);
      }
    }
    // Hard rule: never replace live thisWeek without a YouTube video already attached.
    // Staging without a video goes to config/nextWeek via stageNextWeek — not here.
    if (!youtubeId) {
      const err = new Error(
        "Upload YouTube first — won't replace this week without a video."
      );
      err.code = "youtube-required";
      throw err;
    }
    if (!youtubeUrl) {
      youtubeUrl = "https://www.youtube.com/watch?v=" + youtubeId;
    }
    const docPayload = scrubUndefined({
      pickId,
      id: pickId,
      filename: base.filename || "",
      folderType: base.folderType || null,
      hr: typeof base.hr === "number" ? base.hr : base.hr ?? null,
      relPath: base.relPath || "",
      sizeBytes: base.sizeBytes ?? null,
      mtime: base.mtime || null,
      rawTags: Array.isArray(base.rawTags) ? base.rawTags : [],
      pickedAt: base.pickedAt || new Date().toISOString(),
      why: base.why || "",
      matchCount: base.matchCount ?? null,
      youtubeId,
      youtubeUrl,
      archiveRoot: base.archiveRoot || "/Volumes/EddysHell/",
      note: base.note || null,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser ? normalizeEmail(currentUser.email) : null,
    });
    await firestoreSetDoc(
      firestoreDoc(fbDb, "config", "thisWeek"),
      docPayload,
      { merge: true }
    );
    firestoreStatus = "cloud";
    return docPayload;
  }

  async function loadThisWeekFromCloud() {
    if (!firestoreReady || !fbDb || !firestoreGetDoc || !firestoreDoc) {
      return null;
    }
    try {
      const snap = await firestoreGetDoc(firestoreDoc(fbDb, "config", "thisWeek"));
      if (!snap.exists) return null;
      const data = snap.data();
      firestoreStatus = "cloud";
      return data && (data.pickId || data.id) ? data : null;
    } catch (err) {
      console.warn("Firestore thisWeek read failed:", err);
      firestoreStatus = "error";
      return null;
    }
  }

  /**
   * Stage the next workout candidate WITHOUT touching live config/thisWeek.
   * Used when admin picks a file that has no youtubeId yet. Live week stays
   * until YouTube upload succeeds and promoteStagedToLive runs.
   */
  async function stageNextWeek(payload) {
    requireFirestoreWrite();
    const base = payload && typeof payload === "object" ? payload : {};
    const pickId = base.pickId || base.id;
    if (!pickId) {
      throw new Error("stageNextWeek: missing pickId");
    }
    const youtubeId = base.youtubeId || null;
    let youtubeUrl = base.youtubeUrl || null;
    if (youtubeId && !youtubeUrl) {
      youtubeUrl = "https://www.youtube.com/watch?v=" + youtubeId;
    }
    const docPayload = scrubUndefined({
      pickId,
      id: pickId,
      filename: base.filename || "",
      folderType: base.folderType || null,
      hr: typeof base.hr === "number" ? base.hr : base.hr ?? null,
      relPath: base.relPath || "",
      sizeBytes: base.sizeBytes ?? null,
      mtime: base.mtime || null,
      rawTags: Array.isArray(base.rawTags) ? base.rawTags : [],
      pickedAt: base.pickedAt || new Date().toISOString(),
      why: base.why || "",
      matchCount: base.matchCount ?? null,
      // Only include youtube fields when present — never write youtubeId:null here
      // in a way that could be confused with live; staged may omit video.
      ...(youtubeId ? { youtubeId, youtubeUrl } : {}),
      archiveRoot: base.archiveRoot || "/Volumes/EddysHell/",
      note: base.note || null,
      status: "staged",
      stagedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser ? normalizeEmail(currentUser.email) : null,
    });
    await firestoreSetDoc(
      firestoreDoc(fbDb, "config", "nextWeek"),
      docPayload,
      { merge: false }
    );
    firestoreStatus = "cloud";
    return docPayload;
  }

  async function loadNextWeekFromCloud() {
    if (!firestoreReady || !fbDb || !firestoreGetDoc || !firestoreDoc) {
      return null;
    }
    try {
      const snap = await firestoreGetDoc(firestoreDoc(fbDb, "config", "nextWeek"));
      if (!snap.exists) return null;
      const data = snap.data();
      firestoreStatus = "cloud";
      if (!data || !(data.pickId || data.id)) return null;
      if (data.status === "promoted" || data.status === "cleared") return null;
      return data;
    } catch (err) {
      console.warn("Firestore nextWeek read failed:", err);
      firestoreStatus = "error";
      return null;
    }
  }

  /**
   * After compress+YouTube upload succeeds: write live config/thisWeek from the
   * staged nextWeek pick + youtubeId. Never promotes without a video id.
   */
  async function promoteStagedToLive(youtubeId, youtubeUrl) {
    const staged = await loadNextWeekFromCloud();
    const id = youtubeId || (staged && staged.youtubeId) || null;
    if (!id) {
      const err = new Error(
        "Upload YouTube first — won't replace this week without a video."
      );
      err.code = "youtube-required";
      throw err;
    }
    if (!staged) {
      throw new Error("No staged next week to promote — Stage next week first.");
    }
    const url =
      youtubeUrl ||
      staged.youtubeUrl ||
      ("https://www.youtube.com/watch?v=" + id);
    const live = await publishThisWeek({
      ...staged,
      youtubeId: id,
      youtubeUrl: url,
    });
    // Mark staged doc promoted so it is no longer treated as pending.
    try {
      await firestoreSetDoc(
        firestoreDoc(fbDb, "config", "nextWeek"),
        scrubUndefined({
          status: "promoted",
          promotedAt: new Date().toISOString(),
          promotedYoutubeId: id,
          pickId: staged.pickId || staged.id,
          filename: staged.filename || "",
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser ? normalizeEmail(currentUser.email) : null,
        }),
        { merge: true }
      );
    } catch (err) {
      console.warn("nextWeek promote mark failed:", err);
    }
    return live;
  }

  /** @type {(() => void)|null} */
  let thisWeekUnsub = null;

  function watchThisWeek(callback) {
    if (thisWeekUnsub) {
      try {
        thisWeekUnsub();
      } catch (_) {
        /* ok */
      }
      thisWeekUnsub = null;
    }
    if (!firestoreReady || !fbDb || !firestoreOnSnapshot || !firestoreDoc) {
      return () => {};
    }
    try {
      thisWeekUnsub = firestoreOnSnapshot(
        firestoreDoc(fbDb, "config", "thisWeek"),
        (snap) => {
          if (!snap.exists) return;
          const data = snap.data();
          if (data && (data.pickId || data.id) && typeof callback === "function") {
            try {
              callback(data);
            } catch (err) {
              console.error(err);
            }
          }
        },
        (err) => {
          console.warn("Firestore thisWeek watch failed:", err);
          firestoreStatus = "error";
        }
      );
    } catch (err) {
      console.warn("Firestore thisWeek watch setup failed:", err);
    }
    return () => {
      if (thisWeekUnsub) {
        try {
          thisWeekUnsub();
        } catch (_) {
          /* ok */
        }
        thisWeekUnsub = null;
      }
    };
  }


  /**
   * Append an admin ops activity log entry (best-effort).
   * Shape: { at, action, source, pickId?, filename?, title?, youtubeId?, detail?, actor? }
   * action: compress_stage_youtube | stage_youtube | swap_live | skip | fail
   * source: manual | scheduler
   * Never throws to callers when used via bestEffortLogActivity — this one may throw.
   */
  async function logActivity(entry) {
    if (!firestoreReady || !fbDb || !firestoreAddDoc || !firestoreCollection) {
      const err = new Error("Firestore not ready — cannot write activity log.");
      err.code = "firestore-not-ready";
      throw err;
    }
    const base = entry && typeof entry === "object" ? entry : {};
    const action = base.action || "fail";
    const source = base.source === "scheduler" ? "scheduler" : "manual";
    const actor =
      base.actor ||
      (source === "scheduler"
        ? "wednesday-job"
        : currentUser
          ? normalizeEmail(currentUser.email)
          : null);
    const docPayload = scrubUndefined({
      at: base.at || new Date().toISOString(),
      action: String(action),
      source,
      pickId: base.pickId || base.id || null,
      filename: base.filename || null,
      title: base.title || null,
      youtubeId: base.youtubeId || null,
      detail: base.detail || null,
      actor,
    });
    const ref = await firestoreAddDoc(
      firestoreCollection(fbDb, "activityLog"),
      docPayload
    );
    firestoreStatus = "cloud";
    return { id: ref.id, ...docPayload };
  }

  /** Best-effort wrapper — never throws; logs to console on failure. */
  async function bestEffortLogActivity(entry) {
    try {
      return await logActivity(entry);
    } catch (err) {
      console.warn("activityLog write failed:", err);
      return null;
    }
  }

  /** Load newest activity log entries (admin). Default limit 30. */
  async function loadActivityLog(limitCount) {
    if (!firestoreReady || !fbDb || !firestoreGetDocs || !firestoreCollection) {
      return [];
    }
    const n = Math.min(Math.max(Number(limitCount) || 30, 1), 100);
    try {
      const q = firestoreQuery(
        firestoreCollection(fbDb, "activityLog"),
        firestoreOrderBy("at", "desc"),
        firestoreLimit(n)
      );
      const snap = await firestoreGetDocs(q);
      firestoreStatus = "cloud";
      const rows = [];
      snap.forEach((docSnap) => {
        rows.push({ id: docSnap.id, ...docSnap.data() });
      });
      return rows;
    } catch (err) {
      console.warn("activityLog read failed:", err);
      firestoreStatus = "error";
      return [];
    }
  }

  async function publishRule(rule) {
    requireFirestoreWrite();
    const base = rule && typeof rule === "object" ? rule : {};
    const docPayload = scrubUndefined({
      folderTypes: Array.isArray(base.folderTypes) ? base.folderTypes : [],
      minHR: typeof base.minHR === "number" ? base.minHR : Number(base.minHR) || 0,
      requireHR: base.requireHR !== false,
      autoPick: base.autoPick !== false,
      recency: base.recency || "recent",
      rotate: !!base.rotate,
      rotateWeeks:
        typeof base.rotateWeeks === "number"
          ? base.rotateWeeks
          : Number(base.rotateWeeks) || 8,
      tagContains: base.tagContains || "",
      version: base.version ?? null,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser ? normalizeEmail(currentUser.email) : null,
    });
    await firestoreSetDoc(
      firestoreDoc(fbDb, "config", "rule"),
      docPayload,
      { merge: true }
    );
    firestoreStatus = "cloud";
    return docPayload;
  }

  async function loadRuleFromCloud() {
    if (!firestoreReady || !fbDb || !firestoreGetDoc || !firestoreDoc) {
      return null;
    }
    try {
      const snap = await firestoreGetDoc(firestoreDoc(fbDb, "config", "rule"));
      if (!snap.exists) return null;
      const data = snap.data();
      firestoreStatus = "cloud";
      return data && typeof data === "object" ? data : null;
    } catch (err) {
      console.warn("Firestore rule read failed:", err);
      firestoreStatus = "error";
      return null;
    }
  }

    // ——— Mock (localhost only) ———

  function loadMockSession() {
    if (!isLocalhost()) return null;
    try {
      const raw = localStorage.getItem(MOCK_SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  async function rejectUnauthorized(user) {
    blockMessage = "Ask Santiago to add your email.";
    if (user && user.provider === "mock") {
      localStorage.removeItem(MOCK_SESSION_KEY);
      setUser(null);
      return;
    }
    localStorage.removeItem(MOCK_SESSION_KEY);
    if (firebaseReady && fbAuth && signOutFn) {
      gating = true;
      try {
        await signOutFn(fbAuth);
      } catch (_) {
        /* ok */
      }
      gating = false;
    }
    setUser(null);
  }

  async function admitOrReject(user) {
    if (!user) {
      setUser(null);
      return;
    }
    const normalized = {
      ...user,
      email: normalizeEmail(user.email),
    };
    // Admins in admins.json are always allowed (even if missing from members).
    if (isAllowedEmail(normalized.email)) {
      blockMessage = null;
      authHintMessage = null;
      setUser(normalized);
      return;
    }
    await rejectUnauthorized(normalized);
  }

  function mockSignIn(role) {
    if (!isLocalhost()) {
      throw new Error("Mock sign-in is localhost-only");
    }
    const user =
      role === "admin"
        ? {
            email: adminEmails[0] || "sblanco2005@gmail.com",
            displayName: "Santiago (mock admin)",
            photoURL: null,
            uid: "mock-admin",
            provider: "mock",
          }
        : {
            email: memberEmails[0] || "member@example.com",
            displayName: "Member (mock)",
            photoURL: null,
            uid: "mock-member",
            provider: "mock",
          };
    if (!isAllowedEmail(user.email)) {
      localStorage.removeItem(MOCK_SESSION_KEY);
      blockMessage = "Ask Santiago to add your email.";
      setUser(null);
      return null;
    }
    localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
    blockMessage = null;
    setUser(user);
    return user;
  }

  function mockSignOut() {
    localStorage.removeItem(MOCK_SESSION_KEY);
    setUser(null);
  }

  // ——— Firebase ———

  async function loadFirebaseModular() {
    // Parallel ESM fetches — sequential awaits stacked ~3 round-trips on phone Safari.
    const [appMod, authMod, fsMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"),
    ]);
    return {
      initializeApp: appMod.initializeApp,
      getAuth: authMod.getAuth,
      initializeAuth: authMod.initializeAuth,
      browserLocalPersistence: authMod.browserLocalPersistence,
      browserPopupRedirectResolver: authMod.browserPopupRedirectResolver,
      setPersistence: authMod.setPersistence,
      GoogleAuthProvider: authMod.GoogleAuthProvider,
      signInWithPopup: authMod.signInWithPopup,
      signInWithRedirect: authMod.signInWithRedirect,
      getRedirectResult: authMod.getRedirectResult,
      onAuthStateChanged: authMod.onAuthStateChanged,
      signOut: authMod.signOut,
      getFirestore: fsMod.getFirestore,
      doc: fsMod.doc,
      setDoc: fsMod.setDoc,
      getDoc: fsMod.getDoc,
      collection: fsMod.collection,
      query: fsMod.query,
      where: fsMod.where,
      getDocs: fsMod.getDocs,
      onSnapshot: fsMod.onSnapshot,
      addDoc: fsMod.addDoc,
      orderBy: fsMod.orderBy,
      limit: fsMod.limit,
    };
  }

  /** @type {any} */
  let fbAuth = null;
  /** @type {any} */
  let GoogleAuthProviderCtor = null;
  /** @type {any} */
  let signInWithPopupFn = null;
  /** @type {any} */
  let signInWithRedirectFn = null;
  /** @type {any} */
  let signOutFn = null;
  /** @type {any} */
  let firestoreDoc = null;
  /** @type {any} */
  let firestoreSetDoc = null;
  /** @type {any} */
  let firestoreGetDoc = null;
  /** @type {any} */
  let firestoreCollection = null;
  /** @type {any} */
  let firestoreQuery = null;
  /** @type {any} */
  let firestoreWhere = null;
  /** @type {any} */
  let firestoreGetDocs = null;
  /** @type {any} */
  let firestoreOnSnapshot = null;
  /** @type {any} */
  let firestoreAddDoc = null;
  /** @type {any} */
  let firestoreOrderBy = null;
  /** @type {any} */
  let firestoreLimit = null;

  /**
   * Auth strategy:
   * - eddy-s-hell.web.app / eddy-s-hell-beta.web.app / *.firebaseapp.com:
   *   signInWithPopup FIRST, then fall back to signInWithRedirect if popup blocked.
   *   Beta is first-class — do NOT steer beta users to stable.
   * - github.io: steer users to stable web.app; popup ok if they insist. Never redirect
   *   (cross-origin authDomain — getRedirectResult cannot restore the session).
   * initializeAuth MUST include popupRedirectResolver or Firebase throws
   * auth/argument-error on both popup and redirect.
   */
  const REDIRECT_PENDING_KEY = "eddys-hell-auth-redirect-pending";

  function isBenignPopupError(err) {
    const code = err && err.code;
    return (
      code === "auth/cancelled-popup-request" ||
      code === "auth/popup-closed-by-user" ||
      code === "auth/popup-blocked"
    );
  }

  function markRedirectPending() {
    try {
      sessionStorage.setItem(REDIRECT_PENDING_KEY, "1");
    } catch (_) {
      /* ok */
    }
  }

  function consumeRedirectPending() {
    try {
      const v = sessionStorage.getItem(REDIRECT_PENDING_KEY);
      if (v) sessionStorage.removeItem(REDIRECT_PENDING_KEY);
      return !!v;
    } catch (_) {
      return false;
    }
  }

  function userFromFirebase(user) {
    return {
      email: normalizeEmail(user.email || ""),
      displayName: user.displayName || user.email || "User",
      photoURL: user.photoURL || null,
      uid: user.uid,
      provider: "google",
    };
  }

  async function handleFirebaseUser(user) {
    if (gating) return;
    if (user) {
      await admitOrReject(userFromFirebase(user));
      return;
    }
    if (isLocalhost() && loadMockSession()) {
      await admitOrReject(loadMockSession());
      return;
    }
    setUser(null);
  }

  async function initFirebase(cfg) {
    const mod = await loadFirebaseModular();
    const app = mod.initializeApp(cfg);

    // Explicit local persistence + popup/redirect resolver.
    // initializeAuth WITHOUT browserPopupRedirectResolver throws
    // auth/argument-error on signInWithRedirect / signInWithPopup.
    try {
      fbAuth = mod.initializeAuth(app, {
        persistence: mod.browserLocalPersistence,
        popupRedirectResolver: mod.browserPopupRedirectResolver,
      });
    } catch (_) {
      fbAuth = mod.getAuth(app);
      try {
        await mod.setPersistence(fbAuth, mod.browserLocalPersistence);
      } catch (err) {
        console.warn("Firebase setPersistence:", err);
      }
    }

    GoogleAuthProviderCtor = mod.GoogleAuthProvider;
    signInWithPopupFn = mod.signInWithPopup;
    signInWithRedirectFn = mod.signInWithRedirect;
    signOutFn = mod.signOut;

    firestoreDoc = mod.doc;
    firestoreSetDoc = mod.setDoc;
    firestoreGetDoc = mod.getDoc;
    firestoreCollection = mod.collection;
    firestoreQuery = mod.query;
    firestoreWhere = mod.where;
    firestoreGetDocs = mod.getDocs;
    firestoreOnSnapshot = mod.onSnapshot;
    firestoreAddDoc = mod.addDoc;
    firestoreOrderBy = mod.orderBy;
    firestoreLimit = mod.limit;
    try {
      fbDb = mod.getFirestore(app);
      firestoreReady = true;
      firestoreStatus = "cloud";
    } catch (err) {
      console.warn("Firestore init failed:", err);
      fbDb = null;
      firestoreReady = false;
      firestoreStatus = "local";
    }

    // Finish redirect return before listening (used when popup falls back to redirect
    // on hosting). On github.io (cross-origin authDomain) this often yields null.
    const hadPendingRedirect = consumeRedirectPending();
    let redirectUser = null;
    try {
      const redirectCred = await mod.getRedirectResult(fbAuth);
      if (redirectCred && redirectCred.user) {
        redirectUser = redirectCred.user;
        blockMessage = null;
        authHintMessage = null;
      }
    } catch (err) {
      if (!isBenignPopupError(err)) {
        console.warn("Firebase redirect result:", err);
        if (hadPendingRedirect) {
          authHintMessage =
            "Sign-in did not complete. Tap Sign in with Google again " +
            "(popup first). Allow popups, or reduce privacy protections for this site.";
        }
      }
    }

    // Wait until Auth has settled so boot() does not paint guest over a session.
    if (typeof fbAuth.authStateReady === "function") {
      await fbAuth.authStateReady();
    }

    // If redirect returned a user, prefer that; else currentUser after authStateReady.
    if (!redirectUser && fbAuth.currentUser) {
      redirectUser = fbAuth.currentUser;
      authHintMessage = null;
    }

    if (!redirectUser && hadPendingRedirect && !fbAuth.currentUser) {
      if (isGithubPages()) {
        authHintMessage =
          "Sign-in redirect cannot restore a session on GitHub Pages. " +
          "Open " + preferredLiveUrl() + " and sign in there.";
      } else {
        authHintMessage =
          "Sign-in redirect did not restore your session. Tap Sign in with Google again " +
          "(uses a popup). Allow popups or reduce privacy protections if asked.";
      }
    }

    mod.onAuthStateChanged(fbAuth, (user) => {
      handleFirebaseUser(user);
    });

    // Apply current user now (do not wait for a later notification).
    await handleFirebaseUser(fbAuth.currentUser);

    firebaseReady = true;
  }

  async function signInWithGoogle() {
    if (!firebaseReady || !fbAuth) {
      // Race: guest shell paints Sign in before Auth.init() finishes.
      // Await init instead of immediately throwing "not configured".
      if (!initSettled) {
        try {
          await waitForInit(20000);
        } catch (_) {
          /* fall through — throw true misconfig below if still not ready */
        }
      }
      if (!firebaseReady || !fbAuth) {
        throw new Error("Firebase Auth is not configured");
      }
    }

    // In-app browsers: do not attempt popup/redirect (broken → argument-error).
    if (isInAppBrowser()) {
      const e = new Error(openInBrowserMessage());
      e.code = "auth/in-app-browser";
      throw e;
    }

    // Valid GoogleAuthProvider only — no bad custom params (argument-error).
    const provider = new GoogleAuthProviderCtor();
    // prompt is an official OAuth param; keep select_account for account picker.
    provider.setCustomParameters({ prompt: "select_account" });

    // Popup first everywhere (what worked on github.io / web.app for Santiago).
    // Redirect only as fallback when popup is blocked/cancelled on Firebase Hosting.
    try {
      clearBlockMessage();
      clearAuthHintMessage();
      await signInWithPopupFn(fbAuth, provider);
      return { method: "popup" };
    } catch (err) {
      if (isBenignPopupError(err)) {
        if (isGithubPages()) {
          const e = new Error(
            "Popup blocked or closed. Prefer https://eddy-s-hell.web.app/ — or allow popups and try again."
          );
          e.code = err.code;
          throw e;
        }
        // Hosting (and non-Pages): popup blocked/cancelled → redirect fallback.
        if (isFirebaseHosting() || !isGithubPages()) {
          clearAuthHintMessage();
          markRedirectPending();
          try {
            await signInWithRedirectFn(fbAuth, provider);
            return { method: "redirect" };
          } catch (redirErr) {
            try {
              sessionStorage.removeItem(REDIRECT_PENDING_KEY);
            } catch (_) {
              /* ok */
            }
            const e = new Error(friendlyAuthError(redirErr));
            e.code = (redirErr && redirErr.code) || "auth/unknown";
            e.cause = redirErr;
            throw e;
          }
        }
      }
      const e = new Error(friendlyAuthError(err));
      e.code = (err && err.code) || "auth/unknown";
      e.cause = err;
      throw e;
    }
  }

  async function signOut() {
    if (currentUser && currentUser.provider === "mock") {
      mockSignOut();
      return;
    }
    localStorage.removeItem(MOCK_SESSION_KEY);
    // Clear app session first so UI drops admin chrome immediately
    setUser(null);
    if (firebaseReady && fbAuth && signOutFn) {
      try {
        await signOutFn(fbAuth);
      } catch (err) {
        console.warn("Firebase signOut:", err);
      }
    }
  }

  async function init() {
    try {
      // Admins
      try {
        const res = await fetch("data/admins.json", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          adminEmails = Array.isArray(data.emails)
            ? data.emails.map(normalizeEmail).filter(Boolean)
            : [];
        }
      } catch (_) {
        adminEmails = [normalizeEmail("sblanco2005@gmail.com")];
      }

      // Members allowlist (repo then newer localStorage)
      await loadMembers();

      // Firebase config
      try {
        const res = await fetch("data/firebase-config.json", { cache: "no-store" });
        if (res.ok) firebaseConfig = await res.json();
      } catch (_) {
        firebaseConfig = null;
      }

      if (configLooksReady(firebaseConfig)) {
        try {
          await initFirebase(firebaseConfig);
        } catch (err) {
          console.error("Firebase init failed:", err);
          firebaseReady = false;
        }
      }

      // Mock restore on localhost when Firebase not ready
      if (!firebaseReady && isLocalhost()) {
        const mock = loadMockSession();
        if (mock) await admitOrReject(mock);
      }

      // admin bypass: synthesize a session for UI without persisting
      if (adminBypassEnabled() && !currentUser) {
        setUser({
          email: adminEmails[0] || "sblanco2005@gmail.com",
          displayName: "Local admin bypass",
          photoURL: null,
          uid: "bypass-admin",
          provider: "bypass",
        });
      }
    } finally {
      markInitDone();
    }
  }

  window.EddysHellAuth = {
    init,
    waitForInit,
    whenReady: waitForInit,
    isInitPending,
    onAuthChange,
    getUser: () =>
      currentUser ? { ...currentUser, role: getRole(currentUser) } : null,
    getRole: () => getRole(currentUser),
    isConfigured: () => firebaseReady,
    isLocalhost,
    isGithubPages,
    isFirebaseHosting,
    isBetaHost,
    isInAppBrowser,
    publicAppUrl,
    openInBrowserMessage,
    friendlyAuthError,
    adminBypassEnabled,
    signInWithGoogle,
    isBenignPopupError,
    mockSignIn,
    signOut,
    loadCheckins,
    upsertCheckin,
    checkinsForPick,
    myCheckin,
    refreshCheckinsForPick,
    watchCheckinsForPick,
    onCheckinsChange,
    getCheckinSyncMode,
    isFirestoreReady: () => firestoreReady,
    publishThisWeek,
    loadThisWeekFromCloud,
    watchThisWeek,
    stageNextWeek,
    loadNextWeekFromCloud,
    promoteStagedToLive,
    logActivity,
    bestEffortLogActivity,
    loadActivityLog,
    publishRule,
    loadRuleFromCloud,
    CHECKINS_KEY,
    MEMBERS_KEY,
    getMembers,
    saveMembers,
    loadMembers,
    isAllowedEmail,
    isMemberEmail,
    isAdminEmail,
    normalizeEmail,
    getBlockMessage,
    getAuthHintMessage,
    getAuthBanner,
    clearBlockMessage,
    clearAuthHintMessage,
  };
})();
