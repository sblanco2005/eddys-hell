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

  Object.assign(Store, {
    async loadSessions() {
      const local = this.readLocal("sessions", null);
      const c = await this.cloud();
      if (!c) return local || [];
      const snap = await c.fs.getDocs(c.fs.collection(c.db, "users", c.uid, "sessions"));
      const list = [];
      snap.forEach((d) => list.push({ ...d.data(), id: d.id }));
      this.writeLocal("sessions", list.slice(-200));
      return list;
    },
    async queueForTrainer(doc) {
      const c = await this.cloud();
      if (!c) throw new Error("not-signed-in-to-cloud");
      const { createdAt, ...rest } = doc;
      const data = clean({ type: "session", ...rest, uid: c.uid });
      if (doc.sessionId) data.sessionPath = `users/${c.uid}/sessions/${doc.sessionId}`;
      if (doc.workoutId) data.workoutPath = `users/${c.uid}/workouts/${doc.workoutId}`;
      data.createdAt = createdAt || c.fs.serverTimestamp(); // sentinel must not go through JSON
      const ref = await c.fs.addDoc(c.fs.collection(c.db, "trainerQueue"), data);
      return ref.id;
    },
    async saveSession(sess, all) {
      this.writeLocal("sessions", all.slice(-200));
      const c = await this.cloud();
      if (!c) return "device";
      await c.fs.setDoc(c.fs.doc(c.db, "users", c.uid, "sessions", sess.id), clean(sess));
      return "cloud";
    },
  });

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
      reps: m.muscle === "cardio" || /\d\s*(s|sec|secs|min)\b/i.test(String(m.reps)) ? String(m.reps) : String(DEFAULT_REPS),
      targetWeightLb: null,
      restSeconds: m.muscle === "cardio" ? 60 : 90,
      setup: "",
      notes: "",
      formUrl: m.videoId ? `https://www.youtube.com/watch?v=${m.videoId}` : "",
      startSeconds: m.videoId ? m.start || 0 : null,
    };
  }
  // ——— Lift targets: reps number (default 8) + planned weight (stored in lb) ———
  const DEFAULT_REPS = 8;
  const BW_EQUIP = new Set(["bodyweight", "pullup-bar", "dip-station", "bench"]);
  function isBodyweight(ex) {
    return BW_EQUIP.has(ex.equipment) || /pull-?up|chin-?up|\bdips?\b|push-?up/i.test(ex.name || "");
  }
  /** Editor kind: 'lift' gets Sets | Reps | Weight; cardio + timed holds (e.g. plank 30-45s) keep free text. */
  function editKind(ex) {
    if (ex.muscle === "cardio") return "free";
    if (/\d\s*(s|sec|secs|min)\b/i.test(String(ex.reps || ""))) return "free";
    return "lift";
  }
  /** '8' stays 8; a range like '5-8' / '8-12' → his default 8. */
  function migrateReps(r) {
    const t = String(r == null ? "" : r).trim();
    if (/^\d{1,3}$/.test(t)) return Number(t);
    return DEFAULT_REPS;
  }
  /** Heaviest logged set from the most recent finished session that has this move. */
  function lastWeightFor(name) {
    const sessions = (S.sessions || [])
      .filter((x) => x.finishedAt)
      .sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1));
    for (const x of sessions) {
      const e = (x.exercises || []).find((y) => y.name === name);
      if (!e) continue;
      const done = (e.logs || []).filter((l) => l.done && l.weightLb > 0);
      if (!done.length) continue;
      const top = done.reduce((a, b) => (b.weightLb > a.weightLb ? b : a));
      return { weightLb: top.weightLb, reps: top.reps };
    }
    return null;
  }
  /** Normalize a move to the new shape (idempotent). fillLast: prefill weight from last time. */
  function normalizeEx(ex, fillLast) {
    const out = { ...ex };
    if (editKind(out) === "lift") {
      out.reps = String(migrateReps(out.reps));
      if (out.targetWeightLb === undefined) out.targetWeightLb = null;
      if (fillLast && (out.targetWeightLb == null || out.targetWeightFrom === "last")) {
        const last = lastWeightFor(out.name);
        if (last) {
          out.targetWeightLb = last.weightLb;
          out.targetWeightFrom = "last";
        }
      }
    }
    return out;
  }
  const userUnit = () => Store.readLocal("unit", "lb");
  /** Barbell move? Per-move override (ex.barbell, set from the Hit it switch) beats library data. */
  function isBarbellEx(ex) {
    if (!ex) return false;
    if (typeof ex.barbell === "boolean") return ex.barbell;
    if (typeof ex.isBarbell === "boolean") return ex.isBarbell;
    return ex.equipment === "barbell" || /\bbarbell\b|deadlift|back squat|front squat/i.test(ex.name || "");
  }
  const DEFAULT_BAR_LB = 45;
  const barLbOf = (ex) => (ex && ex.barLb != null && Number.isFinite(Number(ex.barLb)) ? Math.max(0, Number(ex.barLb)) : DEFAULT_BAR_LB);

  /** Deterministic split auto-fill: per slot, first move your kit supports (no dup names). */
  function fillSplit(split, gear) {
    const used = new Set();
    const out = [];
    for (const slot of D.SPLIT_RULES[split] || []) {
      const m = slot.map((id) => LIB_BY_ID.get(id)).find((x) => x && fits(x, gear) && !used.has(x.name));
      if (m) {
        used.add(m.name);
        out.push(normalizeEx(toExercise(m), true));
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

  let statusTimer = null;
  function setStatus(msg, kind) {
    clearTimeout(statusTimer);
    if (msg) statusTimer = setTimeout(() => setStatus(""), 6000);
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
    else if (HOOKS.renderView && (html = HOOKS.renderView(S.view))) {
      /* session / history (phase 3) */
    } else html = renderMineList();
    return html + renderClip() + (HOOKS.renderReplace ? HOOKS.renderReplace() : "") + (HOOKS.renderPlanModal ? HOOKS.renderPlanModal() : "") + `<p class="steal-status" id="steal-status" hidden></p>`;
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
            <button type="button" class="ex-swap" data-act="repl-open" data-ctx="edit" data-ex="${esc(ex.id)}" aria-label="Replace ${esc(ex.name)}">⇄ Replace</button>
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
        ${editKind(ex) === "lift" ? renderLiftTargets(ex) : renderFreeTargets(ex)}
        <div class="ex-row ex-row-2">
          <div class="ex-field ex-rest">
            <span class="ex-lbl">Rest</span>
            <div class="stepper">
              <button type="button" data-act="rest" data-d="-15" data-ex="${esc(ex.id)}" aria-label="Less rest">−</button>
              <span class="mono rest">${ex.restSeconds ?? 60}s</span>
              <button type="button" data-act="rest" data-d="15" data-ex="${esc(ex.id)}" aria-label="More rest">+</button>
            </div>
          </div>
          <div class="ex-field ex-note">
            <span class="ex-lbl">Setup</span>
            <input class="ex-setup" data-field="setup" data-ex="${esc(ex.id)}" value="${esc(ex.setup || "")}" placeholder="hole 4 · bench 30°" aria-label="Setup note" />
          </div>
        </div>
      </li>`;
  }

  function renderLiftTargets(ex) {
    const unit = userUnit();
    const bw = isBodyweight(ex);
    const w = ex.targetWeightLb != null && ex.targetWeightLb > 0 ? fmtNum(toDisp(ex.targetWeightLb, unit)) : "";
    const last = lastWeightFor(ex.name);
    const hint = last ? `last: ${fmtNum(toDisp(last.weightLb, unit))}` : bw ? "optional" : "";
    return `
        <div class="ex-targets">
          <div class="ex-field">
            <span class="ex-lbl">Sets</span>
            <div class="stepper">
              <button type="button" data-act="sets" data-d="-1" data-ex="${esc(ex.id)}" aria-label="Fewer sets">−</button>
              <span class="mono">${ex.sets}</span>
              <button type="button" data-act="sets" data-d="1" data-ex="${esc(ex.id)}" aria-label="More sets">+</button>
            </div>
          </div>
          <div class="ex-field">
            <span class="ex-lbl">Reps</span>
            <div class="stepper">
              <button type="button" data-act="reps" data-d="-1" data-ex="${esc(ex.id)}" aria-label="Fewer reps">−</button>
              <span class="mono">${esc(ex.reps)}</span>
              <button type="button" data-act="reps" data-d="1" data-ex="${esc(ex.id)}" aria-label="More reps">+</button>
            </div>
          </div>
          <div class="ex-field">
            <span class="ex-lbl">Weight</span>
            <input class="ex-weight mono" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" data-field="weight" data-ex="${esc(ex.id)}" value="${esc(w)}" placeholder="${bw ? "BW" : "—"}" aria-label="Weight in ${unit}" />
          </div>
        </div>
        <p class="ex-perside">${last ? `<em class="ex-hint" data-hint="${esc(ex.id)}">${esc(hint)} ${unit}</em>` : ""}${
          isBarbellEx(ex)
            ? `<span class="mono" data-ps="${esc(ex.id)}">${esc(editorSideTxt(ex))}</span>`
            : `<span>${bw && !last ? `Bodyweight — add ${unit} only if loaded` : `Weight in ${unit}`}</span>`
        }</p>`;
  }
  /** '225 lb = 90/side + 45 bar' (editor hint for barbell moves). */
  function editorSideTxt(ex) {
    const unit = userUnit();
    const t = ex.targetWeightLb;
    const bar = barLbOf(ex);
    if (!(t > 0)) return `Barbell · enter total — bar is ${fmtNum(disp1(bar, unit))} ${unit}`;
    if (t < bar) return `${fmtNum(disp1(t, unit))} ${unit} is lighter than the ${fmtNum(disp1(bar, unit))} ${unit} bar`;
    return `${fmtNum(disp1(t, unit))} ${unit} = ${fmtNum(disp1((t - bar) / 2, unit))}/side + ${fmtNum(disp1(bar, unit))} bar`;
  }

  function renderFreeTargets(ex) {
    return `
        <div class="ex-targets free">
          <div class="ex-field">
            <span class="ex-lbl">Sets</span>
            <div class="stepper">
              <button type="button" data-act="sets" data-d="-1" data-ex="${esc(ex.id)}" aria-label="Fewer sets">−</button>
              <span class="mono">${ex.sets}</span>
              <button type="button" data-act="sets" data-d="1" data-ex="${esc(ex.id)}" aria-label="More sets">+</button>
            </div>
          </div>
          <div class="ex-field grow">
            <span class="ex-lbl">${ex.muscle === "cardio" ? "Target" : "Reps / time"}</span>
            <input class="ex-reps mono" data-field="reps" data-ex="${esc(ex.id)}" value="${esc(ex.reps)}" placeholder="6-8" aria-label="Target" />
          </div>
        </div>`;
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
          <div class="add-head"><p class="steal-kicker">Add a move</p><button type="button" class="btn ghost btn-sm" data-act="add-close">Done</button></div>
          <input class="repl-search" type="search" data-field="add-q" value="${esc(S.addQ || "")}" placeholder="Search ${D.LIB.length} moves — e.g. barbell lunges" aria-label="Search moves" autocomplete="off" enterkeyhint="search" />
          <div class="add-results">${S.addQ ? HOOKS.addListHtml(S.addQ) : ""}</div>
          <div class="add-groups"${S.addQ ? " hidden" : ""}><p class="steal-kicker">Your machines</p>
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
          </div>
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
    d.exercises = (d.exercises || []).map((e) => normalizeEx(e, true));
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
      case "reps": {
        const ex = findEx(el.dataset.ex);
        if (!ex) return;
        ex.reps = String(Math.min(50, Math.max(1, migrateReps(ex.reps) + Number(el.dataset.d))));
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
        d.exercises = [...d.exercises, normalizeEx(toExercise(m), true)];
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
    if (HOOKS.onInput && HOOKS.onInput(e)) return;
    if (!f || !S.draft) return;
    if (f === "name") S.draft.name = t.value;
    else {
      const ex = findEx(t.dataset.ex);
      if (!ex) return;
      if (f === "reps") ex.reps = t.value;
      if (f === "setup") ex.setup = t.value;
      if (f === "weight") {
        const v = t.value.trim().replace(",", ".");
        if (v === "") {
          ex.targetWeightLb = null;
          ex.targetWeightFrom = null;
        } else if (!Number.isNaN(Number(v))) {
          ex.targetWeightLb = fromDisp(Number(v), userUnit());
          ex.targetWeightFrom = "planned";
        }
        const ps = document.querySelector(`[data-ps="${ex.id}"]`);
        if (ps) ps.textContent = editorSideTxt(ex);
      }
    }
    persistDraft();
  }

  /** Extension points for the session logger (phase 3). */
  const HOOKS = {};


  // ——— Hit it: session logger (phase 3) ———
  const LB_PER_KG = 2.20462;
  const PLATES = { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] };
  const barFor = (unit) => (unit === "kg" ? 20 : 45);
  const toDisp = (lb, unit) => (unit === "kg" ? (lb ? Math.round((lb / LB_PER_KG) * 2) / 2 : 0) : Math.round((lb || 0) * 10) / 10);
  const fromDisp = (v, unit) => {
    const n = Math.max(0, Number(v) || 0);
    return unit === "kg" ? Math.round(n * LB_PER_KG * 10) / 10 : n;
  };
  /** lb → display unit, 0.1 precision (Hit it math: 135 lb → 61.2 kg, 45 lb bar → 20.4 kg). */
  const disp1 = (lb, unit) => Math.round((unit === "kg" ? (lb || 0) / LB_PER_KG : lb || 0) * 10) / 10;
  const toLb = (v, unit) => (unit === "kg" ? (Number(v) || 0) * LB_PER_KG : Number(v) || 0);
  const round1 = (n) => Math.round(n * 10) / 10;
  const other = (unit) => (unit === "kg" ? "lb" : "kg");
  /** Per-side plates in the current unit: the typed value if it was typed in this unit on this bar, else (total − bar) / 2. */
  /** A logged set keeps the bar it was lifted on; open sets follow the move's current bar. */
  const barOfLog = (l, ex) => (l.done && l.barLb != null && Number.isFinite(Number(l.barLb)) ? Number(l.barLb) : barLbOf(ex));
  function sideOf(l, ex, unit) {
    const bar = barOfLog(l, ex);
    if (l.perSide != null && l.unit === unit && Number(l.barLb) === bar) return Number(l.perSide);
    if (!(l.weightLb > 0)) return null;
    return Math.max(0, disp1((l.weightLb - bar) / 2, unit));
  }
  /** New bar weight for a move: plates on unlogged sets stay the same, totals follow. */
  function changeBar(ex, barLb, unit) {
    if (!Number.isFinite(barLb)) return;
    const keep = ex.logs.filter((l) => !l.done).map((l) => [l, sideOf(l, ex, unit)]);
    ex.barLb = Math.max(0, barLb);
    for (const [l, side] of keep) if (side != null) setSide(l, ex, unit, side);
  }
  /** Total lb = 2 × side (entered unit) + bar (lb). */
  const totalLbFrom = (side, unit, barLb) => round1(2 * toLb(Math.max(0, Number(side) || 0), unit) + barLb);
  function setSide(l, ex, unit, side) {
    const bar = barLbOf(ex);
    if (side == null || side === "") {
      l.perSide = null;
      l.weightLb = 0;
    } else {
      l.perSide = Math.max(0, Number(side) || 0);
      l.weightLb = totalLbFrom(l.perSide, unit, bar);
    }
    l.unit = unit;
    l.barLb = bar;
  }
  function plateList(ps, unit) {
    let r = Math.round(ps * 100) / 100;
    const out = [];
    for (const p of PLATES[unit === "kg" ? "kg" : "lb"]) while (r + 1e-6 >= p) {
      out.push(p);
      r = Math.round((r - p) * 100) / 100;
    }
    return out;
  }
  const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
  function kindOf(ex) {
    return ex.muscle === "cardio" ? (/\d+\s*(m|km|cal|kcal|min)\b/i.test(ex.reps) ? "time" : "reps") : "lift";
  }
  function parseTime(v) {
    const t = String(v || "").trim();
    if (!t) return null;
    const m = t.match(/^(\d{1,2}):(\d{1,2})$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  const fmtDur = (ms) => {
    const t = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = t % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  };

  Object.assign(S, { sessions: [], active: null, sessIdx: 0, perSide: true, rest: null, historyFor: null, finishOpen: false, finishNote: "", finishBusy: false });

  /** Last finished session's logs for this workout, keyed by move name. */
  function lastLogsFor(workoutId) {
    const prev = S.sessions
      .filter((x) => x.finishedAt && workoutId && x.workoutId === workoutId)
      .sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1))[0];
    const map = new Map();
    if (prev) for (const e of prev.exercises || []) map.set(e.name, e.logs || []);
    return { prev, map };
  }

  function startSession(w, workoutId) {
    if (!w || !w.exercises || !w.exercises.length) return;
    const unit = Store.readLocal("unit", "lb");
    const { map } = lastLogsFor(workoutId);
    const sess = {
      id: uuid(),
      workoutId: workoutId || null,
      name: (w.name || "").trim() || "My workout",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      unit,
      exercises: w.exercises.map((e0) => {
        const e = normalizeEx(e0, true);
        const prior = map.get(e.name) || [];
        return {
          ...e,
          barbell: isBarbellEx(e),
          barLb: barLbOf(e),
          setup: e.setup || "",
          logs: Array.from({ length: Math.max(1, Number(e.sets) || 1) }, (_, i) => {
            const p = prior[i] || prior[prior.length - 1];
            const lift = editKind(e) === "lift";
            const planned = lift && e.targetWeightLb > 0 ? e.targetWeightLb : null;
            return {
              set: i + 1,
              // planned target weight wins; else last time's set
              weightLb: planned != null ? planned : p ? p.weightLb || 0 : 0,
              reps: lift ? migrateReps(e.reps) : p && p.reps ? p.reps : Number.parseInt(e.reps, 10) || 8,
              timeSeconds: null,
              done: false,
            };
          }),
        };
      }),
    };
    if (!workoutId) sess.draft = { name: sess.name, notes: (w && w.notes) || "", exercises: w.exercises };
    S.active = sess;
    S.sessIdx = 0;
    S.rest = null;
    S.view = "session";
    S.draft = null;
    Store.writeLocal("draft", null);
    persistActive();
    render();
    window.scrollTo(0, 0);
    startTicker();
  }
  function persistActive() {
    Store.writeLocal("active", S.active ? { ...S.active, _idx: S.sessIdx } : null);
  }

  let ticker = null;
  function startTicker() {
    if (ticker) return;
    ticker = setInterval(() => {
      if (!S.active || S.view !== "session" || tab !== "mine") return;
      const el = $("sess-clock");
      if (el) el.textContent = fmtDur(Date.now() - new Date(S.active.startedAt).getTime());
      const r = $("rest-left");
      if (S.rest && r) {
        const left = Math.ceil((S.rest.until - Date.now()) / 1000);
        if (left <= 0) {
          S.rest = null;
          try {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          } catch (_) {}
          const bar = $("rest-bar");
          if (bar) {
            bar.classList.add("rest-done");
            r.textContent = "Go";
          }
        } else r.textContent = mmss(left);
      }
    }, 500);
  }

  /** Live total under a barbell set: plates per side + 'Total: 2×45 + 45 bar = 135 lb (61.2 kg)'. */
  function platesHtml(l, unit, ex) {
    const ex0 = ex || sessEx();
    const bar = barOfLog(l, ex0);
    const side = sideOf(l, ex0, unit);
    if (side == null) return `<p class="sess-total muted">Enter plates on <strong>one side</strong> — bar ${fmtNum(disp1(bar, unit))} ${unit} added for you</p>`;
    const list = plateList(side, unit);
    const tot = l.weightLb || bar;
    return `<p class="sess-total"><span class="tot-lbl">Total</span> <span class="mono">2×${fmtNum(side)} + ${fmtNum(disp1(bar, unit))} bar =</span>
        <strong class="mono tot-main">${fmtNum(disp1(tot, unit))} ${unit}</strong> <span class="mono tot-alt">(${fmtNum(disp1(tot, other(unit)))} ${other(unit)})</span></p>
      <div class="plates">${
        list.length
          ? list.map((p) => `<span class="plate p${String(p).replace(".", "_")}">${fmtNum(p)}</span>`).join("") + `<span class="hint">/ side</span>`
          : `<span class="hint">Empty bar</span>`
      }</div>`;
  }
  /** Non-barbell: just the conversion ('= 22.7 kg'). */
  function convHtml(l, unit) {
    if (!(l.weightLb > 0)) return "";
    return `<p class="sess-conv mono">= ${fmtNum(disp1(l.weightLb, other(unit)))} ${other(unit)}</p>`;
  }

  function renderSession() {
    const sess = S.active;
    if (!sess) return "";
    const exs = sess.exercises;
    const idx = Math.min(S.sessIdx, exs.length - 1);
    const ex = exs[idx];
    const unit = sess.unit;
    const kind = kindOf(ex);
    const per = kind === "lift" && isBarbellEx(ex);
    const bar = barLbOf(ex);
    const doneMoves = exs.filter((e) => e.logs.every((l) => l.done)).length;
    const clip = clipFor(ex);
    const { map } = lastLogsFor(sess.workoutId);
    const prior = (map.get(ex.name) || []).filter((l) => l.done);
    const lastTxt = prior.length
      ? prior
          .map((l) => (kind === "time" ? mmss(l.timeSeconds) : kind === "reps" ? `${l.reps}` : `${fmtNum(disp1(l.weightLb, unit))}×${l.reps}`))
          .join(" · ")
      : "";
    const rows = ex.logs
      .map((l) => {
        const wDisp = per ? sideOf(l, ex, unit) : l.weightLb > 0 ? disp1(l.weightLb, unit) : null;
        let inputs;
        if (kind === "time")
          inputs = `<span class="sess-target mono">${esc(ex.reps)}</span>
            <input class="sess-input mono grow" inputmode="decimal" data-sf="time" data-set="${l.set}" value="${l.timeSeconds ? mmss(l.timeSeconds) : ""}" placeholder="2:15" aria-label="Time" />`;
        else if (kind === "reps")
          inputs = `<input class="sess-input mono grow" inputmode="numeric" data-sf="reps" data-set="${l.set}" value="${l.reps || ""}" placeholder="reps" aria-label="Reps" />`;
        else
          inputs = `<label class="sess-wfield grow"><span class="sess-flbl">${per ? `One side · ${unit}` : `Weight · ${unit}`}</span>
              <input class="sess-input mono" inputmode="decimal" enterkeyhint="done" autocomplete="off" data-sf="weight" data-set="${l.set}" value="${wDisp != null ? fmtNum(wDisp) : ""}" placeholder="${per ? "per side" : isBodyweight(ex) ? "BW" : unit}" aria-label="${per ? `Weight on one side in ${unit}` : `Weight in ${unit}`}" /></label>
            <label class="sess-wfield reps"><span class="sess-flbl">Reps</span>
              <input class="sess-input mono" inputmode="numeric" enterkeyhint="done" data-sf="reps" data-set="${l.set}" value="${l.reps || ""}" placeholder="reps" aria-label="Reps" /></label>`;
        const plates =
          kind !== "lift" ? "" : per ? `<div class="plate-wrap" data-pw="${l.set}">${platesHtml(l, unit, ex)}</div>` : `<div class="plate-wrap" data-pw="${l.set}">${convHtml(l, unit)}</div>`;
        return `<li class="set-row${l.done ? " done" : ""}">
            <div class="set-main"><span class="set-n mono">${l.set}</span>${inputs}
              <button type="button" class="btn ${l.done ? "accent" : "secondary"} btn-sm set-log" data-act="log" data-set="${l.set}">${l.done ? "Logged" : "Log"}</button></div>
            ${plates}</li>`;
      })
      .join("");
    const rest = S.rest
      ? `<div class="rest-bar" id="rest-bar"><span>Rest</span><strong class="mono" id="rest-left">${mmss(Math.ceil((S.rest.until - Date.now()) / 1000))}</strong>
           <button type="button" class="btn ghost btn-sm" data-act="rest-add">+15s</button><button type="button" class="btn ghost btn-sm" data-act="rest-skip">Skip</button></div>`
      : "";
    return `
      <header class="sess-head">
        <div>
          <button type="button" class="steal-back" data-act="sess-leave">‹ Mine</button>
          <p class="steal-kicker">${doneMoves}/${exs.length} · <span class="mono" id="sess-clock">${fmtDur(Date.now() - new Date(sess.startedAt).getTime())}</span></p>
          <h2 class="sess-title">${esc(sess.name)}</h2>
        </div>
        <button type="button" class="btn ghost btn-sm" data-act="sess-finish">Finish</button>
      </header>
      ${
        kind === "lift"
          ? `<div class="seg-row">
              <div class="seg-pair" role="group" aria-label="Units">
                <button type="button" class="seg-btn${unit === "lb" ? " on" : ""}" data-act="unit" data-unit="lb" aria-pressed="${unit === "lb"}">lb</button>
                <button type="button" class="seg-btn${unit === "kg" ? " on" : ""}" data-act="unit" data-unit="kg" aria-pressed="${unit === "kg"}">kg</button>
              </div>
              <button type="button" class="seg-btn bb-switch${per ? " on" : ""}" data-act="barbell" aria-pressed="${per}">${per ? "✓ " : ""}Barbell</button>
            </div>
            ${
              per
                ? `<div class="bar-row">
                    <label class="bar-lbl" for="bar-in">Bar</label>
                    <input id="bar-in" class="sess-input mono bar-in" inputmode="decimal" enterkeyhint="done" autocomplete="off" data-sf="bar" value="${fmtNum(disp1(bar, unit))}" aria-label="Bar weight in ${unit}" />
                    <span class="bar-unit">${unit}</span>
                    <button type="button" class="seg-btn sm${bar === 45 ? " on" : ""}" data-act="bar" data-lb="45">${unit === "kg" ? "20.4" : "45"}</button>
                    <button type="button" class="seg-btn sm${bar === 35 ? " on" : ""}" data-act="bar" data-lb="35">${unit === "kg" ? "15.9" : "35"}</button>
                    <button type="button" class="seg-btn sm${bar === 0 ? " on" : ""}" data-act="bar" data-lb="0">None</button>
                  </div>`
                : ""
            }`
          : ""
      }
      <article class="sess-card">
        <p class="steal-kicker">${idx + 1} of ${exs.length} · ${esc(ex.muscle || "")}</p>
        <div class="sess-move-row"><h3 class="sess-move">${esc(ex.name)}</h3>
          <button type="button" class="ex-swap" data-act="repl-open" data-ctx="sess" data-ex="${esc(ex.id)}" aria-label="Replace ${esc(ex.name)}">⇄ Replace</button></div>
        ${ex.swappedFrom ? `<p class="hint sess-swapped">Swapped from ${esc(ex.swappedFrom)}</p>` : ""}
        ${lastTxt ? `<p class="hint sess-last">Last time: ${esc(lastTxt)}</p>` : ""}
        <input class="ex-setup" data-sf="setup" value="${esc(ex.setup || "")}" placeholder="${kind === "lift" ? "Cable 4 · bench 30°" : "Damper · fan · note"}" aria-label="Setup note" />
        <div class="ex-row">
          <div class="stepper">
            <button type="button" data-act="sess-sets" data-d="-1" aria-label="Fewer sets">−</button>
            <span class="mono">${ex.logs.length}</span>
            <button type="button" data-act="sess-sets" data-d="1" aria-label="More sets">+</button>
          </div>
          <span class="ex-x-sign">×</span>
          <input class="ex-reps mono" data-sf="target" value="${esc(ex.reps)}" placeholder="${kind === "time" ? "500m" : "6-8"}" aria-label="Target reps" />
          <span class="hint rest-note">${ex.restSeconds ?? 60}s rest</span>
        </div>
        ${clip ? `<button type="button" class="ex-clip sess-clip" data-act="clip" data-vid="${esc(clip.videoId)}" data-start="${clip.start}" data-name="${esc(ex.name)}">▶ Watch demo · ${mmss(clip.start)}</button>` : ""}
      </article>
      <ul class="set-list">${rows}</ul>
      ${rest}
      <div class="sess-nav">
        <button type="button" class="btn secondary" data-act="sess-prev" ${idx === 0 ? "disabled" : ""}>Previous</button>
        ${
          idx < exs.length - 1
            ? `<button type="button" class="btn accent" data-act="sess-next">Next move</button>`
            : `<button type="button" class="btn accent" data-act="sess-finish">Done</button>`
        }
      </div>`;
  }

  function renderHistory() {
    const w = S.workouts.find((x) => x.id === S.historyFor);
    const list = S.sessions
      .filter((x) => x.finishedAt && x.workoutId === S.historyFor)
      .sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1));
    const items = list.length
      ? `<ul class="hist-list">${list
          .map((x) => {
            const dur = fmtDur(new Date(x.finishedAt) - new Date(x.startedAt));
            const sets = x.exercises.reduce((n, e) => n + e.logs.filter((l) => l.done).length, 0);
            const lines = x.exercises
              .map((e) => {
                const done = e.logs.filter((l) => l.done);
                if (!done.length) return "";
                const k = kindOf(e);
                const txt = done
                  .map((l) => (k === "time" ? mmss(l.timeSeconds) : k === "reps" ? `${l.reps}` : `${fmtNum(toDisp(l.weightLb, x.unit))}×${l.reps}`))
                  .join(", ");
                return `<li><span>${esc(e.name)}${e.swappedFrom ? ` <em class="hint">(swapped from ${esc(e.swappedFrom)})</em>` : ""}</span><span class="mono">${esc(txt)}</span></li>`;
              })
              .join("");
            return `<li class="hist-item">
                <p class="hist-when">${esc(new Date(x.finishedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }))}
                  <span class="hint">· ${dur} · ${sets} sets · ${esc(x.unit)}</span></p>
                <ul class="hist-moves">${lines || `<li><span class="hint">No sets logged</span></li>`}</ul></li>`;
          })
          .join("")}</ul>`
      : `<p class="hint">No finished sessions yet. Hit it, then Finish to log one.</p>`;
    return `
      <header class="steal-head">
        <button type="button" class="steal-back" data-act="hist-back">‹ Mine</button>
        <p class="steal-kicker">History</p>
        <h2 class="steal-title">${esc(w ? w.name : "Workout")}</h2>
        <p class="steal-sub">${list.length} session${list.length === 1 ? "" : "s"}</p>
      </header>
      ${items}`;
  }

  function sessEx() {
    const s = S.active;
    return s ? s.exercises[Math.min(S.sessIdx, s.exercises.length - 1)] : null;
  }
  function rerenderKeep() {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  /** Compact summary of logged sets — shown in the Finish modal and sent to the trainer. */
  function sessionSummary(sess, finishedAt) {
    const unit = sess.unit;
    let totalSets = 0;
    let totalVolume = 0;
    const moves = [];
    for (const e of sess.exercises) {
      const k = kindOf(e);
      const done = e.logs.filter((l) => l.done);
      if (!done.length) continue;
      totalSets += done.length;
      moves.push({
        name: e.name,
        ...(e.swappedFrom ? { swappedFrom: e.swappedFrom, label: `${e.name} (swapped from ${e.swappedFrom})` } : {}),
        kind: k,
        sets: done.map((l) => {
          if (k === "time") return { t: l.timeSeconds || 0 };
          if (k === "reps") return { r: l.reps || 0 };
          const w = disp1(l.weightLb, unit);
          totalVolume += w * (l.reps || 0);
          const st = { w, r: l.reps || 0, totalLb: l.weightLb || 0 };
          if (isBarbellEx(e) && l.weightLb > 0) {
            // per side + bar in the unit he typed them in (falls back to the summary unit)
            const pu = l.perSide != null && (l.unit === "kg" || l.unit === "lb") ? l.unit : unit;
            st.ps = sideOf(l, e, pu);
            st.bar = disp1(barOfLog(l, e), pu);
            st.psUnit = pu;
            const tail = pu === unit ? `${fmtNum(st.ps)}/side + ${fmtNum(st.bar)} bar` : `${fmtNum(st.ps)} ${pu}/side + ${fmtNum(st.bar)} ${pu} bar`;
            st.txt = `${fmtNum(w)} ${unit} total (${tail}) × ${st.r}`;
          } else st.txt = `${w ? fmtNum(w) + " " + unit : "BW"} × ${st.r}`;
          return st;
        }),
      });
    }
    const end = finishedAt || new Date().toISOString();
    return {
      workoutName: sess.name,
      startedAt: sess.startedAt,
      finishedAt: end,
      durationMin: Math.max(0, Math.round((new Date(end) - new Date(sess.startedAt)) / 60000)),
      unit,
      moves, // only moves with ≥1 logged set; only logged sets (planned/unlogged excluded)
      totalSets,
      loggedSetCount: totalSets,
      totalVolume: Math.round(totalVolume),
    };
  }
  const setTxt = (st, unit) =>
    st.t != null ? mmss(st.t) : st.w != null ? `${st.w ? fmtNum(st.w) + unit : "BW"}${st.ps != null ? ` (${fmtNum(st.ps)}${st.psUnit && st.psUnit !== unit ? " " + st.psUnit : ""}/side)` : ""} × ${st.r}` : `${st.r} reps`;

  function renderFinishModal() {
    const sess = S.active;
    if (!sess || !S.finishOpen) return "";
    const sum = sessionSummary(sess);
    const empty = !sum.totalSets;
    const moves = sum.moves
      .map((m) => `<li><span class="fin-move">${esc(m.name)}${m.swappedFrom ? `<em class="fin-swap">swapped from ${esc(m.swappedFrom)}</em>` : ""}</span><span class="mono fin-sets">${m.sets.map((st) => esc(setTxt(st, sum.unit))).join(", ")}</span></li>`)
      .join("");
    return `
      <div class="eh-modal fin-modal" role="dialog" aria-modal="true" aria-labelledby="fin-title">
        <div class="eh-modal-backdrop" data-act="fin-cancel"></div>
        <div class="eh-modal-card fin-card">
          <p class="steal-kicker">Finish workout?</p>
          <h3 id="fin-title" class="fin-title">${esc(sum.workoutName)}</h3>
          <p class="hint fin-meta">${fmtDur(Date.now() - new Date(sess.startedAt).getTime())} · ${sum.totalSets} sets${
            sum.totalVolume ? ` · ${sum.totalVolume.toLocaleString()} ${esc(sum.unit)} volume` : ""
          }</p>
          ${
            empty
              ? `<p class="hint">Nothing logged yet — finishing now discards this session.</p>`
              : `<ul class="fin-list">${moves}</ul>
                 <label class="field-label" for="fin-note">How did it feel?</label>
                 <textarea id="fin-note" class="fin-note" data-fn="note" rows="3" maxlength="1000" placeholder="Optional — energy, pain, what to change…">${esc(S.finishNote || "")}</textarea>`
          }
          <div class="fin-actions">
            ${
              empty
                ? `<button type="button" class="btn accent wide-btn" data-act="fin-only">Discard session</button>`
                : `<button type="button" class="btn accent wide-btn" data-act="fin-send" ${S.finishBusy ? "disabled" : ""}>${S.finishBusy ? "Saving…" : "Finish &amp; send to trainer"}</button>
                   <button type="button" class="btn secondary wide-btn" data-act="fin-only" ${S.finishBusy ? "disabled" : ""}>Finish only</button>`
            }
            <button type="button" class="btn ghost wide-btn" data-act="fin-cancel">Keep going</button>
          </div>
        </div>
      </div>`;
  }

  function toast(msg, kind) {
    let el = $("steal-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "steal-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.className = "steal-toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.hidden = true), 4500);
  }

  async function finishSession(opts) {
    const send = !!(opts && opts.send);
    const note = String((opts && opts.note) || "").trim();
    const sess = S.active;
    if (!sess) return;
    S.finishOpen = false;
    S.finishNote = "";
    const logged = sess.exercises.reduce((n, e) => n + e.logs.filter((l) => l.done).length, 0);
    if (!logged) {
      // Nothing logged — don't create an empty history entry or bump "last done".
      S.active = null;
      S.rest = null;
      S.view = "list";
      persistActive();
      render();
      window.scrollTo(0, 0);
      setStatus("Nothing logged — session discarded.", "");
      return;
    }
    const now = new Date().toISOString();
    sess.finishedAt = now;
    if (note) sess.note = note;
    if (send) {
      sess.shareWithTrainer = true;
      sess.trainerStatus = "pending";
    }
    const draft = sess.draft;
    delete sess.draft;
    let w = sess.workoutId ? S.workouts.find((x) => x.id === sess.workoutId) : null;
    if (!w && draft && S.workouts.length < MAX_WORKOUTS) {
      // Finishing an unsaved build logs it as a workout (same as Steal).
      w = { id: uuid(), name: sess.name, notes: draft.notes || "", exercises: draft.exercises, createdAt: sess.startedAt, savedAt: now, lastDoneAt: null };
      S.workouts = [w, ...S.workouts];
      sess.workoutId = w.id;
    }
    if (w) {
      w.lastDoneAt = now;
      // Carry setup notes / target reps tweaks made mid-session back to the workout.
      const byId = new Map(sess.exercises.map((e) => [e.id, e]));
      w.exercises = (w.exercises || []).map((e) => {
        const se = byId.get(e.id);
        return se ? { ...e, setup: se.setup || "", reps: String(se.reps || e.reps), sets: se.swappedFrom ? e.sets : se.logs.length } : e;
      });
    }
    S.sessions = [...S.sessions.filter((x) => x.id !== sess.id), sess];
    S.active = null;
    S.rest = null;
    S.view = "list";
    persistActive();
    render();
    window.scrollTo(0, 0);
    let where = "device";
    try {
      where = await Store.saveSession(sess, S.sessions);
      if (w) await Store.saveWorkout(w, S.workouts);
    } catch (err) {
      console.warn("[mine] session save failed", err);
      toast("Couldn’t save the session to your account — kept on this device.", "err");
      return;
    }
    if (!send) {
      toast(`Logged “${sess.name}” · ${logged} sets${where === "cloud" ? "" : " (on this device)"}`, "ok");
      return;
    }
    try {
      const summary = sessionSummary(sess, now);
      if (!summary.loggedSetCount) return; // only performed work goes to the trainer
      if (note) summary.note = note;
      const fs = (await Store.cloud()).fs;
      await Store.queueForTrainer({
        email: (user && user.email) || "",
        displayName: (user && user.displayName) || "",
        type: "session",
        sessionId: sess.id,
        createdAt: fs.serverTimestamp(),
        status: "pending",
        summary,
      });
      toast("Saved — your trainer will get it shortly", "ok");
    } catch (err) {
      console.warn("[mine] trainer queue failed", err);
      sess.trainerStatus = "failed";
      Store.saveSession(sess, S.sessions).catch(() => {});
      toast("Saved, but couldn’t queue it for your trainer" + (where === "cloud" ? " — try again later." : " (offline)."), "err");
    }
  }

  Object.assign(HOOKS, {
    hitItButton: (w) =>
      `<button type="button" class="btn accent btn-sm" data-act="hit" data-id="${esc(w.id)}" ${(w.exercises || []).length ? "" : "disabled"}>Hit it</button>` +
      `<button type="button" class="btn secondary btn-sm" data-act="plan-open" data-src="workout" data-id="${esc(w.id)}" ${(w.exercises || []).length ? "" : "disabled"}>Send plan to trainer</button>`,
    historyButton: (w) => {
      const n = S.sessions.filter((x) => x.finishedAt && x.workoutId === w.id).length;
      return `<button type="button" class="btn ghost btn-sm" data-act="history" data-id="${esc(w.id)}">History${n ? ` · ${n}` : ""}</button>`;
    },
    hitItDraftButton: (d) =>
      `<button type="button" class="btn accent wide-btn" data-act="hit-draft" ${d.exercises.length ? "" : "disabled"}>Hit it</button>` +
      `<button type="button" class="btn secondary wide-btn" data-act="plan-open" data-src="draft" ${d.exercises.length ? "" : "disabled"}>Send plan to trainer</button>`,
    renderPlanModal: () => renderPlanModal(),
    resumeBanner: () =>
      S.active
        ? `<button type="button" class="resume-banner" data-act="sess-resume"><span>In progress · ${esc(S.active.name)}</span><strong>Resume ›</strong></button>`
        : "",
    renderView: (v) => (v === "session" && S.active ? renderSession() + renderFinishModal() : v === "history" && S.historyFor ? renderHistory() : ""),
    async afterLoad() {
      const a = Store.readLocal("active", null);
      if (a && Array.isArray(a.exercises) && !a.finishedAt) {
        S.sessIdx = a._idx || 0;
        delete a._idx;
        S.active = a;
        startTicker();
      }
      S.sessions = Store.readLocal("sessions", []) || [];
      try {
        S.sessions = await Store.loadSessions();
      } catch (err) {
        console.warn("[mine] sessions load failed", err);
      }
      // Migrate saved workouts to the Sets | Reps (number) | Weight shape and save it back.
      const changed = [];
      S.workouts = S.workouts.map((w) => {
        const exs = (w.exercises || []).map((e) => normalizeEx(e, false));
        if (JSON.stringify(exs) === JSON.stringify(w.exercises || [])) return w;
        const nw = { ...w, exercises: exs };
        changed.push(nw);
        return nw;
      });
      for (const w of changed) {
        try {
          await Store.saveWorkout(w, S.workouts);
        } catch (err) {
          console.warn("[mine] migrate save failed", err);
        }
      }
    },
    onAction(act, el) {
      const sess = S.active;
      switch (act) {
        case "hit": {
          const w = S.workouts.find((x) => x.id === el.dataset.id);
          if (w) startSession(w, w.id);
          return true;
        }
        case "plan-open": {
          const src = el.dataset.src === "draft" ? "draft" : "workout";
          if (src === "workout" && !S.workouts.some((x) => x.id === el.dataset.id)) return true;
          if (src === "draft" && !S.draft) return true;
          S.plan = { src, id: el.dataset.id || null, sent: false, busy: false };
          S.planNote = "";
          rerenderKeep();
          return true;
        }
        case "plan-cancel":
          S.plan = null;
          rerenderKeep();
          return true;
        case "plan-send":
          sendPlan();
          return true;
        case "plan-start": {
          const pl = S.plan;
          S.plan = null;
          if (!pl) return true;
          if (pl.src === "workout") {
            const w = S.workouts.find((x) => x.id === pl.id);
            if (w) startSession(w, w.id);
          } else if (S.draft) {
            const d = S.draft;
            const existing = d.id && S.workouts.some((x) => x.id === d.id);
            startSession(d, existing ? d.id : null);
          }
          return true;
        }
        case "hit-draft": {
          const d = S.draft;
          if (!d) return true;
          const existing = d.id && S.workouts.some((x) => x.id === d.id);
          startSession(d, existing ? d.id : null);
          return true;
        }
        case "history":
          S.historyFor = el.dataset.id;
          S.view = "history";
          render();
          window.scrollTo(0, 0);
          return true;
        case "hist-back":
          S.historyFor = null;
          S.view = "list";
          render();
          return true;
        case "sess-resume":
          S.view = "session";
          render();
          window.scrollTo(0, 0);
          return true;
        case "sess-leave":
          S.view = "list";
          render();
          return true;
        case "sess-finish":
          if (!S.active) return true;
          S.finishOpen = true;
          S.finishBusy = false;
          rerenderKeep();
          setTimeout(() => {
            const n = $("fin-note");
            if (n) n.blur();
          }, 0);
          return true;
        case "fin-cancel":
          S.finishOpen = false;
          rerenderKeep();
          return true;
        case "fin-send":
        case "fin-only":
          if (S.finishBusy) return true;
          S.finishBusy = true;
          finishSession({ send: act === "fin-send", note: S.finishNote });
          return true;
      }
      if (!sess) return false;
      const ex = sessEx();
      switch (act) {
        case "sess-prev":
          S.sessIdx = Math.max(0, S.sessIdx - 1);
          S.rest = null;
          persistActive();
          render();
          window.scrollTo(0, 0);
          return true;
        case "sess-next":
          S.sessIdx = Math.min(sess.exercises.length - 1, S.sessIdx + 1);
          S.rest = null;
          persistActive();
          render();
          window.scrollTo(0, 0);
          return true;
        case "unit":
          sess.unit = el.dataset.unit === "kg" ? "kg" : "lb";
          Store.writeLocal("unit", sess.unit);
          break;
        case "barbell":
          ex.barbell = !isBarbellEx(ex);
          break;
        case "bar":
          changeBar(ex, Number(el.dataset.lb), sess.unit);
          break;
        case "sess-sets": {
          const n = Math.min(8, Math.max(1, ex.logs.length + Number(el.dataset.d)));
          if (n > ex.logs.length) {
            const last = ex.logs[ex.logs.length - 1];
            const nl = { set: n, weightLb: last ? last.weightLb : 0, reps: last ? last.reps : 8, timeSeconds: null, done: false };
            if (last && last.perSide != null) Object.assign(nl, { perSide: last.perSide, unit: last.unit, barLb: last.barLb });
            ex.logs.push(nl);
          } else if (n < ex.logs.length) ex.logs = ex.logs.slice(0, n);
          ex.sets = ex.logs.length;
          break;
        }
        case "log": {
          const l = ex.logs.find((x) => x.set === Number(el.dataset.set));
          if (!l) return true;
          l.done = !l.done;
          if (l.done && kindOf(ex) === "lift" && isBarbellEx(ex) && l.weightLb > 0 && sideOf(l, ex, sess.unit) != null) {
            // record what was on the bar (keep the exact total when the side was derived, not typed)
            l.perSide = sideOf(l, ex, sess.unit);
            l.barLb = barLbOf(ex);
          }
          if (l.done && kindOf(ex) === "lift") l.unit = sess.unit;
          if (l.done && (ex.restSeconds ?? 60) > 0) S.rest = { until: Date.now() + (ex.restSeconds ?? 60) * 1000 };
          if (l.done) {
            // carry weight/reps forward to the next untouched set
            const nx = ex.logs.find((x) => x.set === l.set + 1);
            if (nx && !nx.done && !nx.weightLb) {
              nx.weightLb = l.weightLb;
              if (l.perSide != null) Object.assign(nx, { perSide: l.perSide, unit: l.unit, barLb: l.barLb });
            }
          }
          break;
        }
        case "rest-add":
          if (S.rest) S.rest.until += 15000;
          break;
        case "rest-skip":
          S.rest = null;
          break;
        default:
          return false;
      }
      persistActive();
      rerenderKeep();
      return true;
    },
    onInput(e) {
      const t = e.target;
      if (t.dataset && t.dataset.fn === "plan-note") {
        S.planNote = t.value;
        return true;
      }
      if (t.dataset && t.dataset.fn === "note") {
        S.finishNote = t.value;
        return true;
      }
      const f = t.dataset && t.dataset.sf;
      if (!f || !S.active) return false;
      const ex = sessEx();
      if (!ex) return true;
      const unit = S.active.unit;
      const per = kindOf(ex) === "lift" && isBarbellEx(ex);
      const l = t.dataset.set ? ex.logs.find((x) => x.set === Number(t.dataset.set)) : null;
      if (f === "setup") ex.setup = t.value;
      else if (f === "target") ex.reps = t.value;
      else if (l && f === "reps") l.reps = Number.parseInt(t.value, 10) || 0;
      else if (l && f === "time") {
        const v = parseTime(t.value);
        if (v != null) l.timeSeconds = v;
      } else if (l && f === "weight") {
        const v = t.value.trim().replace(",", ".");
        if (per) {
          if (v === "") setSide(l, ex, unit, null);
          else if (!Number.isNaN(Number(v))) setSide(l, ex, unit, Number(v));
        } else {
          if (v === "") l.weightLb = 0;
          else if (!Number.isNaN(Number(v))) l.weightLb = round1(toLb(Math.max(0, Number(v)), unit));
          l.unit = unit;
        }
        const pw = document.querySelector(`[data-pw="${l.set}"]`);
        if (pw) pw.innerHTML = per ? platesHtml(l, unit, ex) : convHtml(l, unit); // in place — a re-render would eat the Log tap
      } else if (f === "bar" && per) {
        const v = t.value.trim().replace(",", ".");
        if (v === "" || Number.isNaN(Number(v))) return true;
        changeBar(ex, round1(toLb(Math.max(0, Number(v)), unit)), unit);
        for (const x of ex.logs) {
          const pw = document.querySelector(`[data-pw="${x.set}"]`);
          if (pw) pw.innerHTML = platesHtml(x, unit, ex);
        }
        document.querySelectorAll('[data-act="bar"]').forEach((b) => b.classList.toggle("on", Number(b.dataset.lb) === barLbOf(ex)));
      }
      persistActive();
      return true;
    },
    onChange() {
      /* inputs update state + plate math in place (onInput); no re-render on blur so taps on Log aren't lost */
    },
  });


  // ——— Send plan to trainer (before starting) ———
  Object.assign(S, { plan: null, planNote: "" });
  function planSource(pl) {
    if (!pl) return null;
    if (pl.src === "workout") {
      const w = S.workouts.find((x) => x.id === pl.id);
      return w ? { workoutId: w.id, name: w.name, exercises: (w.exercises || []).map((e) => normalizeEx(e, true)) } : null;
    }
    const d = S.draft;
    if (!d) return null;
    const existing = d.id && S.workouts.some((x) => x.id === d.id);
    return { workoutId: existing ? d.id : null, name: (d.name || "").trim() || "My workout", exercises: d.exercises || [] };
  }
  function planSummary(src) {
    const unit = Store.readLocal("unit", "lb");
    const { map } = lastLogsFor(src.workoutId);
    const moves = src.exercises.map((e) => {
      const k = kindOf(e);
      const prior = (map.get(e.name) || []).filter((l) => l.done);
      const lift = editKind(e) === "lift";
      const m = {
        name: e.name,
        kind: k,
        sets: Number(e.sets) || 1,
        targetReps: lift ? migrateReps(e.reps) : String(e.reps || ""),
        restSec: e.restSeconds ?? 60,
        note: e.setup || "",
      };
      if (lift && e.targetWeightLb > 0) {
        m.targetWeight = toDisp(e.targetWeightLb, unit);
        m.targetWeightSource = e.targetWeightFrom === "last" ? "last time" : "planned";
      } else if (lift && !isBodyweight(e)) {
        const last = lastWeightFor(e.name) || (prior.length && prior[0].weightLb ? { weightLb: prior[0].weightLb } : null);
        if (last) {
          m.targetWeight = toDisp(last.weightLb, unit);
          m.targetWeightSource = "last time";
        }
      }
      if (lift && isBodyweight(e) && m.targetWeight == null) m.bodyweight = true;
      if (lift && m.targetWeight != null && isBarbellEx(e)) {
        const tl = e.targetWeightLb > 0 ? e.targetWeightLb : toLb(m.targetWeight, unit);
        const bar = barLbOf(e);
        if (tl >= bar) {
          m.targetPerSide = disp1((tl - bar) / 2, unit);
          m.barWeight = disp1(bar, unit);
        }
      }
      return m;
    });
    return { workoutName: src.name, workoutId: src.workoutId, unit, moves, note: "", plannedAt: new Date().toISOString() };
  }
  function renderPlanModal() {
    const pl = S.plan;
    if (!pl) return "";
    const src = planSource(pl);
    if (!src) return "";
    if (pl.sent) {
      return `
      <div class="eh-modal fin-modal" role="dialog" aria-modal="true" aria-labelledby="plan-title">
        <div class="eh-modal-backdrop" data-act="plan-cancel"></div>
        <div class="eh-modal-card fin-card">
          <p class="steal-kicker">Plan sent</p>
          <h3 id="plan-title" class="fin-title">${esc(src.name)}</h3>
          <p class="hint">Your trainer will get it shortly.</p>
          <div class="fin-actions">
            <button type="button" class="btn accent wide-btn" data-act="plan-start">Start now</button>
            <button type="button" class="btn ghost wide-btn" data-act="plan-cancel">Done</button>
          </div>
        </div>
      </div>`;
    }
    const sum = planSummary(src);
    const moves = sum.moves
      .map((m) => {
        const tgt = m.kind === "time" ? `${m.sets} × ${esc(m.targetReps)}` : `${m.sets} × ${esc(m.targetReps)}`;
        const wt =
          m.targetWeight != null
            ? ` · ${fmtNum(m.targetWeight)}${esc(sum.unit)}${m.targetPerSide != null ? ` (${fmtNum(m.targetPerSide)}/side)` : ""} <span class="plan-last">${esc(m.targetWeightSource)}</span>`
            : m.bodyweight
              ? " · BW"
              : "";
        return `<li><span class="fin-move">${esc(m.name)}</span>
          <span class="mono fin-sets">${tgt}${wt} · ${m.restSec}s rest</span>
          ${m.note ? `<span class="fin-sets plan-setup">${esc(m.note)}</span>` : ""}</li>`;
      })
      .join("");
    return `
      <div class="eh-modal fin-modal" role="dialog" aria-modal="true" aria-labelledby="plan-title">
        <div class="eh-modal-backdrop" data-act="plan-cancel"></div>
        <div class="eh-modal-card fin-card">
          <p class="steal-kicker">Send plan to trainer?</p>
          <h3 id="plan-title" class="fin-title">${esc(sum.workoutName)}</h3>
          <p class="hint fin-meta">${sum.moves.length} moves · ${sum.moves.reduce((n, m) => n + m.sets, 0)} planned sets</p>
          <ul class="fin-list">${moves}</ul>
          <label class="field-label" for="plan-note">Anything to flag?</label>
          <textarea id="plan-note" class="fin-note" data-fn="plan-note" rows="3" maxlength="1000" placeholder="e.g. shoulder tight">${esc(S.planNote || "")}</textarea>
          <div class="fin-actions">
            <button type="button" class="btn accent wide-btn" data-act="plan-send" ${pl.busy ? "disabled" : ""}>${pl.busy ? "Sending…" : "Send plan"}</button>
            <button type="button" class="btn ghost wide-btn" data-act="plan-cancel">Cancel</button>
          </div>
        </div>
      </div>`;
  }
  async function sendPlan() {
    const pl = S.plan;
    const src = planSource(pl);
    if (!pl || !src || pl.busy || !src.exercises.length) return;
    pl.busy = true;
    rerenderKeep();
    try {
      const summary = planSummary(src);
      summary.note = String(S.planNote || "").trim();
      const c = await Store.cloud();
      if (!c) throw new Error("not-signed-in-to-cloud");
      await Store.queueForTrainer({
        type: "plan",
        email: (user && user.email) || "",
        displayName: (user && user.displayName) || "",
        workoutId: src.workoutId || null,
        createdAt: c.fs.serverTimestamp(),
        status: "pending",
        summary,
      });
      pl.busy = false;
      pl.sent = true;
      S.planNote = "";
      rerenderKeep();
      toast("Plan sent — your trainer will get it shortly", "ok");
    } catch (err) {
      console.warn("[mine] plan send failed", err);
      pl.busy = false;
      rerenderKeep();
      toast("Couldn’t send the plan — check your connection and try again.", "err");
    }
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


  // ——— p11: forgiving search + movement patterns + custom moves ———
  const SYN = { bb: "barbell", db: "dumbbell", kb: "kettlebell", rdl: "romanian deadlift", sldl: "stiff leg deadlift", ohp: "overhead press", ez: "ez bar",
    bss: "bulgarian split squat", dl: "deadlift", sm: "smith", ghr: "glute ham raise", tbar: "t bar", pulldown: "pulldown", pullup: "pull up", chinup: "chin up", pushup: "push up",
    situp: "sit up", stepup: "step up", tri: "tricep", tris: "tricep", bi: "bicep", bis: "bicep", delt: "delt", lat: "lat", abs: "core", ab: "ab", hammy: "hamstring" };
  // name-side aliases so "overhead press" finds "Standing barbell press", "military" etc.
  const ALIAS = [[/standing barbell press|seated dumbbell press|standing dumbbell press|shoulder press|military/i, "overhead press ohp"], [/romanian|rdl/i, "romanian deadlift rdl"], [/dumbbell/i, "db"], [/barbell/i, "bb"], [/pull-?up/i, "pullup"], [/chin-?up/i, "chinup"], [/push-?up/i, "pushup"]];
  const stem = (w) => (w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && /(ches|shes|sses|xes)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
  const words = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  function queryTokens(q) {
    const out = [];
    for (const w of words(q)) for (const x of words(SYN[w] || SYN[stem(w)] || w)) out.push(stem(x));
    return out;
  }
  const HAY = new WeakMap();
  function hayOf(m) {
    let h = HAY.get(m);
    if (!h) {
      let txt = m.name + " " + m.muscle + " " + m.equipment + " " + (m.pattern || "");
      for (const [re, add] of ALIAS) if (re.test(m.name)) txt += " " + add;
      h = { name: words(m.name).map(stem), all: words(txt).map(stem) };
      HAY.set(m, h);
    }
    return h;
  }
  /** -1 = no match; else rank (lower = better). Every query word must prefix-match some word (any order). */
  function searchRank(m, toks) {
    if (!toks.length) return 0;
    const h = hayOf(m);
    let rank = 0;
    for (const t of toks) {
      if (h.name.some((w) => w === t)) continue;
      if (h.name.some((w) => w.startsWith(t))) rank += 1;
      else if (h.all.some((w) => w.startsWith(t))) rank += 3;
      else return -1;
    }
    return rank + h.name.length * 0.05;
  }
  function searchLib(q) {
    const toks = queryTokens(q);
    return D.LIB.map((m, i) => ({ m, r: searchRank(m, toks), i })).filter((x) => x.r >= 0);
  }
  function patternOf(m) {
    if (!m) return "";
    if (m.pattern) return m.pattern;
    const n = m.name.toLowerCase();
    const P = [[/lunge|split squat|step-?up|step-over/, "lunge"], [/squat|leg press/, "squat"], [/deadlift|rdl|good morning/, "hinge"], [/hip thrust|glute bridge/, "hip-ext"],
      [/leg curl/, "knee-flex"], [/leg extension/, "knee-ext"], [/calf/, "calf"], [/incline.*(press)|low-to-high cable press/, "incline-push"], [/fly|pec deck/, "fly"],
      [/bench press|chest press|floor press|push-up|decline/, "h-push"], [/standing barbell press|dumbbell press|shoulder press|landmine press/, "v-push"], [/lateral raise/, "lateral"],
      [/face pull|rear delt/, "rear-delt"], [/pull-?up|chin-?up|pulldown/, "v-pull"], [/row/, "h-pull"], [/shrug/, "shrug"], [/curl/, "curl"],
      [/pushdown|skull|extension|french|dip|close-grip/, "tri-ext"], [/crunch|knee raise/, "core-flex"], [/plank/, "anti-ext"], [/carry/, "carry"]];
    for (const [re, p] of P) if (re.test(n)) return p;
    return "";
  }
  // Custom moves (per user): local mirror + users/{uid}/gym/custom {items}
  const CUSTOM_EQUIP = ["barbell", "dumbbells", "kettlebells", "cables", "machine", "smith", "bodyweight", "bands", "ez-bar", "trap-bar", "landmine", "other"];
  function guessEquip(name) {
    const n = name.toLowerCase();
    const G = [[/\b(bb|barbell)\b/, "barbell"], [/\b(db|dumbbells?)\b/, "dumbbells"], [/\b(kb|kettlebells?)\b/, "kettlebells"], [/\bcable|rope\b/, "cables"], [/smith/, "smith"], [/machine|press machine|pec deck/, "machine"], [/\bbands?\b/, "bands"], [/ez/, "ez-bar"], [/trap.?bar|hex/, "trap-bar"], [/landmine/, "landmine"]];
    for (const [re, e] of G) if (re.test(n)) return e;
    return "bodyweight";
  }
  function guessMuscle(name, fallback) {
    const n = name.toLowerCase();
    const G = [[/lunge|squat|leg press|step|extension(?!.*tri)|quad/, "quads"], [/rdl|romanian|deadlift|good morning|leg curl|hamstring|nordic/, "hamstrings"], [/hip thrust|glute|bridge|kickback|abduct/, "glutes"],
      [/calf/, "calves"], [/bench|chest|fly|push-?up|pec/, "chest"], [/shoulder|overhead press|ohp|lateral|delt|arnold/, "shoulders"], [/row|pull|lat|shrug|chin/, "back"],
      [/curl/, "biceps"], [/tricep|pushdown|skull|dip/, "triceps"], [/crunch|plank|ab|core|twist|sit-?up/, "core"], [/run|bike|row erg|jump|sprint|cardio/, "cardio"]];
    for (const [re, m] of G) if (re.test(n)) return m;
    return fallback || "quads";
  }
  function addCustomToLib(m) {
    if (LIB_BY_ID.has(m.id)) return;
    D.LIB.push(m);
    LIB_BY_ID.set(m.id, m);
    if (!LIB_BY_NAME.has(m.name.toLowerCase())) LIB_BY_NAME.set(m.name.toLowerCase(), m);
  }
  Object.assign(Store, {
    async loadCustom() {
      const local = this.readLocal("custom", []) || [];
      const c = await this.cloud();
      if (!c) return local;
      const snap = await c.fs.getDoc(c.fs.doc(c.db, "users", c.uid, "gym", "custom"));
      const items = snap.exists() && Array.isArray(snap.data().items) ? snap.data().items : local;
      this.writeLocal("custom", items);
      return items;
    },
    async saveCustom(items) {
      this.writeLocal("custom", items);
      const c = await this.cloud();
      if (!c) return "device";
      await c.fs.setDoc(c.fs.doc(c.db, "users", c.uid, "gym", "custom"), clean({ items }), { merge: true });
      return "cloud";
    },
  });
  S.custom = [];
  const prevAfterLoad = HOOKS.afterLoad;
  HOOKS.afterLoad = async function () {
    if (prevAfterLoad) await prevAfterLoad();
    try {
      S.custom = (await Store.loadCustom()) || [];
    } catch (err) {
      console.warn("[mine] custom moves load failed", err);
      S.custom = Store.readLocal("custom", []) || [];
    }
    S.custom.forEach(addCustomToLib);
  };
  async function createCustom(name, muscle, equipment) {
    const nm = String(name || "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (!nm) return null;
    const exist = LIB_BY_NAME.get(nm.toLowerCase());
    if (exist) return exist;
    const nice = nm.charAt(0).toUpperCase() + nm.slice(1);
    const bb = equipment === "barbell" || /\b(bb|barbell)\b|deadlift|back squat|front squat/i.test(nm);
    const m = { id: "c-" + uuid().slice(0, 8), name: nice, muscle, equipment, needs: [], isBarbell: bb, sets: 3, reps: muscle === "cardio" ? "10 min" : "8", custom: true };
    m.pattern = patternOf(m);
    addCustomToLib(m);
    S.custom = [...S.custom, m];
    try {
      await Store.saveCustom(S.custom);
    } catch (err) {
      console.warn("[mine] custom save failed", err);
    }
    return m;
  }
  /** "Add as custom move" offer + quick form (muscle / equipment). where: 'repl' | 'add'. */
  function customHtml(q, where, fallbackMuscle) {
    const nm = String(q || "").trim();
    if (!nm) return "";
    const st = S.customForm && S.customForm.where === where && S.customForm.name === nm ? S.customForm : null;
    if (!st) return `<button type="button" class="btn secondary wide-btn custom-offer" data-act="custom-open" data-where="${where}" data-name="${esc(nm)}" data-mu="${esc(fallbackMuscle || "")}">+ Add “${esc(nm)}” as a custom move</button>`;
    return `<div class="custom-form">
        <p class="steal-kicker">New move · ${esc(nm)}</p>
        <label class="ex-lbl" for="cm-mu">Muscle group</label>
        <select id="cm-mu" class="repl-search" data-field="cm-mu">${D.MUSCLES.map((x) => `<option value="${x}"${x === st.muscle ? " selected" : ""}>${x}</option>`).join("")}</select>
        <label class="ex-lbl" for="cm-eq">Equipment</label>
        <select id="cm-eq" class="repl-search" data-field="cm-eq">${CUSTOM_EQUIP.map((x) => `<option value="${x}"${x === st.equipment ? " selected" : ""}>${x}</option>`).join("")}</select>
        <button type="button" class="btn accent wide-btn" data-act="custom-save" data-where="${where}">Save move</button>
      </div>`;
  }
  S.customForm = null;
  // ——— Replace a move (editor + Hit it) — beta p9 ———
  Object.assign(S, { repl: null });
  const SLOT_IDS = Object.values(D.SPLIT_RULES);
  function libOf(ex) {
    return (ex.libId && LIB_BY_ID.get(ex.libId)) || LIB_BY_NAME.get(String(ex.name || "").toLowerCase()) || null;
  }
  /** Alternatives: same movement slot first (bench ↔ DB bench ↔ chest press), then same muscle; kit you have first. */
  function replOptions(ex, q) {
    const cur = libOf(ex);
    const name = String(ex.name || "").toLowerCase();
    const pattern = new Set();
    if (cur) for (const day of SLOT_IDS) for (const slot of day) if (slot.includes(cur.id)) slot.forEach((id) => pattern.add(id));
    const pat = patternOf(cur || { name: ex.name });
    if (pat) for (const m of D.LIB) if (patternOf(m) === pat) pattern.add(m.id);
    const muscle = (cur && cur.muscle) || ex.muscle;
    // hide the move being replaced and anything already in this workout
    const inWorkout = ((S.repl && S.repl.ctx === "sess" ? S.active && S.active.exercises : S.draft && S.draft.exercises) || []).map((e) => String(e.name || "").toLowerCase());
    const seen = new Set([name, ...inWorkout]);
    const score = (m) => (fits(m, S.gym) ? 0 : 10) + (pattern.has(m.id) ? 0 : m.muscle === muscle ? 2 : 5);
    const ql = String(q || "").trim();
    let list = ql ? searchLib(ql).map((x) => ({ m: x.m, s: x.r * 20 + score(x.m), i: x.i })) : D.LIB.filter((m) => pattern.has(m.id) || m.muscle === muscle).map((m, i) => ({ m, s: score(m), i }));
    list = list
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .map((x) => x.m)
      .filter((m) => {
        const k = m.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    return list.map((m) => ({ m, have: fits(m, S.gym), similar: pattern.has(m.id) || m.muscle === muscle }));
  }
  /** New move from the library, keeping the old move's sets/reps/rest; weight re-prefills from the new move's last time. */
  function swapEx(old, m) {
    const base = toExercise(m);
    const nx = { ...base, sets: old.sets, restSeconds: old.restSeconds ?? base.restSeconds };
    if (editKind(nx) === "lift" && editKind(old) === "lift") nx.reps = String(migrateReps(old.reps));
    return normalizeEx(nx, true);
  }
  function replTarget() {
    const r = S.repl;
    if (!r) return null;
    if (r.ctx === "edit") return S.draft && S.draft.exercises.find((e) => e.id === r.exId);
    return S.active && S.active.exercises.find((e) => e.id === r.exId);
  }
  function freshLogs(nx, n, from) {
    const lift = editKind(nx) === "lift";
    return Array.from({ length: Math.max(1, n) }, (_, i) => ({
      set: i + 1,
      weightLb: lift && nx.targetWeightLb > 0 ? nx.targetWeightLb : 0,
      reps: lift ? migrateReps(nx.reps) : (from && from.reps) || Number.parseInt(nx.reps, 10) || 8,
      timeSeconds: null,
      done: false,
    }));
  }
  /** Routine-shaped copy of a session move (no logs / swap marker). */
  function routineCopy(e) {
    const { logs, swappedFrom, barbell, ...rest } = e;
    return { ...rest, sets: e.sets, setup: e.setup || "", reps: String(e.reps || "") };
  }
  function applyEditorReplace(m) {
    const d = S.draft;
    const i = d ? d.exercises.findIndex((e) => e.id === S.repl.exId) : -1;
    if (i < 0) return;
    const old = d.exercises[i];
    const nx = swapEx(old, m);
    d.exercises = d.exercises.map((e, j) => (j === i ? nx : e));
    S.repl = null;
    persistDraft();
    rerenderKeep();
    setStatus(`Replaced ${old.name} with ${nx.name}`, "ok");
  }
  async function applySessionReplace() {
    const r = S.repl;
    const sess = S.active;
    const m = r && LIB_BY_ID.get(r.pick);
    const i = sess && m ? sess.exercises.findIndex((e) => e.id === r.exId) : -1;
    if (i < 0) return;
    const old = sess.exercises[i];
    const logged = old.logs.filter((l) => l.done);
    const partial = logged.length > 0 && r.mode !== "whole";
    const nx0 = swapEx(old, m);
    const remaining = partial ? Math.max(1, old.logs.length - logged.length) : old.logs.length;
    const nx = {
      ...nx0,
      sets: remaining,
      barbell: isBarbellEx(nx0),
      barLb: barLbOf(nx0),
      setup: "",
      swappedFrom: old.swappedFrom && !partial ? old.swappedFrom : old.name,
      logs: freshLogs(nx0, remaining, old.logs[0]),
    };
    const exs = sess.exercises.slice();
    if (partial) {
      const kept = { ...old, logs: logged.map((l, k) => ({ ...l, set: k + 1 })), sets: logged.length };
      exs.splice(i, 1, kept, nx);
      S.sessIdx = i + 1;
    } else {
      exs.splice(i, 1, nx);
      S.sessIdx = i;
    }
    sess.exercises = exs;
    S.rest = null;
    const scope = r.scope === "routine" ? "routine" : "today";
    S.repl = null;
    if (sess.draft && Array.isArray(sess.draft.exercises)) {
      // unsaved build: keep its draft in step so finishing logs what was actually done
      sess.draft.exercises = sess.draft.exercises.map((e) => (e.id === old.id ? { ...routineCopy(nx), sets: old.logs.length } : e));
    }
    persistActive();
    rerenderKeep();
    window.scrollTo(0, 0);
    let msg = `Swapped to ${nx.name}${partial ? ` for the last ${remaining} set${remaining === 1 ? "" : "s"}` : ""}`;
    if (scope === "routine" && sess.workoutId) {
      const w = S.workouts.find((x) => x.id === sess.workoutId);
      if (w) {
        const has = (w.exercises || []).some((e) => e.id === old.id);
        const nw = {
          ...w,
          exercises: has
            ? w.exercises.map((e) => (e.id === old.id ? { ...routineCopy(nx), sets: e.sets } : e))
            : [...(w.exercises || []), routineCopy(nx)],
        };
        S.workouts = S.workouts.map((x) => (x.id === w.id ? nw : x));
        msg += " · routine updated";
        try {
          await Store.saveWorkout(nw, S.workouts);
        } catch (err) {
          console.warn("[mine] routine update failed", err);
          msg += " (on this device)";
        }
      }
    }
    toast(msg, "ok");
  }
  const replKicker = (q) => (q ? "Matches" : "Suggested — same muscle, your kit first");
  function replListHtml(ex, q) {
    const opts = replOptions(ex, q);
    return (opts.length
      ? opts
          .slice(0, 40)
          .map(
            ({ m, have, similar }) => `<button type="button" class="add-move repl-opt${have ? "" : " no-kit"}" data-act="repl-pick" data-lib="${esc(m.id)}">
              <span class="repl-name">${esc(m.name)}<small>${esc(m.muscle)} · ${esc(m.equipment)}${have ? "" : " · not in your Gym"}</small></span>
              ${similar && !q ? `<span class="repl-tag">similar</span>` : ""}</button>`
          )
          .join("")
      : `<p class="hint">No moves match “${esc(q)}”.</p>`) + offerCustom(q, "repl", (replTarget() || {}).muscle);
  }
  function offerCustom(q, where, mu) {
    const nm = String(q || "").trim();
    return nm && !LIB_BY_NAME.has(nm.toLowerCase()) ? customHtml(nm, where, mu) : "";
  }
  /** Editor "Add a move": search results (same forgiving search) — empty query keeps the by-muscle list. */
  function addListHtml(q) {
    const inW = new Set(((S.draft && S.draft.exercises) || []).map((e) => String(e.name || "").toLowerCase()));
    const seen = new Set();
    const res = searchLib(q)
      .map((x) => ({ ...x, s: x.r * 20 + (fits(x.m, S.gym) ? 0 : 10) }))
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .map((x) => x.m)
      .filter((m) => {
        const k = m.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 40);
    return (
      (res.length
        ? res
            .map(
              (m) => `<button type="button" class="add-move repl-opt${fits(m, S.gym) ? "" : " no-kit"}" data-act="add-move" data-lib="${esc(m.id)}">
            <span class="repl-name">${esc(m.name)}<small>${esc(m.muscle)} · ${esc(m.equipment)}${fits(m, S.gym) ? "" : " · not in your Gym"}${inW.has(m.name.toLowerCase()) ? " · in this workout" : ""}</small></span></button>`
            )
            .join("")
        : `<p class="hint">No moves match “${esc(q)}”.</p>`) + offerCustom(q, "add", guessMuscle(q))
    );
  }
  function renderReplace() {
    const r = S.repl;
    const ex = replTarget();
    if (!r || !ex) return "";
    let body;
    if (r.pick) {
      const m = LIB_BY_ID.get(r.pick);
      const logged = ex.logs ? ex.logs.filter((l) => l.done).length : 0;
      const sess = S.active;
      const left = ex.logs ? Math.max(1, ex.logs.length - logged) : 0;
      body = `
        <p class="repl-from">${esc(ex.name)} <span aria-hidden="true">→</span> <strong>${esc(m ? m.name : "")}</strong></p>
        ${
          logged
            ? `<p class="steal-kicker">You logged ${logged} set${logged === 1 ? "" : "s"} already</p>
               <div class="repl-seg" role="group" aria-label="What to replace">
                 <button type="button" class="seg-btn${r.mode !== "whole" ? " on" : ""}" data-act="repl-mode" data-v="rest" aria-pressed="${r.mode !== "whole"}">Replace remaining sets<small>keep ${logged} logged · ${left} left</small></button>
                 <button type="button" class="seg-btn${r.mode === "whole" ? " on" : ""}" data-act="repl-mode" data-v="whole" aria-pressed="${r.mode === "whole"}">Replace whole move<small>discard logged sets</small></button>
               </div>`
            : ""
        }
        ${
          sess && sess.workoutId
            ? `<p class="steal-kicker">Saved routine</p>
               <div class="repl-seg" role="group" aria-label="Update routine?">
                 <button type="button" class="seg-btn${r.scope !== "routine" ? " on" : ""}" data-act="repl-scope" data-v="today" aria-pressed="${r.scope !== "routine"}">Just today</button>
                 <button type="button" class="seg-btn${r.scope === "routine" ? " on" : ""}" data-act="repl-scope" data-v="routine" aria-pressed="${r.scope === "routine"}">Update routine</button>
               </div>`
            : ""
        }
        <div class="fin-actions">
          <button type="button" class="btn accent wide-btn" data-act="repl-confirm">Replace</button>
          <button type="button" class="btn ghost wide-btn" data-act="repl-back">‹ Pick another</button>
        </div>`;
    } else {
      body = `
        <input class="repl-search" type="search" data-field="repl-q" value="${esc(r.q || "")}" placeholder="Search all moves" aria-label="Search moves" autocomplete="off" enterkeyhint="search" />
        <p class="steal-kicker repl-kick">${replKicker(r.q)}</p>
        <div class="repl-list">${replListHtml(ex, r.q)}</div>
        <p class="hint">Keeps ${esc(String(ex.logs ? ex.logs.length : ex.sets))} sets × ${esc(String(ex.reps))}. Weight fills from that move’s last time.</p>`;
    }
    return `
      <div class="eh-modal repl-modal" role="dialog" aria-modal="true" aria-labelledby="repl-title">
        <div class="eh-modal-backdrop" data-act="repl-close"></div>
        <div class="eh-modal-card repl-card">
          <div class="repl-head"><div><p class="steal-kicker">Replace</p><h3 id="repl-title" class="fin-title">${esc(ex.name)}</h3></div>
            <button type="button" class="ex-x" data-act="repl-close" aria-label="Close">×</button></div>
          ${body}
        </div>
      </div>`;
  }
  HOOKS.renderReplace = renderReplace;
  HOOKS.addListHtml = addListHtml;
  const prevOnAction = HOOKS.onAction;
  HOOKS.onAction = (act, el) => {
    switch (act) {
      case "repl-open":
        S.repl = { ctx: el.dataset.ctx === "sess" ? "sess" : "edit", exId: el.dataset.ex, q: "", pick: null, mode: "rest", scope: "today" };
        rerenderKeep();
        return true;
      case "repl-close":
        S.repl = null;
        rerenderKeep();
        return true;
      case "repl-pick": {
        const m = LIB_BY_ID.get(el.dataset.lib);
        if (!S.repl || !m) return true;
        if (S.repl.ctx === "edit") applyEditorReplace(m);
        else {
          S.repl.pick = m.id;
          rerenderKeep();
        }
        return true;
      }
      case "repl-back":
        if (S.repl) S.repl.pick = null;
        rerenderKeep();
        return true;
      case "repl-mode":
        if (S.repl) S.repl.mode = el.dataset.v === "whole" ? "whole" : "rest";
        rerenderKeep();
        return true;
      case "repl-scope":
        if (S.repl) S.repl.scope = el.dataset.v === "routine" ? "routine" : "today";
        rerenderKeep();
        return true;
      case "repl-confirm":
        applySessionReplace();
        return true;
      case "custom-open": {
        const nm = el.dataset.name || "";
        S.customForm = { where: el.dataset.where, name: nm, muscle: guessMuscle(nm, el.dataset.mu), equipment: guessEquip(nm) };
        rerenderKeep();
        return true;
      }
      case "custom-save": {
        const f = S.customForm;
        if (!f) return true;
        S.customForm = null;
        createCustom(f.name, f.muscle, f.equipment).then((m) => {
          if (!m) return;
          if (f.where === "repl" && S.repl) {
            if (S.repl.ctx === "edit") applyEditorReplace(m);
            else {
              S.repl.pick = m.id;
              rerenderKeep();
            }
          } else if (S.draft) {
            S.draft.exercises = [...S.draft.exercises, normalizeEx(toExercise(m), true)];
            S.addQ = "";
            persistDraft();
            rerenderKeep();
          }
          setStatus(`Saved custom move “${m.name}”`, "ok");
        });
        return true;
      }
    }
    return prevOnAction ? prevOnAction(act, el) : false;
  };
  const prevOnInput = HOOKS.onInput;
  HOOKS.onInput = (e) => {
    const t = e.target;
    if (t.dataset && (t.dataset.field === "cm-mu" || t.dataset.field === "cm-eq") && S.customForm) {
      S.customForm[t.dataset.field === "cm-mu" ? "muscle" : "equipment"] = t.value;
      return true;
    }
    if (t.dataset && t.dataset.field === "add-q") {
      S.addQ = t.value;
      const box = document.querySelector(".add-results");
      const grp = document.querySelector(".add-groups");
      if (box) box.innerHTML = S.addQ.trim() ? addListHtml(S.addQ) : "";
      if (grp) grp.hidden = !!S.addQ.trim();
      return true;
    }
    if (t.dataset && t.dataset.field === "repl-q" && S.repl) {
      S.repl.q = t.value;
      const ex = replTarget();
      const list = document.querySelector(".repl-list");
      const kick = document.querySelector(".repl-kick");
      // update just the list so the search box keeps focus
      if (list && ex) list.innerHTML = replListHtml(ex, S.repl.q);
      if (kick) kick.textContent = replKicker(S.repl.q);
      return true;
    }
    return prevOnInput ? prevOnInput(e) : false;
  };

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
    // numeric inputs in Mine (see p11 below)
    const isNum = (t) => t && t.tagName === "INPUT" && /^(decimal|numeric)$/.test(t.getAttribute("inputmode") || "") && !!t.closest("#steal-root");
    // p11: tapping a number CLEARS it (old value shown dimmed as the placeholder) — no iOS caret/selection fiddling.
    // While empty, state keeps the old value (totals don't flash); blur with nothing typed restores it.
    document.addEventListener("focusin", (e) => {
      const t = e.target;
      if (!isNum(t) || t.dataset.prev != null) return;
      t.dataset.prev = t.value;
      t.dataset.ph = t.getAttribute("placeholder") || "";
      if (t.value !== "") {
        t.setAttribute("placeholder", t.value);
        t.value = "";
      }
    });
    document.addEventListener(
      "input",
      (e) => {
        const t = e.target;
        if (!isNum(t) || t.dataset.prev == null || t.dataset.replay) return;
        if (t.value.trim() !== "") {
          t.dataset.typed = "1";
          return;
        }
        if (!t.dataset.prev) return;
        e.stopImmediatePropagation();
        if (t.dataset.typed) replayPrev(t); // typed then erased → totals go back to the old value, not 0
      },
      true
    );
    function replayPrev(t) {
      t.dataset.replay = "1";
      t.value = t.dataset.prev;
      t.dispatchEvent(new Event("input", { bubbles: true }));
      t.value = "";
      delete t.dataset.replay;
      delete t.dataset.typed;
    }
    document.addEventListener(
      "input",
      () => {
      },
      true
    );
    document.addEventListener("focusout", (e) => {
      const t = e.target;
      if (!isNum(t) || t.dataset.prev == null) return;
      const prev = t.dataset.prev;
      t.setAttribute("placeholder", t.dataset.ph || "");
      delete t.dataset.prev;
      delete t.dataset.ph;
      delete t.dataset.typed;
      if (t.value.trim() === "" && prev !== "") t.value = prev; // state never changed — just show it again
    });
    document.addEventListener("input", (e) => {
      const root = $("steal-root");
      if (root && root.contains(e.target)) onMineInput(e);
    });
    document.addEventListener("change", (e) => {
      const root = $("steal-root");
      if (root && root.contains(e.target) && HOOKS.onChange) HOOKS.onChange(e);
    });
    setTab("eddys", { keepScroll: true });
    const Auth = window.EddysHellAuth;
    if (Auth && Auth.onAuthChange) Auth.onAuthChange(onAuth);
  }

  window.EddysMine = { setTab, getTab: () => tab, _state: S, _hooks: () => HOOKS };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
