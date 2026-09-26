/**
 * Eddy's Hell — Thursday workout (admin + member)
 * Storage: eddys-hell-admin-v1, eddys-hell-checkins-v1
 */
(function () {
  "use strict";

  const STORAGE_KEY = "eddys-hell-admin-v1";
  const PENDING_PUBLISH_KEY = "eddys-hell-pending-publish-v1";
  const EXCLUDE_TYPES = new Set(["OutsideRoot"]);
  const POOL_SIZE = 20;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const TYPE_ORDER = [
    "Full", "Upper", "Lower", "Push", "Pull",
    "HIIT", "Kettlebell", "Circuit", "CrossFit",
  ];

  /** @type {{ meta: object, files: Array }} */
  let catalog = { meta: {}, files: [] };
  /** @type {object} */
  let state = {
    rule: null,
    usedHistory: [],
    lastPick: null,
  };
  /** @type {object|null} */
  let currentResult = null;
  /** @type {object|null} published this-week from repo */
  let thisWeekFile = null;
  /** @type {object|null} auth user with role */
  let authUser = null;

  // ——— Persistence ———

  function defaultRule() {
    return {
      folderTypes: ["Full"],
      minHR: 120,
      requireHR: true,
      recency: "recent",
      rotate: true,
      rotateWeeks: 8,
      tagContains: "",
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = {
          rule: { ...defaultRule(), ...(parsed.rule || {}) },
          usedHistory: Array.isArray(parsed.usedHistory) ? parsed.usedHistory : [],
          lastPick: parsed.lastPick || null,
        };
        return;
      }
    } catch (_) { /* ignore */ }
    state = { rule: defaultRule(), usedHistory: [], lastPick: null };
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        rule: state.rule,
        usedHistory: state.usedHistory,
        lastPick: state.lastPick,
      })
    );
  }

  // ——— Picker ———

  function parseMtime(s) {
    if (!s) return 0;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  }

  function weeksAgoCutoff(weeks) {
    return Date.now() - weeks * WEEK_MS;
  }

  function recentlyUsedIds(usedHistory, weeks) {
    const cutoff = weeksAgoCutoff(weeks);
    const ids = new Set();
    for (const entry of usedHistory || []) {
      const t = Date.parse(entry.pickedAt);
      if (Number.isFinite(t) && t >= cutoff) ids.add(entry.id);
    }
    return ids;
  }

  function pick(files, rule, usedHistory) {
    const types = new Set(rule.folderTypes || []);
    const minHR = Number(rule.minHR);
    const requireHR = !!rule.requireHR;
    const tagQ = (rule.tagContains || "").trim().toLowerCase();
    const rotateOn = !!rule.rotate;
    const rotateWeeks = Math.max(1, Number(rule.rotateWeeks) || 8);
    const blocked = rotateOn ? recentlyUsedIds(usedHistory, rotateWeeks) : new Set();

    let matches = files.filter((f) => {
      if (types.size && !types.has(f.folderType)) return false;

      const hr = f.hr;
      const hasHR = hr != null && hr !== "" && Number.isFinite(Number(hr));
      if (requireHR) {
        if (!hasHR || Number(hr) <= minHR) return false;
      } else if (hasHR && Number.isFinite(minHR) && Number(hr) <= minHR) {
        return false;
      }

      if (tagQ) {
        const inTags = (f.rawTags || []).some((t) =>
          String(t).toLowerCase().includes(tagQ)
        );
        const inName = String(f.filename || "").toLowerCase().includes(tagQ);
        if (!inTags && !inName) return false;
      }

      if (blocked.has(f.id)) return false;
      return true;
    });

    if (matches.length === 0) {
      return {
        ok: false,
        matchCount: 0,
        error:
          "Zero workouts matched. Loosen types, lower min HR, turn off Require HR, widen rotate weeks, or clear the tag filter.",
      };
    }

    const recency = rule.recency || "recent";
    let pool;

    if (recency === "any") {
      pool = [...matches];
    } else {
      const sorted = [...matches].sort((a, b) => {
        const da = parseMtime(a.mtime);
        const db = parseMtime(b.mtime);
        return recency === "recent" ? db - da : da - db;
      });
      pool = sorted.slice(0, Math.min(POOL_SIZE, sorted.length));
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)];

    const whyParts = [];
    whyParts.push(`Type: ${chosen.folderType}`);
    if (requireHR) whyParts.push(`HR ${chosen.hr} > ${minHR}`);
    else if (chosen.hr != null) whyParts.push(`HR ${chosen.hr}`);
    else whyParts.push("HR missing (allowed)");
    if (recency === "recent") whyParts.push("prefer recent (top pool)");
    else if (recency === "older") whyParts.push("prefer older (top pool)");
    else whyParts.push("any (random among matches)");
    if (rotateOn) whyParts.push(`rotate: excluded last ${rotateWeeks}w`);
    if (tagQ) whyParts.push(`tag/name contains “${tagQ}”`);
    whyParts.push(`${matches.length} candidate${matches.length === 1 ? "" : "s"}`);

    return {
      ok: true,
      pick: chosen,
      matches,
      why: whyParts.join(" · "),
    };
  }

  function matchCount(files, rule, usedHistory) {
    const r = pick(files, rule, usedHistory);
    return r.ok ? r.matches.length : 0;
  }

  // ——— Formatting ———

  function formatBytes(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatMtime(s) {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET";
  }

  function formatPickedAt(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET";
  }

  // ——— This week resolution ———

  /** Prefer repo this-week.json, then localStorage lastPick */
  function resolveThisWeek() {
    if (thisWeekFile && (thisWeekFile.pickId || thisWeekFile.id)) {
      const id = thisWeekFile.pickId || thisWeekFile.id;
      return {
        id,
        filename: thisWeekFile.filename,
        folderType: thisWeekFile.folderType,
        hr: thisWeekFile.hr,
        relPath: thisWeekFile.relPath,
        sizeBytes: thisWeekFile.sizeBytes,
        mtime: thisWeekFile.mtime,
        rawTags: thisWeekFile.rawTags || [],
        pickedAt: thisWeekFile.pickedAt,
        why: thisWeekFile.why,
        matchCount: thisWeekFile.matchCount,
        source: "file",
      };
    }
    if (state.lastPick) {
      return { ...state.lastPick, source: "local" };
    }
    return null;
  }

  function downloadThisWeekJson(payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "this-week.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ——— UI helpers ———

  function $(id) {
    return document.getElementById(id);
  }

  function availableTypes() {
    const present = new Set(
      catalog.files
        .map((f) => f.folderType)
        .filter((t) => t && !EXCLUDE_TYPES.has(t))
    );
    const ordered = TYPE_ORDER.filter((t) => present.has(t));
    for (const t of [...present].sort()) {
      if (!ordered.includes(t)) ordered.push(t);
    }
    return ordered;
  }

  function hideAllViews() {
    for (const id of ["view-landing", "view-member", "view-rule", "view-pick"]) {
      const el = $(id);
      if (!el) continue;
      el.classList.remove("active");
      el.hidden = true;
    }
  }

  function showView(name) {
    hideAllViews();
    const map = {
      landing: "view-landing",
      member: "view-member",
      rule: "view-rule",
      pick: "view-pick",
    };
    const id = map[name];
    if (!id) return;
    const el = $(id);
    el.hidden = false;
    el.classList.add("active");

    if (name === "rule" || name === "pick") {
      for (const tab of document.querySelectorAll(".tab")) {
        const on = tab.dataset.view === name;
        tab.classList.toggle("active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
      }
    }
  }

  function renderUserSlot() {
    const slot = $("user-slot");
    if (!authUser) {
      slot.hidden = true;
      return;
    }
    slot.hidden = false;
    $("user-name").textContent = authUser.displayName || authUser.email;
    $("user-role").textContent =
      authUser.role === "admin" ? "Admin" : "Member";
    const av = $("user-avatar");
    if (authUser.photoURL) {
      av.src = authUser.photoURL;
      av.hidden = false;
    } else {
      av.hidden = true;
      av.removeAttribute("src");
    }
  }

  function renderLanding() {
    showView("landing");
    $("admin-tabs").hidden = true;
    $("brand-sub").textContent = "Thursday workout";

    const tw = resolveThisWeek();
    $("locked-title").textContent = tw
      ? `This week: ${tw.filename || "workout"} (sign in to unlock)`
      : "Workout locked until you sign in.";

    const configured = window.EddysHellAuth.isConfigured();
    const local = window.EddysHellAuth.isLocalhost();

    $("auth-not-configured").hidden = configured;
    $("btn-google").hidden = !configured;
    $("mock-signin").hidden = !(!configured && local);
  }

  function renderMemberView() {
    showView("member");
    $("admin-tabs").hidden = true;
    $("brand-sub").textContent = "This week’s workout";

    const tw = resolveThisWeek();
    if (!tw) {
      $("member-empty").hidden = false;
      $("member-pick").hidden = true;
      return;
    }
    $("member-empty").hidden = true;
    $("member-pick").hidden = false;
    $("member-type").textContent = tw.folderType || "—";
    $("member-filename").textContent = tw.filename || "—";
    $("member-hr").textContent = tw.hr != null ? String(tw.hr) : "—";
    $("member-folder").textContent = tw.folderType || "—";
    $("member-when").textContent = tw.pickedAt
      ? formatPickedAt(tw.pickedAt)
      : "—";
    if (tw.why) {
      $("member-why").hidden = false;
      $("member-why").textContent = tw.why;
    } else {
      $("member-why").hidden = true;
    }

    const mine = window.EddysHellAuth.myCheckin(tw.id, authUser.email);
    if (mine) {
      $("btn-checkin").hidden = true;
      $("checkin-notes").disabled = true;
      $("checkin-notes").value = mine.notes || "";
      $("checkin-done").hidden = false;
      $("checkin-done-at").textContent = mine.at
        ? "· " + formatWhen(mine.at)
        : "";
      $("checkin-toast").hidden = true;
    } else {
      $("btn-checkin").hidden = false;
      $("checkin-notes").disabled = false;
      $("checkin-done").hidden = true;
    }
  }

  function renderAdminShell(preferredView) {
    $("admin-tabs").hidden = false;
    $("brand-sub").textContent = "Thursday workout admin";
    const view = preferredView || "rule";
    showView(view);
    if (view === "pick") {
      if (currentResult) {
        /* keep current dry-run */
      } else if (state.lastPick) {
        restoreLastPickIfAny();
      } else {
        const tw = resolveThisWeek();
        if (tw) {
          const f =
            catalog.files.find((x) => x.id === tw.id) || {
              id: tw.id,
              filename: tw.filename,
              folderType: tw.folderType,
              hr: tw.hr,
              relPath: tw.relPath,
              sizeBytes: tw.sizeBytes,
              mtime: tw.mtime,
              rawTags: tw.rawTags || [],
            };
          currentResult = {
            ok: true,
            pick: f,
            matches: Array(tw.matchCount || 1).fill(f),
            why: tw.why || "Published this week",
          };
          renderPickResult(currentResult);
        } else {
          showPickPanels({ empty: true, result: false, error: false });
        }
      }
      renderAdminCheckins();
    }
  }

  function applyRoleUI() {
    renderUserSlot();
    if (!authUser) {
      renderLanding();
      return;
    }
    if (authUser.role === "admin") {
      renderAdminShell("rule");
      return;
    }
    renderMemberView();
  }

  function renderChips() {
    const box = $("type-chips");
    box.innerHTML = "";
    const selected = new Set(state.rule.folderTypes || []);
    for (const t of availableTypes()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (selected.has(t) ? " on" : "");
      btn.textContent = t;
      btn.dataset.type = t;
      btn.setAttribute("aria-pressed", selected.has(t) ? "true" : "false");
      btn.addEventListener("click", () => {
        const next = new Set(state.rule.folderTypes || []);
        if (next.has(t)) next.delete(t);
        else next.add(t);
        state.rule.folderTypes = [...next];
        btn.classList.toggle("on", next.has(t));
        btn.setAttribute("aria-pressed", next.has(t) ? "true" : "false");
        updateMatchBadge();
      });
      box.appendChild(btn);
    }
  }

  function renderHistory() {
    const box = $("used-history");
    const hist = state.usedHistory || [];
    if (!hist.length) {
      box.innerHTML = '<p class="hint">No used history yet.</p>';
      return;
    }
    const byId = new Map(catalog.files.map((f) => [f.id, f]));
    const sorted = [...hist].sort(
      (a, b) => Date.parse(b.pickedAt) - Date.parse(a.pickedAt)
    );
    const ul = document.createElement("ul");
    for (const entry of sorted.slice(0, 20)) {
      const f = byId.get(entry.id);
      const name = f ? f.filename : entry.id;
      const li = document.createElement("li");
      li.textContent = `${formatPickedAt(entry.pickedAt)} · ${name}`;
      ul.appendChild(li);
    }
    box.innerHTML = "";
    box.appendChild(ul);
  }

  function readRuleFromForm() {
    const recencyEl = document.querySelector('input[name="recency"]:checked');
    return {
      folderTypes: [...(state.rule.folderTypes || [])],
      minHR: Number($("min-hr").value) || 0,
      requireHR: $("require-hr").checked,
      recency: recencyEl ? recencyEl.value : "recent",
      rotate: $("rotate").checked,
      rotateWeeks: Math.max(1, Number($("rotate-weeks").value) || 8),
      tagContains: ($("tag-contains").value || "").trim(),
    };
  }

  function writeRuleToForm(rule) {
    state.rule = { ...defaultRule(), ...rule };
    $("min-hr").value = state.rule.minHR;
    $("require-hr").checked = !!state.rule.requireHR;
    $("rotate").checked = !!state.rule.rotate;
    $("rotate-weeks").value = state.rule.rotateWeeks;
    $("tag-contains").value = state.rule.tagContains || "";
    for (const el of document.querySelectorAll('input[name="recency"]')) {
      el.checked = el.value === state.rule.recency;
    }
    renderChips();
    renderHistory();
    updateMatchBadge();
  }

  function updateMatchBadge() {
    const rule = readRuleFromForm();
    state.rule = rule;
    const n = matchCount(catalog.files, rule, state.usedHistory);
    $("match-badge").textContent = `${n} match${n === 1 ? "" : "es"}`;
  }

  function showPickPanels({ empty, result, error }) {
    $("pick-empty").hidden = !empty;
    $("pick-result").hidden = !result;
    $("pick-error").hidden = !error;
  }

  function renderPickResult(result) {
    const f = result.pick;
    $("pick-type").textContent = f.folderType || "—";
    $("pick-filename").textContent = f.filename || "—";
    $("pick-hr").textContent = f.hr != null ? String(f.hr) : "missing";
    $("pick-tags").textContent =
      f.rawTags && f.rawTags.length ? f.rawTags.join(", ") : "—";
    $("pick-path").textContent = f.relPath || "—";
    $("pick-size").textContent = formatBytes(f.sizeBytes);
    $("pick-mtime").textContent = formatMtime(f.mtime);
    $("pick-count").textContent = String(result.matches.length);
    $("pick-why").textContent = result.why;
    showPickPanels({ empty: false, result: true, error: false });
    $("accept-toast").hidden = true;
    const pending = localStorage.getItem(PENDING_PUBLISH_KEY) === "1";
    $("publish-hint").hidden = !pending;
  }

  function renderPickError(msg) {
    $("pick-error-msg").textContent = msg;
    showPickPanels({ empty: false, result: false, error: true });
  }

  function renderAdminCheckins() {
    const box = $("admin-checkins");
    const tw = resolveThisWeek();
    if (!tw) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const list = window.EddysHellAuth.checkinsForPick(tw.id);
    $("checkins-count").textContent = String(list.length);
    const ul = $("checkins-list");
    ul.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "hint";
      li.textContent = "No check-ins yet (stored in this browser).";
      ul.appendChild(li);
      return;
    }
    for (const c of list) {
      const li = document.createElement("li");
      const notes = c.notes ? ` — ${c.notes}` : "";
      li.innerHTML = `<strong>${escapeHtml(c.displayName || c.email)}</strong>
        <span class="mute">${escapeHtml(c.email)}</span>
        <span class="mute"> · ${escapeHtml(formatWhen(c.at))}</span>
        <span>${escapeHtml(notes)}</span>`;
      ul.appendChild(li);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function runDryRun() {
    const rule = readRuleFromForm();
    state.rule = rule;
    const result = pick(catalog.files, rule, state.usedHistory);
    currentResult = result.ok ? result : null;
    showView("pick");
    if (!result.ok) {
      renderPickError(result.error);
      renderAdminCheckins();
      return;
    }
    renderPickResult(result);
    renderAdminCheckins();
  }

  function pickAgain() {
    const rule = readRuleFromForm();
    state.rule = rule;
    const tempHist = [...(state.usedHistory || [])];
    if (currentResult && currentResult.pick) {
      tempHist.push({
        id: currentResult.pick.id,
        pickedAt: new Date().toISOString(),
      });
    }
    let result = pick(catalog.files, rule, tempHist);
    if (!result.ok) {
      result = pick(catalog.files, rule, state.usedHistory);
    }
    currentResult = result.ok ? result : null;
    if (!result.ok) {
      renderPickError(result.error);
      return;
    }
    renderPickResult(result);
  }

  function acceptPick() {
    if (!currentResult || !currentResult.pick) return;
    const f = currentResult.pick;
    const now = new Date().toISOString();
    state.lastPick = {
      id: f.id,
      filename: f.filename,
      folderType: f.folderType,
      hr: f.hr,
      relPath: f.relPath,
      sizeBytes: f.sizeBytes,
      mtime: f.mtime,
      rawTags: f.rawTags || [],
      pickedAt: now,
      why: currentResult.why,
      matchCount: currentResult.matches.length,
    };
    state.usedHistory = [
      ...(state.usedHistory || []),
      { id: f.id, pickedAt: now },
    ];
    saveState();

    const payload = {
      pickId: f.id,
      filename: f.filename,
      folderType: f.folderType,
      hr: f.hr,
      relPath: f.relPath,
      sizeBytes: f.sizeBytes,
      mtime: f.mtime,
      rawTags: f.rawTags || [],
      pickedAt: now,
      why: currentResult.why,
      matchCount: currentResult.matches.length,
    };
    // In-memory for this browser; members on Pages need the committed file
    thisWeekFile = payload;
    localStorage.setItem(PENDING_PUBLISH_KEY, "1");
    downloadThisWeekJson(payload);

    try {
      localStorage.setItem(
        "eddys-hell-this-week-broadcast-v1",
        JSON.stringify({ ...payload, _ts: Date.now() })
      );
    } catch (_) { /* ok */ }

    renderHistory();
    updateMatchBadge();
    const toast = $("accept-toast");
    toast.hidden = false;
    toast.textContent =
      "Accepted — downloaded this-week.json. Re-publish to share with the group.";
    $("publish-hint").hidden = false;
    setTimeout(() => {
      toast.hidden = true;
    }, 4000);
    renderAdminCheckins();
  }

  function restoreLastPickIfAny() {
    if (!state.lastPick) {
      showPickPanels({ empty: true, result: false, error: false });
      return;
    }
    const f = catalog.files.find((x) => x.id === state.lastPick.id);
    if (!f) {
      // Still show stored metadata
      currentResult = {
        ok: true,
        pick: {
          id: state.lastPick.id,
          filename: state.lastPick.filename,
          folderType: state.lastPick.folderType,
          hr: state.lastPick.hr,
          relPath: state.lastPick.relPath,
          sizeBytes: state.lastPick.sizeBytes,
          mtime: state.lastPick.mtime,
          rawTags: state.lastPick.rawTags || [],
        },
        matches: Array(state.lastPick.matchCount || 1).fill(null),
        why:
          state.lastPick.why ||
          `Stored last pick · accepted ${formatPickedAt(state.lastPick.pickedAt)}`,
      };
      renderPickResult(currentResult);
      return;
    }
    currentResult = {
      ok: true,
      pick: f,
      matches: Array(state.lastPick.matchCount || 1).fill(f),
      why:
        state.lastPick.why ||
        `Stored last pick · accepted ${formatPickedAt(state.lastPick.pickedAt)}`,
    };
    renderPickResult(currentResult);
  }

  function wireFormLive() {
    for (const id of ["min-hr", "require-hr", "rotate", "rotate-weeks", "tag-contains"]) {
      $(id).addEventListener("input", updateMatchBadge);
      $(id).addEventListener("change", updateMatchBadge);
    }
    for (const el of document.querySelectorAll('input[name="recency"]')) {
      el.addEventListener("change", updateMatchBadge);
    }
  }

  function wireAuthButtons() {
    $("btn-google").addEventListener("click", async () => {
      try {
        await window.EddysHellAuth.signInWithGoogle();
      } catch (err) {
        alert("Sign-in failed: " + (err.message || err));
      }
    });
    $("btn-mock-admin").addEventListener("click", () => {
      window.EddysHellAuth.mockSignIn("admin");
    });
    $("btn-mock-member").addEventListener("click", () => {
      window.EddysHellAuth.mockSignIn("member");
    });
    $("btn-signout").addEventListener("click", async () => {
      await window.EddysHellAuth.signOut();
    });
    $("btn-checkin").addEventListener("click", () => {
      const tw = resolveThisWeek();
      if (!tw || !authUser) return;
      window.EddysHellAuth.upsertCheckin({
        email: authUser.email,
        displayName: authUser.displayName,
        pickId: tw.id,
        notes: $("checkin-notes").value,
      });
      $("checkin-toast").hidden = false;
      setTimeout(() => {
        $("checkin-toast").hidden = true;
      }, 2500);
      renderMemberView();
    });
  }

  // ——— Boot ———

  async function boot() {
    loadState();

    try {
      const had = localStorage.getItem(STORAGE_KEY);
      if (!had) {
        const seedRes = await fetch("data/state.json");
        if (seedRes.ok) {
          const seed = await seedRes.json();
          if (seed.rule) state.rule = { ...defaultRule(), ...seed.rule };
          if (Array.isArray(seed.usedHistory)) state.usedHistory = seed.usedHistory;
          if (seed.lastPick) state.lastPick = seed.lastPick;
        }
      }
    } catch (_) { /* optional */ }

    try {
      const dr = await fetch("data/default-rule.json");
      if (dr.ok) {
        const def = await dr.json();
        state.rule = { ...def, ...state.rule };
        if (!localStorage.getItem(STORAGE_KEY)) {
          state.rule = { ...defaultRule(), ...def };
        }
      }
    } catch (_) { /* ok */ }

    try {
      const twRes = await fetch("data/this-week.json", { cache: "no-store" });
      if (twRes.ok) thisWeekFile = await twRes.json();
    } catch (_) {
      thisWeekFile = null;
    }

    const res = await fetch("data/catalog.json");
    if (!res.ok) throw new Error("Failed to load catalog.json");
    catalog = await res.json();

    const meta = catalog.meta || {};
    $("catalog-meta").textContent =
      `${meta.fileCount || catalog.files.length} videos · scanned ${meta.scannedAt || "—"}`;

    writeRuleToForm(state.rule);
    wireFormLive();
    wireAuthButtons();

    for (const tab of document.querySelectorAll(".tab")) {
      tab.addEventListener("click", () => {
        if (!authUser || authUser.role !== "admin") return;
        showView(tab.dataset.view);
        if (tab.dataset.view === "pick") {
          if (!currentResult && state.lastPick) restoreLastPickIfAny();
          else if (!currentResult && !state.lastPick) {
            const tw = resolveThisWeek();
            if (tw) restoreLastPickIfAny();
            else showPickPanels({ empty: true, result: false, error: false });
          }
          renderAdminCheckins();
        }
      });
    }

    $("btn-save").addEventListener("click", () => {
      state.rule = readRuleFromForm();
      saveState();
      const toast = $("save-toast");
      toast.hidden = false;
      setTimeout(() => {
        toast.hidden = true;
      }, 2000);
    });

    $("btn-dryrun").addEventListener("click", runDryRun);
    $("btn-again").addEventListener("click", pickAgain);
    $("btn-accept").addEventListener("click", acceptPick);
    $("btn-goto-rule").addEventListener("click", () => showView("rule"));
    $("btn-error-rule").addEventListener("click", () => showView("rule"));

    await window.EddysHellAuth.init();
    window.EddysHellAuth.onAuthChange((user) => {
      authUser = user;
      applyRoleUI();
    });

    window.EddysHell = {
      pick,
      matchCount,
      defaultRule,
      catalog,
      getState: () => state,
      resolveThisWeek,
    };
  }

  boot().catch((err) => {
    console.error(err);
    $("catalog-meta").textContent = "Failed to load: " + err.message;
  });
})();
