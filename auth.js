/**
 * Eddy's Hell — Auth (Firebase Google OR localhost mock)
 * Exposes window.EddysHellAuth
 */
(function () {
  "use strict";

  const CHECKINS_KEY = "eddys-hell-checkins-v1";
  const MOCK_SESSION_KEY = "eddys-hell-mock-user-v1";

  /** @type {{ email: string, displayName: string, photoURL: string|null, uid: string, provider: string }|null} */
  let currentUser = null;
  /** @type {string[]} */
  let adminEmails = [];
  /** @type {object|null} */
  let firebaseConfig = null;
  /** @type {boolean} */
  let firebaseReady = false;
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
    localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
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
      if (user) {
        setUser({
          email: user.email || "",
          displayName: user.displayName || user.email || "User",
          photoURL: user.photoURL || null,
          uid: user.uid,
          provider: "google",
        });
      } else if (isLocalhost() && loadMockSession()) {
        // keep mock if present when Firebase has no user
        setUser(loadMockSession());
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
      if (mock) setUser(mock);
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
  };
})();
