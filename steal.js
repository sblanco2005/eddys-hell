/* Eddy's Hell — Mine + Gym (ported from Steal).
 * Bottom tab bar (Mine | Gym | Eddy's). Eddy's = the existing This week / Admin views,
 * untouched. Mine/Gym render into #steal-root. Per-user private data in Firestore:
 *   users/{uid}/gym/kit, users/{uid}/workouts/{id}, users/{uid}/sessions/{id}
 * with a localStorage mirror per uid (instant paint + offline). */
(function () {
  "use strict";

  const D = window.StealData;
  const FS_URL = "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
  const TABS = ["mine", "gym", "eddys"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let user = null;
  let tab = "eddys";
  const S = {
    gym: [],
    gymLoaded: false,
    status: "",
    statusKind: "",
  };

  // ——— Storage: Firestore (own uid) + local mirror ———
  const Store = {
    async cloud() {
      const Auth = window.EddysHellAuth;
      const h = Auth && Auth.getCloudHandle ? Auth.getCloudHandle() : null;
      if (!h || !h.uid) return null;
      const fs = await import(FS_URL);
      return { db: h.db, uid: h.uid, fs };
    },
    key(k) {
      return `eh.mine.v1.${(user && user.uid) || "anon"}.${k}`;
    },
    readLocal(k, dflt) {
      try {
        const raw = localStorage.getItem(this.key(k));
        return raw ? JSON.parse(raw) : dflt;
      } catch (_) {
        return dflt;
      }
    },
    writeLocal(k, v) {
      try {
        localStorage.setItem(this.key(k), JSON.stringify(v));
      } catch (_) {}
    },
    async loadGym() {
      const local = this.readLocal("gym", null);
      const c = await this.cloud();
      if (!c) return { items: local || [], where: "device" };
      const snap = await c.fs.getDoc(c.fs.doc(c.db, "users", c.uid, "gym", "kit"));
      const items = snap.exists() && Array.isArray(snap.data().items) ? snap.data().items : local || [];
      this.writeLocal("gym", items);
      return { items, where: "cloud" };
    },
    async saveGym(items) {
      this.writeLocal("gym", items);
      const c = await this.cloud();
      if (!c) return "device";
      await c.fs.setDoc(
        c.fs.doc(c.db, "users", c.uid, "gym", "kit"),
        { items, updatedAt: c.fs.serverTimestamp() },
        { merge: true }
      );
      return "cloud";
    },
  };

  // ——— Tabs ———
  function setTab(next, opts) {
    if (!TABS.includes(next)) next = "eddys";
    tab = next;
    const body = document.body;
    for (const t of TABS) body.classList.toggle("tab-" + t, t === tab);
    const root = $("steal-root");
    if (root) root.hidden = tab === "eddys";
    for (const b of document.querySelectorAll(".bnav-btn")) {
      const on = b.dataset.tab === tab;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    if (tab !== "eddys") render();
    if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
  }

  function setStatus(msg, kind) {
    S.status = msg || "";
    S.statusKind = kind || "";
    const el = $("steal-status");
    if (el) {
      el.textContent = S.status;
      el.className = "steal-status" + (S.statusKind ? " " + S.statusKind : "");
      el.hidden = !S.status;
    }
  }

  function render() {
    const root = $("steal-root");
    if (!root || tab === "eddys") return;
    if (tab === "gym") root.innerHTML = renderGym();
    else if (tab === "mine") root.innerHTML = renderMine();
    setStatus(S.status, S.statusKind);
  }

  // ——— Gym ———
  function renderGym() {
    const have = new Set(S.gym);
    const groups = D.GEAR.map(
      (g) => `
      <section class="gym-group">
        <h3 class="steal-kicker">${esc(g.label)}</h3>
        <div class="gym-chips">
          ${g.items
            .map(
              (it) =>
                `<button type="button" class="gym-chip${have.has(it.id) ? " on" : ""}" data-gear="${esc(it.id)}" aria-pressed="${have.has(it.id)}">${esc(it.label)}</button>`
            )
            .join("")}
        </div>
      </section>`
    ).join("");
    return `
      <header class="steal-head">
        <p class="steal-kicker">Your kit</p>
        <h2 class="steal-title">What’s in the gym</h2>
        <p class="steal-sub">Tap what you actually have — garage, hotel, or commercial. Mine builds sessions from this kit.</p>
      </header>
      ${S.gymLoaded ? "" : `<p class="hint">Loading your kit…</p>`}
      <div class="gym-groups">${groups}</div>
      <p class="hint gym-count">${S.gym.length} selected · private to you</p>
      <p class="steal-status" id="steal-status" hidden></p>`;
  }

  let gymSaveTimer = null;
  function toggleGear(id) {
    S.gym = S.gym.includes(id) ? S.gym.filter((g) => g !== id) : [...S.gym, id];
    render();
    clearTimeout(gymSaveTimer);
    gymSaveTimer = setTimeout(async () => {
      try {
        const where = await Store.saveGym(S.gym);
        setStatus(where === "cloud" ? "Saved" : "Saved on this device", "ok");
      } catch (err) {
        console.warn("[mine] gym save failed", err);
        setStatus("Couldn’t save to your account — kept on this device. " + (err && err.code ? err.code : ""), "err");
      }
    }, 350);
  }

  // ——— Mine (phase 2) ———
  function renderMine() {
    return `
      <header class="steal-head">
        <p class="steal-kicker">Builder</p>
        <h2 class="steal-title">Mine</h2>
        <p class="steal-sub">Build workouts from the kit you marked in Gym.</p>
      </header>
      <article class="card steal-soon"><p class="hint">The workout builder lands in the next beta drop. Mark your kit in <strong>Gym</strong> meanwhile.</p></article>
      <p class="steal-status" id="steal-status" hidden></p>`;
  }

  // ——— Data load per user ———
  async function loadForUser() {
    S.gym = Store.readLocal("gym", []) || [];
    S.gymLoaded = false;
    render();
    try {
      const r = await Store.loadGym();
      S.gym = r.items;
    } catch (err) {
      console.warn("[mine] gym load failed", err);
      setStatus("Couldn’t load your kit from the cloud — showing this device’s copy.", "err");
    }
    S.gymLoaded = true;
    render();
  }

  // ——— Wiring ———
  function onClick(e) {
    const nav = e.target.closest(".bnav-btn");
    if (nav) {
      e.preventDefault();
      setTab(nav.dataset.tab);
      return;
    }
    const root = $("steal-root");
    if (!root || !root.contains(e.target)) return;
    const chip = e.target.closest("[data-gear]");
    if (chip) {
      toggleGear(chip.dataset.gear);
      return;
    }
  }

  function onAuth(u) {
    const signedIn = !!(u && u.role && u.role !== "guest");
    const prevUid = user && user.uid;
    user = signedIn ? u : null;
    const nav = $("bnav");
    if (nav) nav.hidden = !signedIn;
    document.body.classList.toggle("has-bnav", signedIn);
    if (!signedIn) {
      setTab("eddys", { keepScroll: true });
      return;
    }
    if (user.uid !== prevUid) loadForUser();
  }

  function boot() {
    document.addEventListener("click", onClick);
    setTab("eddys", { keepScroll: true });
    const Auth = window.EddysHellAuth;
    if (Auth && Auth.onAuthChange) Auth.onAuthChange(onAuth);
  }

  window.EddysMine = { setTab, getTab: () => tab, _state: S };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
