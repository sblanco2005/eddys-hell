/**
 * Eddy's Hell — Thursday workout admin
 * Storage key: eddys-hell-admin-v1
 */
(function () {
  "use strict";

  const STORAGE_KEY = "eddys-hell-admin-v1";
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
  /** @type {object|null} last dry-run result for accept/again */
  let currentResult = null;

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

  /**
   * @param {Array} files
   * @param {object} rule
   * @param {Array} usedHistory
   * @returns {{ ok: true, pick: object, matches: Array, why: string } | { ok: false, error: string, matchCount: number }}
   */
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

  // ——— UI ———

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

  function showView(name) {
    for (const tab of document.querySelectorAll(".tab")) {
      const on = tab.dataset.view === name;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    }
    $("view-rule").classList.toggle("active", name === "rule");
    $("view-rule").hidden = name !== "rule";
    $("view-pick").classList.toggle("active", name === "pick");
    $("view-pick").hidden = name !== "pick";
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
  }

  function renderPickError(msg) {
    $("pick-error-msg").textContent = msg;
    showPickPanels({ empty: false, result: false, error: true });
  }

  function runDryRun() {
    const rule = readRuleFromForm();
    state.rule = rule;
    const result = pick(catalog.files, rule, state.usedHistory);
    currentResult = result.ok ? result : null;
    showView("pick");
    if (!result.ok) {
      renderPickError(result.error);
      return;
    }
    renderPickResult(result);
  }

  function pickAgain() {
    const rule = readRuleFromForm();
    state.rule = rule;
    // Temporarily treat current pick as blocked so "again" prefers another
    const tempHist = [...(state.usedHistory || [])];
    if (currentResult && currentResult.pick) {
      tempHist.push({
        id: currentResult.pick.id,
        pickedAt: new Date().toISOString(),
      });
    }
    let result = pick(catalog.files, rule, tempHist);
    if (!result.ok) {
      // Fall back to normal pool if only one match
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
      pickedAt: now,
      why: currentResult.why,
      matchCount: currentResult.matches.length,
    };
    state.usedHistory = [
      ...(state.usedHistory || []),
      { id: f.id, pickedAt: now },
    ];
    saveState();
    renderHistory();
    updateMatchBadge();
    const toast = $("accept-toast");
    toast.hidden = false;
    setTimeout(() => {
      toast.hidden = true;
    }, 2500);
  }

  function restoreLastPickIfAny() {
    if (!state.lastPick) {
      showPickPanels({ empty: true, result: false, error: false });
      return;
    }
    const f = catalog.files.find((x) => x.id === state.lastPick.id);
    if (!f) {
      showPickPanels({ empty: true, result: false, error: false });
      return;
    }
    currentResult = {
      ok: true,
      pick: f,
      matches: [f],
      why:
        state.lastPick.why ||
        `Stored last pick · accepted ${formatPickedAt(state.lastPick.pickedAt)}`,
    };
    // Prefer stored matchCount in display
    const fake = {
      ...currentResult,
      matches: { length: state.lastPick.matchCount || 1 },
    };
    // render with real file but override count text after
    renderPickResult({
      pick: f,
      matches: Array(state.lastPick.matchCount || 1).fill(f),
      why: currentResult.why,
    });
    void fake;
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

  // ——— Boot ———

  async function boot() {
    loadState();

    // Optional seed from data/state.json if localStorage empty and no prior rule save
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

    // Prefer packaged default-rule if present and still on defaults
    try {
      const dr = await fetch("data/default-rule.json");
      if (dr.ok) {
        const def = await dr.json();
        // Only fill if rule somehow missing fields
        state.rule = { ...def, ...state.rule };
        // If brand new (no storage), use default-rule as-is
        if (!localStorage.getItem(STORAGE_KEY)) {
          state.rule = { ...defaultRule(), ...def };
        }
      }
    } catch (_) { /* ok */ }

    const res = await fetch("data/catalog.json");
    if (!res.ok) throw new Error("Failed to load catalog.json");
    catalog = await res.json();

    const meta = catalog.meta || {};
    $("catalog-meta").textContent =
      `${meta.fileCount || catalog.files.length} videos · scanned ${meta.scannedAt || "—"}`;

    writeRuleToForm(state.rule);
    wireFormLive();

    // Tabs
    for (const tab of document.querySelectorAll(".tab")) {
      tab.addEventListener("click", () => {
        showView(tab.dataset.view);
        if (tab.dataset.view === "pick" && !currentResult && state.lastPick) {
          restoreLastPickIfAny();
        } else if (tab.dataset.view === "pick" && !currentResult && !state.lastPick) {
          showPickPanels({ empty: true, result: false, error: false });
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

    // Expose for console / dry-run scripts
    window.EddysHell = { pick, matchCount, defaultRule, catalog, getState: () => state };
  }

  boot().catch((err) => {
    console.error(err);
    $("catalog-meta").textContent = "Failed to load catalog: " + err.message;
  });
})();
