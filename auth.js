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
  /** @type {boolean} */
  let forcePopupOnce = false; // after a failed redirect restore on hosting
  /** @type {object|null} */
  let firebaseConfig = null;
  /** @type {boolean} */
  let firebaseReady = false;
  /** @type {boolean} */
  let gating = false;
  /** @type {Array<(u: object|null) => void>} */
  const listeners = [];

  function isLocalhost() {
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function isGithubPages() {
    return /\.github\.io$/i.test(location.hostname);
  }

  /** Firebase Hosting origins where authDomain can match the page origin. */
  function isFirebaseHosting() {
    const h = location.hostname;
    return (
      h === "eddy-s-hell.web.app" ||
      h === "eddy-s-hell.firebaseapp.com" ||
      /\.web\.app$/i.test(h) ||
      /\.firebaseapp\.com$/i.test(h)
    );
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
        // Redirect is first on hosting — do not tell users to "allow popups".
        return (
          "Sign-in could not start on this device. Hard-refresh the page, then try again. " +
          "If it still fails, in Safari turn off \"Reduce Advanced Privacy Protections\" " +
          "for eddy-s-hell.web.app and retry."
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
          "protections for eddy-s-hell.web.app, then try again."
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

  function upsertCheckinLocal({ email, displayName, pickId, notes, at }) {
    const list = loadCheckins();
    const e = normalizeEmail(email);
    const row = {
      email: e,
      displayName: displayName || e,
      pickId,
      at: at || new Date().toISOString(),
      notes: (notes || "").trim(),
    };
    mergeCheckinRow(list, row);
    saveCheckins(list);
    return row;
  }

  async function upsertCheckin({ email, displayName, pickId, notes }) {
    const row = upsertCheckinLocal({ email, displayName, pickId, notes });
    notifyCheckins();

    if (firestoreReady && fbDb && firestoreSetDoc && firestoreDoc) {
      try {
        const id = checkinDocId(pickId, row.email);
        await firestoreSetDoc(
          firestoreDoc(fbDb, "checkins", id),
          {
            email: row.email,
            displayName: row.displayName,
            pickId: row.pickId,
            at: row.at,
            notes: row.notes,
          },
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
      forcePopupOnce = false;
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
    const { initializeApp } = await import(
      "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"
    );
    const {
      getAuth,
      initializeAuth,
      browserLocalPersistence,
      browserPopupRedirectResolver,
      setPersistence,
      GoogleAuthProvider,
      signInWithPopup,
      signInWithRedirect,
      getRedirectResult,
      onAuthStateChanged,
      signOut,
    } = await import(
      "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"
    );
    const {
      getFirestore,
      doc,
      setDoc,
      collection,
      query,
      where,
      getDocs,
      onSnapshot,
    } = await import(
      "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"
    );
    return {
      initializeApp,
      getAuth,
      initializeAuth,
      browserLocalPersistence,
      browserPopupRedirectResolver,
      setPersistence,
      GoogleAuthProvider,
      signInWithPopup,
      signInWithRedirect,
      getRedirectResult,
      onAuthStateChanged,
      signOut,
      getFirestore,
      doc,
      setDoc,
      collection,
      query,
      where,
      getDocs,
      onSnapshot,
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
  let firestoreCollection = null;
  /** @type {any} */
  let firestoreQuery = null;
  /** @type {any} */
  let firestoreWhere = null;
  /** @type {any} */
  let firestoreGetDocs = null;
  /** @type {any} */
  let firestoreOnSnapshot = null;

  /**
   * Auth strategy:
   * - github.io: popup-only (authDomain is web.app / firebaseapp.com — cross-origin
   *   redirect storage is partitioned; getRedirectResult comes back null).
   * - eddy-s-hell.web.app / *.firebaseapp.com: prefer signInWithRedirect (authDomain
   *   matches hosting origin so redirect restore works).
   * - After a failed redirect restore on hosting, force one popup attempt.
   */
  const REDIRECT_PENDING_KEY = "eddys-hell-auth-redirect-pending";

  function prefersRedirectSignIn() {
    if (forcePopupOnce) return false;
    if (isGithubPages()) return false;
    if (isFirebaseHosting()) return true;
    const ua = navigator.userAgent || "";
    const isIOS =
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    return (
      isIOS ||
      isAndroid ||
      /Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    );
  }

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
    firestoreCollection = mod.collection;
    firestoreQuery = mod.query;
    firestoreWhere = mod.where;
    firestoreGetDocs = mod.getDocs;
    firestoreOnSnapshot = mod.onSnapshot;
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

    // Finish redirect return before listening. With authDomain matching the
    // hosting origin (eddy-s-hell.web.app), getRedirectResult should restore.
    // On github.io (cross-origin authDomain) this often yields null.
    const hadPendingRedirect = consumeRedirectPending();
    let redirectUser = null;
    try {
      const redirectCred = await mod.getRedirectResult(fbAuth);
      if (redirectCred && redirectCred.user) {
        redirectUser = redirectCred.user;
        blockMessage = null;
        authHintMessage = null;
        forcePopupOnce = false;
      }
    } catch (err) {
      if (!isBenignPopupError(err)) {
        console.warn("Firebase redirect result:", err);
        if (hadPendingRedirect) {
          // Never reuse member-denial blockMessage for redirect failures.
          authHintMessage =
            "Sign-in did not complete. Tap Sign in with Google again. " +
            "Allow popups, or reduce privacy protections for this site.";
          if (isFirebaseHosting()) forcePopupOnce = true;
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
      forcePopupOnce = false;
    }

    if (!redirectUser && hadPendingRedirect && !fbAuth.currentUser) {
      // Redirect completed at Google but session was not restored.
      if (isFirebaseHosting()) {
        forcePopupOnce = true;
        authHintMessage =
          "Sign-in redirect did not restore your session. Tap Sign in with Google again " +
          "(this try uses a popup). Allow popups or reduce privacy protections if asked.";
      } else if (isGithubPages()) {
        authHintMessage =
          "Sign-in redirect cannot restore a session on GitHub Pages. " +
          "Open " + preferredLiveUrl() + " and sign in there.";
      } else {
        authHintMessage =
          "Sign-in redirect did not restore your session. Tap Sign in again.";
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
      throw new Error("Firebase Auth is not configured");
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

    // Hosting (web.app): redirect first. GitHub Pages: popup only.
    // After a failed redirect restore, forcePopupOnce makes this popup.
    if (prefersRedirectSignIn()) {
      clearAuthHintMessage();
      markRedirectPending();
      try {
        await signInWithRedirectFn(fbAuth, provider);
        return { method: "redirect" };
      } catch (err) {
        // Redirect never started — clear pending so we do not force a bad popup next.
        try {
          sessionStorage.removeItem(REDIRECT_PENDING_KEY);
        } catch (_) {
          /* ok */
        }
        const code = (err && err.code) || "";
        const isArg =
          code === "auth/argument-error" ||
          /argument-error/i.test(String((err && err.message) || ""));
        // Do NOT fall through to popup for argument-error on iOS hosting —
        // that produced the misleading "Allow popups" alert. Surface a clear error.
        if (isArg && isFirebaseHosting()) {
          forcePopupOnce = false;
          const e = new Error(friendlyAuthError(err));
          e.code = "auth/argument-error";
          e.cause = err;
          throw e;
        }
        // Other redirect failures on hosting: one popup retry may help (e.g. storage).
        if (isFirebaseHosting() && !isArg) {
          forcePopupOnce = true;
        }
        const e = new Error(friendlyAuthError(err));
        e.code = code || "auth/unknown";
        e.cause = err;
        throw e;
      }
    }

    try {
      clearBlockMessage();
      clearAuthHintMessage();
      const usedForcedPopup = forcePopupOnce;
      forcePopupOnce = false;
      await signInWithPopupFn(fbAuth, provider);
      return { method: "popup", forced: usedForcedPopup };
    } catch (err) {
      // On GitHub Pages do NOT fall back to redirect — it cannot restore session.
      if (isBenignPopupError(err)) {
        if (isGithubPages()) {
          const e = new Error(
            "Popup blocked or closed. Prefer https://eddy-s-hell.web.app/ — or allow popups and try again."
          );
          e.code = err.code;
          throw e;
        }
        // Off Pages: popup blocked → redirect (hosting) as fallback.
        if (isFirebaseHosting() || !isGithubPages()) {
          markRedirectPending();
          await signInWithRedirectFn(fbAuth, provider);
          return { method: "redirect" };
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
    if (firebaseReady && fbAuth && signOutFn) {
      await signOutFn(fbAuth);
    }
    setUser(null);
  }

  async function init() {
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
  }

  window.EddysHellAuth = {
    init,
    onAuthChange,
    getUser: () =>
      currentUser ? { ...currentUser, role: getRole(currentUser) } : null,
    getRole: () => getRole(currentUser),
    isConfigured: () => firebaseReady,
    isLocalhost,
    isGithubPages,
    isFirebaseHosting,
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
