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
    workouts: [],
    workoutsLoaded: false,
    view: "list", // list | edit
    draft: null, // { id|null, name, notes, exercises[], createdAt? }
    addOpen: false,
    confirmRemove: null,
    clip: null,
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
    async loadWorkouts() {
      const local = this.readLocal("workouts", null);
      const c = await this.cloud();
      if (!c) return local || [];
      const snap = await c.fs.getDocs(c.fs.collection(c.db, "users", c.uid, "workouts"));
      const list = [];
      snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
      this.writeLocal("workouts", list);
      return list;
    },
    async saveWorkout(w, all) {
      this.writeLocal("workouts", all);
      const c = await this.cloud();
      if (!c) return "device";
      await c.fs.setDoc(c.fs.doc(c.db, "users", c.uid, "workouts", w.id), clean({ ...w, updatedAt: new Date().toISOString() }));
      return "cloud";
    },
    async deleteWorkout(id, all) {
      this.writeLocal("workouts", all);
      const c = await this.cloud();
      if (!c) return "device";
      await c.fs.deleteDoc(c.fs.doc(c.db, "users", c.uid, "workouts", id));
      return "cloud";
    },
  };

  /** Firestore rejects undefined — strip it (JSON round-trip). */
  function clean(o) {
    return JSON.parse(JSON.stringify(o));
  }
  const uuid = () =>
    window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const MAX_WORKOUTS = 50;

  // ——— Library helpers (ported from Steal) ———
  const LIB_BY_ID = new Map(D.LIB.map((m) => [m.id, m]));
  const LIB_BY_NAME = new Map(D.LIB.map((m) => [m.name.toLowerCase(), m]));
  function fits(move, gear) {
    const have = new Set([...(gear || []), "bodyweight"]);
    return move.needs.every((n) => have.has(n));
  }
  function toExercise(m) {
    return {
      id: uuid(),
      libId: m.id,
      name: m.name,
      muscle: m.muscle,
      equipment: m.equipment,
      isBarbell: !!m.isBarbell,
      sets: m.sets,
      reps: String(m.reps),
      restSeconds: m.muscle === "cardio" ? 60 : 90,
      setup: "",
      notes: "",
      formUrl: m.videoId ? `https://www.youtube.com/watch?v=${m.videoId}` : "",
      startSeconds: m.videoId ? m.start || 0 : null,
    };
  }
  /** Deterministic split auto-fill: per slot, first move your kit supports (no dup names). */
  function fillSplit(split, gear) {
    const used = new Set();
    const out = [];
    for (const slot of D.SPLIT_RULES[split] || []) {
      const m = slot.map((id) => LIB_BY_ID.get(id)).find((x) => x && fits(x, gear) && !used.has(x.name));
      if (m) {
        used.add(m.name);
        out.push(toExercise(m));
      }
    }
    return out;
  }
  /** Moves your kit supports, grouped by muscle (Add a move → Your machines). */
  function machinesByMuscle(gear) {
    const seen = new Set();
    const ok = D.LIB.filter((m) => {
      if (!fits(m, gear)) return false;
      const k = m.muscle + ":" + m.name;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return D.MUSCLES.map((mu) => ({ muscle: mu, moves: ok.filter((m) => m.muscle === mu) })).filter((g) => g.moves.length);
  }
  /** Demo clip for a move: library match by name first, else stored formUrl. */
  function clipFor(ex) {
    const m = (ex.libId && LIB_BY_ID.get(ex.libId)) || LIB_BY_NAME.get(String(ex.name || "").toLowerCase());
    if (m && m.videoId) return { videoId: m.videoId, start: m.start || 0 };
    const id = ytId(ex.formUrl);
    return id ? { videoId: id, start: ex.startSeconds || 0 } : null;
  }
  function ytId(url) {
    const m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  const mmss = (sec) => {
    const t = Math.max(0, Math.floor(sec || 0));
    return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  };
  const shortDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (_) {
      return "";
    }
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

  // ——— Mine ———
  function renderMine() {
    let html = "";
    if (S.view === "edit" && S.draft) html = renderEditor();
    else html = renderMineList();
    return html + renderClip() + `<p class="steal-status" id="steal-status" hidden></p>`;
  }

  function sortedWorkouts() {
    const k = (w) => w.lastDoneAt || w.savedAt || w.createdAt || "";
    return [...S.workouts].sort((a, b) => (k(b) > k(a) ? 1 : k(b) < k(a) ? -1 : 0));
  }

  function renderMineList() {
    const splits = D.SPLITS.map(
      (sp) => `
        <button type="button" class="split-card${sp.id === "hyrox" ? " wide" : ""}" data-act="new-split" data-split="${esc(sp.id)}">
          <span class="split-label">${esc(sp.label)}</span>
          <span class="split-blurb">${esc(sp.blurb)}</span>
        </button>`
    ).join("");
    const list = sortedWorkouts();
    let items;
    if (!S.workoutsLoaded && !list.length) items = `<div class="mine-skel"></div>`;
    else if (!list.length) items = `<p class="hint">Nothing saved yet. Build one, then Save for later.</p>`;
    else
      items = `<ul class="mine-list">${list
        .map((w) => {
          const meta = w.lastDoneAt ? ` · last ${shortDate(w.lastDoneAt)}` : w.savedAt ? ` · saved ${shortDate(w.savedAt)}` : "";
          const confirming = S.confirmRemove === w.id;
          return `
          <li class="mine-item">
            <button type="button" class="mine-item-main" data-act="edit" data-id="${esc(w.id)}">
              <span class="mine-item-name">${esc(w.name)}</span>
              <span class="mine-item-meta">${(w.exercises || []).length} moves${esc(meta)}</span>
            </button>
            <div class="mine-item-actions">
              ${HOOKS.hitItButton ? HOOKS.hitItButton(w) : ""}
              <button type="button" class="btn ghost btn-sm" data-act="edit" data-id="${esc(w.id)}">Edit</button>
              ${HOOKS.historyButton ? HOOKS.historyButton(w) : ""}
              <button type="button" class="btn ghost btn-sm${confirming ? " danger" : ""}" data-act="remove" data-id="${esc(w.id)}">${confirming ? "Tap to confirm" : "Remove"}</button>
            </div>
          </li>`;
        })
        .join("")}</ul>`;
    return `
      <header class="steal-head">
        <p class="steal-kicker">Builder</p>
        <h2 class="steal-title">Mine</h2>
        <p class="steal-sub">Tap a split to try it. Save for later keeps notes, sets, and order.</p>
      </header>
      ${HOOKS.resumeBanner ? HOOKS.resumeBanner() : ""}
      ${
        S.gymLoaded && !S.gym.length
          ? `<button type="button" class="mine-nudge" data-act="go-gym">Mark the rack, bench, cables you actually have. Then a push day uses those, not a machine you don’t own.</button>`
          : ""
      }
      <div class="split-grid">${splits}</div>
      <button type="button" class="btn secondary mine-blank" data-act="new-blank">Blank workout</button>
      <p class="steal-kicker mine-list-kicker">Workouts${list.length ? ` · ${list.length}/${MAX_WORKOUTS}` : ""}</p>
      ${items}`;
  }

  function renderExercise(ex, i, total) {
    const clip = clipFor(ex);
    return `
      <li class="ex-card" data-ex="${esc(ex.id)}">
        <div class="ex-top">
          <div class="ex-name-wrap">
            <p class="ex-name">${i + 1}. ${esc(ex.name)}</p>
            <p class="ex-muscle">${esc(ex.muscle || "")}${ex.equipment ? " · " + esc(ex.equipment) : ""}</p>
          </div>
          <div class="ex-tools">
            <div class="ex-move">
              <button type="button" data-act="move" data-dir="-1" data-ex="${esc(ex.id)}" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
              <button type="button" data-act="move" data-dir="1" data-ex="${esc(ex.id)}" ${i >= total - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
            </div>
            ${
              clip
                ? `<button type="button" class="ex-clip" data-act="clip" data-vid="${esc(clip.videoId)}" data-start="${clip.start}" data-name="${esc(ex.name)}" aria-label="Watch demo">▶ ${mmss(clip.start)}</button>`
                : ""
            }
            <button type="button" class="ex-x" data-act="rm-ex" data-ex="${esc(ex.id)}" aria-label="Remove move">×</button>
          </div>
        </div>
        <div class="ex-row">
          <div class="stepper">
            <button type="button" data-act="sets" data-d="-1" data-ex="${esc(ex.id)}" aria-label="Fewer sets">−</button>
            <span class="mono">${ex.sets}</span>
            <button type="button" data-act="sets" data-d="1" data-ex="${esc(ex.id)}" aria-label="More sets">+</button>
          </div>
          <span class="ex-x-sign">×</span>
          <input class="ex-reps mono" data-field="reps" data-ex="${esc(ex.id)}" value="${esc(ex.reps)}" placeholder="6-8" aria-label="Reps" />
          <div class="stepper">
            <button type="button" data-act="rest" data-d="-15" data-ex="${esc(ex.id)}" aria-label="Less rest">−</button>
            <span class="mono rest">${ex.restSeconds ?? 60}s</span>
            <button type="button" data-act="rest" data-d="15" data-ex="${esc(ex.id)}" aria-label="More rest">+</button>
          </div>
        </div>
        <input class="ex-setup" data-field="setup" data-ex="${esc(ex.id)}" value="${esc(ex.setup || "")}" placeholder="Setup note · hole 4, bench 30°" aria-label="Setup note" />
      </li>`;
  }

  function renderEditor() {
    const d = S.draft;
    const existing = !!d.id && S.workouts.some((w) => w.id === d.id);
    const empty = !d.exercises.length;
    const splitPicker = empty
      ? `
        <div class="split-grid compact">
          ${D.SPLITS.map(
            (sp) => `<button type="button" class="split-card${sp.id === "hyrox" ? " wide" : ""}" data-act="fill" data-split="${esc(sp.id)}">
              <span class="split-label">${esc(sp.label)}</span><span class="split-blurb">${esc(sp.blurb)}</span></button>`
          ).join("")}
        </div>
        <p class="hint">Pick a split to fill it from your kit — or add moves yourself.</p>`
      : "";
    const add = S.addOpen
      ? `
        <section class="add-panel">
          <div class="add-head"><p class="steal-kicker">Your machines</p><button type="button" class="btn ghost btn-sm" data-act="add-close">Done</button></div>
          ${
            machinesByMuscle(S.gym)
              .map(
                (g) => `
            <div class="add-group">
              <h4 class="steal-kicker">${esc(g.muscle)}</h4>
              ${g.moves
                .map(
                  (m) =>
                    `<button type="button" class="add-move" data-act="add-move" data-lib="${esc(m.id)}">${esc(m.name)}<span class="mono">${m.sets}×${esc(m.reps)}</span></button>`
                )
                .join("")}
            </div>`
              )
              .join("") || `<p class="hint">Mark your kit in Gym first.</p>`
          }
        </section>`
      : `<button type="button" class="btn secondary wide-btn" data-act="add-open">Add a move</button>`;
    return `
      <header class="steal-head">
        <button type="button" class="steal-back" data-act="back">${existing ? "‹ Mine" : "‹ Back · don’t save"}</button>
        <input class="steal-title-input" data-field="name" value="${esc(d.name)}" aria-label="Workout name" maxlength="80" />
        <p class="steal-sub">${empty ? "Empty workout" : `${d.exercises.length} moves · Finish a session to log it`}</p>
      </header>
      ${splitPicker}
      <ul class="ex-list">${d.exercises.map((ex, i) => renderExercise(ex, i, d.exercises.length)).join("")}</ul>
      ${add}
      <div class="editor-actions">
        ${HOOKS.hitItDraftButton ? HOOKS.hitItDraftButton(d) : ""}
        <button type="button" class="btn ${HOOKS.hitItDraftButton ? "secondary" : "accent"} wide-btn" data-act="save" ${empty ? "disabled" : ""}>${existing ? "Saved — update" : "Save for later"}</button>
        <button type="button" class="btn ghost wide-btn" data-act="back">${existing ? "Back to Mine" : "Discard"}</button>
        ${existing ? `<button type="button" class="btn ghost wide-btn danger" data-act="remove-draft">${S.confirmRemove === d.id ? "Tap to confirm remove" : "Remove workout"}</button>` : ""}
      </div>`;
  }

  function renderClip() {
    if (!S.clip) return "";
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(S.clip.videoId)}?start=${S.clip.start}&autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`;
    return `
      <div class="clip-sheet" role="dialog" aria-modal="true" aria-label="Demo clip">
        <div class="clip-backdrop" data-act="clip-close"></div>
        <div class="clip-card">
          <div class="clip-head"><span class="clip-name">${esc(S.clip.name)}</span><span class="hint">Muted · from ${mmss(S.clip.start)}</span><button type="button" class="ex-x" data-act="clip-close" aria-label="Close">×</button></div>
          <div class="clip-frame"><iframe src="${esc(src)}" title="${esc(S.clip.name)} demo" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
        </div>
      </div>`;
  }

  // ——— Mine actions ———
  function persistDraft() {
    Store.writeLocal("draft", S.view === "edit" ? S.draft : null);
  }
  function openDraft(d) {
    S.draft = d;
    S.view = "edit";
    S.addOpen = false;
    S.confirmRemove = null;
    persistDraft();
    render();
    window.scrollTo(0, 0);
  }
  function closeEditor() {
    S.draft = null;
    S.view = "list";
    S.addOpen = false;
    S.confirmRemove = null;
    persistDraft();
    render();
    window.scrollTo(0, 0);
  }
  function splitLabel(id) {
    const sp = D.SPLITS.find((x) => x.id === id);
    return sp ? sp.label : "My workout";
  }
  function findEx(id) {
    return S.draft && S.draft.exercises.find((e) => e.id === id);
  }
  async function saveDraft() {
    const d = S.draft;
    if (!d || !d.exercises.length) return;
    const now = new Date().toISOString();
    const idx = d.id ? S.workouts.findIndex((w) => w.id === d.id) : -1;
    if (idx < 0 && S.workouts.length >= MAX_WORKOUTS) {
      setStatus(`You have ${MAX_WORKOUTS} saved workouts — remove one first.`, "err");
      return;
    }
    const prev = idx >= 0 ? S.workouts[idx] : null;
    const w = {
      ...(prev || {}),
      id: d.id || uuid(),
      name: (d.name || "").trim() || "My workout",
      notes: d.notes || "",
      exercises: d.exercises.map((e) => ({ ...e, setup: e.setup || "", reps: String(e.reps || "") })),
      createdAt: (prev && prev.createdAt) || d.createdAt || now,
      savedAt: (prev && prev.savedAt) || now,
      lastDoneAt: (prev && prev.lastDoneAt) || null,
    };
    S.workouts = idx >= 0 ? S.workouts.map((x) => (x.id === w.id ? w : x)) : [w, ...S.workouts];
    closeEditor();
    try {
      const where = await Store.saveWorkout(w, S.workouts);
      setStatus(where === "cloud" ? `Saved “${w.name}”` : `Saved “${w.name}” on this device`, "ok");
    } catch (err) {
      console.warn("[mine] save failed", err);
      setStatus("Couldn’t save to your account — kept on this device.", "err");
    }
    return w;
  }
  async function removeWorkout(id) {
    S.workouts = S.workouts.filter((w) => w.id !== id);
    S.confirmRemove = null;
    if (S.view === "edit" && S.draft && S.draft.id === id) closeEditor();
    else render();
    try {
      await Store.deleteWorkout(id, S.workouts);
      setStatus("Removed", "ok");
    } catch (err) {
      console.warn("[mine] delete failed", err);
      setStatus("Couldn’t remove from your account — try again.", "err");
    }
  }

  function onMineClick(el) {
    const act = el.dataset.act;
    const d = S.draft;
    switch (act) {
      case "go-gym":
        return setTab("gym");
      case "new-split": {
        const sp = el.dataset.split;
        return openDraft({ id: null, name: splitLabel(sp), notes: "", exercises: fillSplit(sp, S.gym) });
      }
      case "new-blank":
        return openDraft({ id: null, name: "My workout", notes: "", exercises: [] });
      case "edit": {
        const w = S.workouts.find((x) => x.id === el.dataset.id);
        if (w) openDraft(JSON.parse(JSON.stringify({ id: w.id, name: w.name, notes: w.notes || "", exercises: w.exercises || [], createdAt: w.createdAt })));
        return;
      }
      case "remove":
      case "remove-draft": {
        const id = act === "remove" ? el.dataset.id : d && d.id;
        if (!id) return;
        if (S.confirmRemove === id) return removeWorkout(id);
        S.confirmRemove = id;
        render();
        setTimeout(() => {
          if (S.confirmRemove === id) {
            S.confirmRemove = null;
            render();
          }
        }, 4000);
        return;
      }
      case "fill":
        if (!d) return;
        d.exercises = fillSplit(el.dataset.split, S.gym);
        if (!d.name || d.name === "My workout") d.name = splitLabel(el.dataset.split);
        if (!d.exercises.length) setStatus("Nothing in that split fits your kit — mark more in Gym.", "err");
        break;
      case "move": {
        if (!d) return;
        const i = d.exercises.findIndex((e) => e.id === el.dataset.ex);
        const j = i + Number(el.dataset.dir);
        if (i < 0 || j < 0 || j >= d.exercises.length) return;
        const arr = d.exercises.slice();
        [arr[i], arr[j]] = [arr[j], arr[i]];
        d.exercises = arr;
        break;
      }
      case "rm-ex":
        if (!d) return;
        d.exercises = d.exercises.filter((e) => e.id !== el.dataset.ex);
        break;
      case "sets": {
        const ex = findEx(el.dataset.ex);
        if (!ex) return;
        ex.sets = Math.min(8, Math.max(1, (Number(ex.sets) || 1) + Number(el.dataset.d)));
        break;
      }
      case "rest": {
        const ex = findEx(el.dataset.ex);
        if (!ex) return;
        ex.restSeconds = Math.min(180, Math.max(0, (ex.restSeconds ?? 60) + Number(el.dataset.d)));
        break;
      }
      case "add-open":
        S.addOpen = true;
        break;
      case "add-close":
        S.addOpen = false;
        break;
      case "add-move": {
        const m = LIB_BY_ID.get(el.dataset.lib);
        if (!d || !m) return;
        d.exercises = [...d.exercises, toExercise(m)];
        setStatus(`Added ${m.name}`, "ok");
        break;
      }
      case "save":
        return saveDraft();
      case "back":
        return closeEditor();
      case "clip":
        S.clip = { videoId: el.dataset.vid, start: Number(el.dataset.start) || 0, name: el.dataset.name || "" };
        return render();
      case "clip-close":
        S.clip = null;
        return render();
      default:
        if (HOOKS.onAction && HOOKS.onAction(act, el)) return;
        return;
    }
    persistDraft();
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function onMineInput(e) {
    const t = e.target;
    const f = t.dataset && t.dataset.field;
    if (!f || !S.draft) return;
    if (f === "name") S.draft.name = t.value;
    else {
      const ex = findEx(t.dataset.ex);
      if (!ex) return;
      if (f === "reps") ex.reps = t.value;
      if (f === "setup") ex.setup = t.value;
    }
    persistDraft();
  }

  /** Extension points for the session logger (phase 3). */
  const HOOKS = {};

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
    S.workouts = Store.readLocal("workouts", []) || [];
    const draft = Store.readLocal("draft", null);
    if (draft && Array.isArray(draft.exercises)) {
      S.draft = draft;
      S.view = "edit";
    }
    render();
    try {
      S.workouts = await Store.loadWorkouts();
    } catch (err) {
      console.warn("[mine] workouts load failed", err);
      setStatus("Couldn’t load your workouts from the cloud — showing this device’s copy.", "err");
    }
    S.workoutsLoaded = true;
    if (HOOKS.afterLoad) await HOOKS.afterLoad();
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
    const act = e.target.closest("[data-act]");
    if (act && !act.disabled) {
      e.preventDefault();
      onMineClick(act);
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
    document.addEventListener("input", (e) => {
      const root = $("steal-root");
      if (root && root.contains(e.target)) onMineInput(e);
    });
    setTab("eddys", { keepScroll: true });
    const Auth = window.EddysHellAuth;
    if (Auth && Auth.onAuthChange) Auth.onAuthChange(onAuth);
  }

  window.EddysMine = { setTab, getTab: () => tab, _state: S, _hooks: () => HOOKS };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
