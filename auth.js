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
  let blockMessage = null;
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

  function clearBlockMessage() {
    blockMessage = null;
  }

  // ——— Check-ins (localStorage, keyed by pickId + email) ———

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

  function upsertCheckin({ email, displayName, pickId, notes }) {
    const list = loadCheckins();
    const e = normalizeEmail(email);
    const at = new Date().toISOString();
    const idx = list.findIndex(
      (c) => normalizeEmail(c.email) === e && c.pickId === pickId
    );
    const row = {
      email: e,
      displayName: displayName || e,
      pickId,
      at,
      notes: (notes || "").trim(),
    };
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    saveCheckins(list);
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
    if (isAllowedEmail(user.email)) {
      blockMessage = null;
      setUser(user);
      return;
    }
    await rejectUnauthorized(user);
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
            email: "member@example.com",
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
      GoogleAuthProvider,
      signInWithPopup,
      signInWithRedirect,
      getRedirectResult,
      onAuthStateChanged,
      signOut,
    } = await import(
      "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"
    );
    return {
      initializeApp,
      getAuth,
      GoogleAuthProvider,
      signInWithPopup,
      signInWithRedirect,
      getRedirectResult,
      onAuthStateChanged,
      signOut,
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

  async function initFirebase(cfg) {
    const mod = await loadFirebaseModular();
    const app = mod.initializeApp(cfg);
    fbAuth = mod.getAuth(app);
    GoogleAuthProviderCtor = mod.GoogleAuthProvider;
    signInWithPopupFn = mod.signInWithPopup;
    signInWithRedirectFn = mod.signInWithRedirect;
    signOutFn = mod.signOut;

    try {
      await mod.getRedirectResult(fbAuth);
    } catch (err) {
      console.warn("Firebase redirect result:", err);
    }

    mod.onAuthStateChanged(fbAuth, (user) => {
      if (gating) return;
      if (user) {
        admitOrReject({
          email: user.email || "",
          displayName: user.displayName || user.email || "User",
          photoURL: user.photoURL || null,
          uid: user.uid,
          provider: "google",
        });
      } else if (isLocalhost() && loadMockSession()) {
        const mock = loadMockSession();
        admitOrReject(mock);
      } else {
        setUser(null);
      }
    });

    firebaseReady = true;
  }

  async function signInWithGoogle() {
    if (!firebaseReady || !fbAuth) {
      throw new Error("Firebase Auth is not configured");
    }
    const provider = new GoogleAuthProviderCtor();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopupFn(fbAuth, provider);
    } catch (err) {
      // Popup blocked / COOP → redirect fallback
      if (
        err &&
        (err.code === "auth/popup-blocked" ||
          err.code === "auth/popup-closed-by-user")
      ) {
        await signInWithRedirectFn(fbAuth, provider);
        return;
      }
      throw err;
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
        adminEmails = Array.isArray(data.emails) ? data.emails : [];
      }
    } catch (_) {
      adminEmails = ["sblanco2005@gmail.com"];
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
    adminBypassEnabled,
    signInWithGoogle,
    mockSignIn,
    signOut,
    loadCheckins,
    upsertCheckin,
    checkinsForPick,
    myCheckin,
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
    clearBlockMessage,
  };
})();
