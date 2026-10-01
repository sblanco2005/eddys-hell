/**
 * Eddy's Hell — Thursday workout (admin + member)
 * Storage: eddys-hell-admin-v2, eddys-hell-checkins-v1, eddys-hell-members-v1, eddys-hell-pt-v1
 */
(function () {
  "use strict";

  /** Bumped v2→v3 so stale Full-only / HR140 / rotate 2w rules don't override default-rule.json */
  const STORAGE_KEY = "eddys-hell-admin-v2";
  const RULE_VERSION = 3;
  const PENDING_PUBLISH_KEY = "eddys-hell-pending-publish-v1";
  const STAGED_NEXT_KEY = "eddys-hell-next-week-v1";
  /** Mac archive volume for Reveal in Finder (https cannot open Finder). Easy to change. */
  const ARCHIVE_ROOT = "/Volumes/EddysHell/";
  const MEMBERS_PENDING_KEY = "eddys-hell-members-pending-v1";
  const PT_KEY = "eddys-hell-pt-v1";
  const PT_PENDING_KEY = "eddys-hell-pt-pending-v1";
  /** Pending default-rule / state.rule sync for Wednesday routine */
  const RULE_PENDING_KEY = "eddys-hell-rule-pending-v1";
  /** @type {string[]} draft emails in Members UI */
  let membersDraft = [];
  /** @type {{ email: string, updatedAt: string|null }} PT summary destination */
  let ptSummary = { email: "", updatedAt: null };
  const EXCLUDE_TYPES = new Set(["OutsideRoot"]);
  const POOL_SIZE = 20;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const TYPE_ORDER = [
    "Full", "Upper", "Lower", "Push", "Pull",
    "HIIT", "Kettlebell", "Circuit", "CrossFit",
    "Week1", "Week2",
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
  /** @type {object|null} staged next-week (not live) */
  let nextWeekFile = null;
  /** Dry-run candidate not yet set as this week */
  let pickIsCandidate = false;
  /** @type {object|null} auth user with role */
  let authUser = null;

  // ——— Persistence ———

  function defaultRule() {
    return {
      version: RULE_VERSION,
      folderTypes: ["Full", "Upper", "Pull", "CrossFit"],
      minHR: 120,
      requireHR: true,
      autoPick: true,
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

  /**
   * Live pick: Firestore (in thisWeekFile after cloud hydrate) → repo JSON → localStorage.
   * thisWeekFile is overwritten by loadCloudConfig when cloud doc is present/newer.
   */
  function resolveThisWeek() {
    // Prefer in-memory live file (Firestore hydrate or Hosting bootstrap).
    // Never treat a no-video doc as live — that is staged (config/nextWeek).
    if (thisWeekFile && (thisWeekFile.pickId || thisWeekFile.id) && thisWeekFile.youtubeId) {
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
        youtubeId: thisWeekFile.youtubeId,
        youtubeUrl: thisWeekFile.youtubeUrl || null,
        archiveRoot: thisWeekFile.archiveRoot || ARCHIVE_ROOT,
        updatedAt: thisWeekFile.updatedAt || null,
        source: thisWeekFile._source || "file",
      };
    }
    // lastPick only counts as live when it already has youtubeId (promoted).
    if (state.lastPick && state.lastPick.youtubeId) {
      return {
        ...state.lastPick,
        youtubeId: state.lastPick.youtubeId,
        youtubeUrl: state.lastPick.youtubeUrl || null,
        source: "local",
      };
    }
    return null;
  }

  /** Extract an 11-char YouTube video id from a URL or bare id. */
  function parseYoutubeId(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, "");
      if (host === "youtu.be") {
        const id = u.pathname.split("/").filter(Boolean)[0];
        return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
      }
      if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
        const v = u.searchParams.get("v");
        if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
        const parts = u.pathname.split("/").filter(Boolean);
        const emb = parts.indexOf("embed");
        if (emb >= 0 && parts[emb + 1] && /^[A-Za-z0-9_-]{11}$/.test(parts[emb + 1])) {
          return parts[emb + 1];
        }
        const sh = parts.indexOf("shorts");
        if (sh >= 0 && parts[sh + 1] && /^[A-Za-z0-9_-]{11}$/.test(parts[sh + 1])) {
          return parts[sh + 1];
        }
        const live = parts.indexOf("live");
        if (live >= 0 && parts[live + 1] && /^[A-Za-z0-9_-]{11}$/.test(parts[live + 1])) {
          return parts[live + 1];
        }
      }
    } catch (_) {
      /* not a URL */
    }
    const m = raw.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function youtubeWatchUrl(id) {
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  }

  function youtubeEmbedUrl(id) {
    return id
      ? `https://www.youtube-nocookie.com/embed/${id}?rel=0`
      : null;
  }

  function fillYtEmbed(wrapEl, id) {
    wrapEl.innerHTML = "";
    if (!id) return;
    const iframe = document.createElement("iframe");
    iframe.src = youtubeEmbedUrl(id);
    iframe.title = "This week’s workout video";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    wrapEl.appendChild(iframe);
  }

  function renderYoutubeForMember(tw) {
    const embed = $("member-yt-embed");
    const pending = $("member-yt-pending");
    const id = tw && tw.youtubeId;
    if (id) {
      fillYtEmbed(embed, id);
      embed.hidden = false;
      pending.hidden = true;
    } else {
      embed.innerHTML = "";
      embed.hidden = true;
      pending.hidden = false;
    }
  }

  function renderYoutubeAdminControls() {
    const tw = resolveThisWeek();
    const embed = $("admin-yt-embed");
    const pending = $("admin-yt-pending");
    const badge = $("yt-status-badge");
    const id = tw && tw.youtubeId;
    if (id) {
      fillYtEmbed(embed, id);
      embed.hidden = false;
      pending.hidden = true;
      badge.textContent = "Published";
    } else {
      embed.innerHTML = "";
      embed.hidden = true;
      pending.hidden = false;
      badge.textContent = "Not set";
    }
    updatePublishPendingHint();
  }

  function updatePublishPendingHint() {
    const el = $("publish-pending");
    if (!el) return;
    // Only show transient failure / status messages; success uses accept-toast.
    if (el.dataset.liveStatus === "1") return;
    el.hidden = localStorage.getItem(PENDING_PUBLISH_KEY) !== "1";
    if (!el.hidden && !el.textContent.trim()) {
      el.textContent = "Publish not synced yet — tap Publish this week.";
    }
  }

  function setPublishStatus(msg, { error = false, sticky = false } = {}) {
    const el = $("publish-pending");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.dataset.liveStatus = "";
      el.textContent = "";
      updatePublishPendingHint();
      return;
    }
    el.dataset.liveStatus = "1";
    el.hidden = false;
    el.textContent = msg;
    el.style.color = error ? "" : "";
    if (!sticky) {
      setTimeout(() => {
        if (el.dataset.liveStatus === "1" && el.textContent === msg) {
          el.dataset.liveStatus = "";
          el.hidden = true;
          updatePublishPendingHint();
        }
      }, error ? 8000 : 4500);
    }
  }

  function tsOfThisWeek(obj) {
    if (!obj) return 0;
    const candidates = [obj.updatedAt, obj.pickedAt, obj._ts];
    let best = 0;
    for (const c of candidates) {
      const t = Date.parse(c || 0) || 0;
      if (t > best) best = t;
    }
    return best;
  }

  function samePublishedPick(a, b) {
    if (!a || !b) return false;
    const aId = a.pickId || a.id || "";
    const bId = b.pickId || b.id || "";
    if (aId && bId && aId === bId) return true;
    if (a.relPath && b.relPath && String(a.relPath) === String(b.relPath)) return true;
    if (a.filename && b.filename && String(a.filename) === String(b.filename)) return true;
    return false;
  }

  function applyCloudThisWeek(cloud) {
    if (!cloud || !(cloud.pickId || cloud.id)) return false;
    // LIVE thisWeek must always carry youtubeId. A staged/no-video write that
    // landed in config/thisWeek (bug or stale tab) must NEVER replace a good
    // live week or clear the member/admin This week card.
    if (!cloud.youtubeId) {
      if (thisWeekFile && thisWeekFile.youtubeId) {
        console.warn(
          "Ignoring cloud thisWeek without youtubeId — keeping live video week",
          cloud.pickId || cloud.id,
          cloud.filename
        );
        return false;
      }
      console.warn(
        "Ignoring cloud thisWeek without youtubeId (not live)",
        cloud.pickId || cloud.id,
        cloud.filename
      );
      return false;
    }
    const cloudTs = tsOfThisWeek(cloud);
    const localTs = tsOfThisWeek(thisWeekFile);
    // Prefer cloud when present and >= repo/local published stamp
    if (!thisWeekFile || cloudTs >= localTs || !localTs) {
      const merged = { ...cloud, _source: "cloud" };
      thisWeekFile = merged;
      // Keep lastPick aligned with LIVE so Rule candidate restore cannot
      // resurface a staged/no-video pick as if it were this week.
      try {
        state.lastPick = {
          id: merged.pickId || merged.id,
          filename: merged.filename,
          folderType: merged.folderType,
          hr: merged.hr,
          relPath: merged.relPath,
          sizeBytes: merged.sizeBytes,
          mtime: merged.mtime,
          rawTags: merged.rawTags || [],
          pickedAt: merged.pickedAt,
          why: merged.why,
          matchCount: merged.matchCount,
          youtubeId: merged.youtubeId,
          youtubeUrl:
            merged.youtubeUrl ||
            ("https://www.youtube.com/watch?v=" + merged.youtubeId),
        };
        saveState();
      } catch (_) { /* ok */ }
      return true;
    }
    return false;
  }

  function applyCloudRule(cloudRule) {
    if (!cloudRule || typeof cloudRule !== "object") return false;
    const next = {
      ...defaultRule(),
      ...cloudRule,
    };
    // Drop Firestore metadata from rule object used by picker
    delete next.updatedAt;
    delete next.updatedBy;
    state.rule = next;
    saveState();
    try {
      localStorage.removeItem(RULE_PENDING_KEY);
    } catch (_) { /* ok */ }
    writeRuleToForm(state.rule);
    updateMatchBadge();
    return true;
  }

  async function loadCloudConfig() {
    const Auth = window.EddysHellAuth;
    if (!Auth || !Auth.isFirestoreReady || !Auth.isFirestoreReady()) return;
    let changed = false;
    try {
      const cloudTw = await Auth.loadThisWeekFromCloud();
      if (cloudTw && applyCloudThisWeek(cloudTw)) changed = true;
    } catch (err) {
      console.warn("loadThisWeekFromCloud:", err);
    }
    try {
      if (Auth.loadNextWeekFromCloud) {
        const cloudNw = await Auth.loadNextWeekFromCloud();
        if (cloudNw && (cloudNw.pickId || cloudNw.id)) {
          nextWeekFile = { ...cloudNw, _source: "cloud" };
          try {
            localStorage.setItem(STAGED_NEXT_KEY, JSON.stringify(cloudNw));
          } catch (_) { /* ok */ }
          updateStagedHint();
        }
      }
    } catch (err) {
      console.warn("loadNextWeekFromCloud:", err);
    }
    try {
      const cloudRule = await Auth.loadRuleFromCloud();
      if (cloudRule && applyCloudRule(cloudRule)) changed = true;
    } catch (err) {
      console.warn("loadRuleFromCloud:", err);
    }
    if (changed) {
      ensurePickViewFromPublished();
      renderYoutubeAdminControls();
      const tw = resolveThisWeek();
      if (tw && authUser) {
        renderSharedCheckins(tw);
        const memberView = $("view-member");
        if (memberView && !memberView.hidden) {
          renderMemberView({ asAdmin: authUser.role === "admin" });
        }
      }
    }
    updateStagedHint();
  }

  function payloadFromThisWeek(tw) {
    if (!tw) return null;
    return {
      pickId: tw.id || tw.pickId,
      filename: tw.filename,
      folderType: tw.folderType,
      hr: tw.hr,
      relPath: tw.relPath,
      sizeBytes: tw.sizeBytes,
      mtime: tw.mtime,
      rawTags: tw.rawTags || [],
      pickedAt: tw.pickedAt || new Date().toISOString(),
      why: tw.why || "",
      matchCount: tw.matchCount ?? null,
      youtubeId: tw.youtubeId || null,
      youtubeUrl: tw.youtubeUrl || null,
      archiveRoot: tw.archiveRoot || ARCHIVE_ROOT,
    };
  }


  const YT_REQUIRED_TOAST =
    "Upload YouTube first — won't replace this week without a video.";
  const STAGED_TOAST =
    "Staged — live week stays until YouTube upload.";

  function showAcceptToast(msg, { ms = 5000, error = false } = {}) {
    const toast = $("accept-toast");
    if (toast) {
      toast.hidden = false;
      toast.textContent = msg;
      setTimeout(() => {
        toast.hidden = true;
      }, ms);
    }
    if (error) {
      setPublishStatus(msg, { error: true, sticky: true });
    } else {
      setPublishStatus(msg, { sticky: true });
    }
  }

  function showYtRequiredToast() {
    showAcceptToast(YT_REQUIRED_TOAST, { error: true });
  }

  function showStagedToast() {
    showAcceptToast(STAGED_TOAST, { ms: 6000 });
  }

  function isYoutubeRequiredError(err) {
    return !!(
      err &&
      (err.code === "youtube-required" ||
        (err.message &&
          String(err.message).indexOf("Upload YouTube first") !== -1))
    );
  }

  function persistStagedLocal(payload) {
    nextWeekFile = payload ? { ...payload, _source: payload._source || "local" } : null;
    try {
      if (payload) {
        localStorage.setItem(STAGED_NEXT_KEY, JSON.stringify(payload));
      } else {
        localStorage.removeItem(STAGED_NEXT_KEY);
      }
    } catch (_) { /* ok */ }
  }

  function loadStagedLocal() {
    try {
      const raw = localStorage.getItem(STAGED_NEXT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && (parsed.pickId || parsed.id) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function resolveStagedNext() {
    if (nextWeekFile && (nextWeekFile.pickId || nextWeekFile.id)) {
      const id = nextWeekFile.pickId || nextWeekFile.id;
      return {
        id,
        pickId: id,
        filename: nextWeekFile.filename,
        folderType: nextWeekFile.folderType,
        hr: nextWeekFile.hr,
        relPath: nextWeekFile.relPath,
        sizeBytes: nextWeekFile.sizeBytes,
        mtime: nextWeekFile.mtime,
        rawTags: nextWeekFile.rawTags || [],
        pickedAt: nextWeekFile.pickedAt,
        why: nextWeekFile.why,
        matchCount: nextWeekFile.matchCount,
        youtubeId: nextWeekFile.youtubeId || null,
        youtubeUrl: nextWeekFile.youtubeUrl || null,
        archiveRoot: nextWeekFile.archiveRoot || ARCHIVE_ROOT,
        status: nextWeekFile.status || "staged",
        source: nextWeekFile._source || "local",
      };
    }
    return null;
  }

  function updateStagedHint() {
    const el = $("staged-next-hint");
    const card = $("staged-next-card");
    const nameEl = $("staged-next-name");
    const metaEl = $("staged-next-meta");
    const staged = resolveStagedNext();
    if (!staged) {
      if (el) {
        el.hidden = true;
        el.textContent = "";
      }
      if (card) card.hidden = true;
      if (nameEl) nameEl.textContent = "—";
      if (metaEl) metaEl.textContent = "";
      updateYoutubeStageControls();
      return;
    }
    const name = staged.filename || staged.pickId || "pick";
    const bits = [];
    if (staged.folderType) bits.push(staged.folderType);
    if (staged.hr != null) bits.push("HR " + staged.hr);
    if (staged.youtubeId) bits.push("YouTube " + staged.youtubeId);
    else bits.push("no YouTube yet");
    bits.push("not live — friends still see This week");
    if (el) {
      el.hidden = false;
      el.textContent = staged.youtubeId
        ? "Staged next: " +
          name +
          " — YouTube saved. Live week unchanged until Swap live now or the scheduler."
        : "Staged next: " +
          name +
          " — live week unchanged. Stage YouTube does not publish.";
    }
    if (card) card.hidden = false;
    if (nameEl) nameEl.textContent = name;
    if (metaEl) metaEl.textContent = bits.join(" · ");
    updateYoutubeStageControls();
  }

  /** Live Candidate pick card — read-only thisWeek with youtubeId. No dry-run/reveal. */
  function renderLiveWeekCard() {
    const empty = $("live-week-empty");
    const body = $("live-week-body");
    const tw = resolveThisWeek();
    if (!tw) {
      if (empty) empty.hidden = false;
      if (body) body.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (body) body.hidden = false;
    const set = (id, val) => {
      const el = $(id);
      if (el) el.textContent = val;
    };
    set("live-week-filename", tw.filename || "—");
    set("live-week-hr", tw.hr != null ? String(tw.hr) : "—");
    set("live-week-type", tw.folderType || "—");
    set(
      "live-week-yt",
      tw.youtubeId
        ? tw.youtubeId
        : "—"
    );
    set("live-week-path", tw.relPath || "—");
    const why = $("live-week-why");
    if (why) {
      if (tw.why) {
        why.hidden = false;
        why.textContent = tw.why;
      } else {
        why.hidden = true;
        why.textContent = "";
      }
    }
  }

  /** One Non-live button: Dry-run pick / Pick again are the same control. */
  function updateDryRunButtonLabel() {
    const btn = $("btn-dryrun");
    if (!btn) return;
    const hasCandidate = !!(currentResult && pickIsCandidate && currentResult.pick);
    const hasStaged = !!resolveStagedNext();
    btn.textContent = hasCandidate || hasStaged ? "Pick again" : "Dry-run pick";
  }

  function runDryRunOrAgain() {
    if (currentResult && pickIsCandidate && currentResult.pick) {
      pickAgain();
    } else {
      runDryRun();
    }
    updateDryRunButtonLabel();
  }

  async function stagePayloadToCloud(payload) {
    const Auth = window.EddysHellAuth;
    if (!Auth || !Auth.stageNextWeek) {
      throw new Error("Auth stageNextWeek API missing");
    }
    const saved = await Auth.stageNextWeek(payload);
    persistStagedLocal({ ...saved, _source: "cloud" });
    updateStagedHint();
    return saved;
  }

  function hasDryRunCandidate() {
    return !!(
      currentResult &&
      pickIsCandidate &&
      currentResult.pick &&
      (currentResult.pick.id || currentResult.pick.pickId)
    );
  }

  /** Enable Stage YouTube when a staged pick or dry-run candidate exists.
   *  Swap live now only when staged nextWeek already has a youtubeId. */
  function updateYoutubeStageControls() {
    const btnStage = $("btn-stage-youtube");
    const btnSwap = $("btn-swap-live");
    const staged = resolveStagedNext();
    const canStage = !!(staged || hasDryRunCandidate());
    if (btnStage && btnStage.dataset.busy !== "1") {
      btnStage.disabled = !canStage;
      btnStage.textContent = "Stage YouTube";
    }
    if (btnSwap && btnSwap.dataset.busy !== "1") {
      btnSwap.disabled = !(staged && staged.youtubeId);
      btnSwap.textContent = "Swap live now";
    }
  }

  function payloadFromCandidateFile(f, why, matchCount) {
    return {
      pickId: f.id || f.pickId,
      filename: f.filename,
      folderType: f.folderType,
      hr: f.hr,
      relPath: f.relPath,
      sizeBytes: f.sizeBytes,
      mtime: f.mtime,
      rawTags: f.rawTags || [],
      pickedAt: f.pickedAt || new Date().toISOString(),
      why: why || f.why || "",
      matchCount:
        matchCount != null ? matchCount : f.matchCount != null ? f.matchCount : null,
      archiveRoot: f.archiveRoot || ARCHIVE_ROOT,
    };
  }

  /** Staged next week if present, otherwise the current dry-run candidate. */
  function payloadForYoutubeStage() {
    const staged = resolveStagedNext();
    if (staged && (staged.pickId || staged.id)) {
      return payloadFromThisWeek(staged);
    }
    if (hasDryRunCandidate()) {
      const f = currentResult.pick;
      const n =
        currentResult.matches && currentResult.matches.length
          ? currentResult.matches.length
          : null;
      return payloadFromCandidateFile(f, currentResult.why, n);
    }
    return null;
  }

  /**
   * Paste a YouTube URL/id onto staged next week only.
   * Does not publish or promote — live config/thisWeek stays untouched.
   * If nothing is staged yet, stages the dry-run candidate WITH the youtubeId
   * in one stageNextWeek call.
   */
  async function saveYoutubeToStaged() {
    const input = $("yt-url-input");
    const raw = input ? input.value : "";
    const id = parseYoutubeId(raw);
    if (!id) {
      showAcceptToast("Paste a valid YouTube URL or 11-character video id.", {
        error: true,
        ms: 8000,
      });
      return;
    }
    const base = payloadForYoutubeStage();
    if (!base || !(base.pickId || base.id)) {
      showAcceptToast(
        "Dry-run or stage a next-week pick before attaching YouTube.",
        { error: true, ms: 8000 }
      );
      return;
    }
    const hadStaged = !!resolveStagedNext();
    const payload = {
      ...base,
      pickId: base.pickId || base.id,
      youtubeId: id,
      youtubeUrl: youtubeWatchUrl(id),
    };
    const btn = $("btn-stage-youtube");
    if (btn) {
      btn.dataset.busy = "1";
      btn.disabled = true;
      btn.textContent = "Staging…";
    }
    try {
      await stagePayloadToCloud(payload);
      if (!hadStaged && currentResult && currentResult.pick) {
        const f = currentResult.pick;
        state.usedHistory = [
          ...(state.usedHistory || []),
          { id: f.id, pickedAt: payload.pickedAt || new Date().toISOString() },
        ];
        saveState();
        renderHistory();
      }
      if (input) input.value = "";
      showAcceptToast("YouTube staged — live week unchanged.", { ms: 6000 });
      renderLiveWeekCard();
      updatePickActions();
    } catch (err) {
      console.warn("stage YouTube failed:", err);
      showAcceptToast(
        "Stage YouTube failed: " + ((err && err.message) || String(err)),
        { error: true, ms: 8000 }
      );
    } finally {
      if (btn) btn.dataset.busy = "";
      updateYoutubeStageControls();
    }
  }

  /**
   * Replace live this week with the already-staged pick + its youtubeId.
   * Does not upload or read the paste field.
   */
  async function swapStagedToLiveNow() {
    const staged = resolveStagedNext();
    if (!staged || !staged.youtubeId) {
      showAcceptToast(
        "Stage a YouTube id on next week before swapping live.",
        { error: true, ms: 8000 }
      );
      return;
    }
    const Auth = window.EddysHellAuth;
    if (!Auth || !Auth.promoteStagedToLive) {
      showAcceptToast("Auth promoteStagedToLive API missing", {
        error: true,
        ms: 8000,
      });
      return;
    }
    const btn = $("btn-swap-live");
    if (btn) {
      btn.dataset.busy = "1";
      btn.disabled = true;
      btn.textContent = "Swapping…";
    }
    try {
      const live = await Auth.promoteStagedToLive(
        staged.youtubeId,
        staged.youtubeUrl || youtubeWatchUrl(staged.youtubeId)
      );
      thisWeekFile = { ...live, _source: "cloud" };
      persistStagedLocal(null);
      // Promoted pick is live now — don't leave it sitting as the next-week dry-run.
      currentResult = null;
      pickIsCandidate = false;
      renderLiveWeekCard();
      renderYoutubeAdminControls();
      updatePickActions();
      updateStagedHint();
      ensurePickViewFromPublished();
      const memberView = $("view-member");
      if (memberView && !memberView.hidden && authUser) {
        renderMemberView({ asAdmin: authUser.role === "admin" });
      }
      renderSharedCheckins(resolveThisWeek());
      showAcceptToast("Live week swapped.", { ms: 5000 });
    } catch (err) {
      console.warn("swap live failed:", err);
      showAcceptToast(
        "Swap failed: " + ((err && err.message) || String(err)),
        { error: true, ms: 8000 }
      );
    } finally {
      if (btn) btn.dataset.busy = "";
      updateYoutubeStageControls();
    }
  }

  async function publishPayloadToCloud(payload) {
    const Auth = window.EddysHellAuth;
    if (!Auth || !Auth.publishThisWeek) {
      throw new Error("Auth publish API missing");
    }
    const saved = await Auth.publishThisWeek(payload);
    thisWeekFile = { ...saved, _source: "cloud" };
    try {
      localStorage.removeItem(PENDING_PUBLISH_KEY);
    } catch (_) { /* ok */ }
    try {
      localStorage.setItem(
        "eddys-hell-this-week-broadcast-v1",
        JSON.stringify({ ...saved, _ts: Date.now() })
      );
    } catch (_) { /* ok */ }
    return saved;
  }

  function getRevealRelPath() {
    const fromPick =
      (currentResult && currentResult.pick && currentResult.pick.relPath) ||
      "";
    if (fromPick) return String(fromPick);
    const staged = resolveStagedNext();
    if (staged && staged.relPath) return String(staged.relPath);
    const pathEl = $("pick-path");
    const t = pathEl && pathEl.textContent ? pathEl.textContent.trim() : "";
    if (t && t !== "—") return t;
    return "";
  }

  function updateRevealFinderButton() {
    const btnReveal = $("btn-reveal-finder");
    const row = $("path-reveal-row");
    const pathDisplay = $("reveal-path-display");
    const rel = getRevealRelPath();
    const show = !!rel;
    if (btnReveal) {
      btnReveal.hidden = !show;
      btnReveal.textContent = "Reveal in Finder";
      btnReveal.setAttribute("aria-label", "Reveal in Finder");
    }
    if (row) row.hidden = !show;
    if (pathDisplay) {
      if (show) {
        const abs = absoluteMacPath(rel);
        pathDisplay.hidden = false;
        pathDisplay.value = abs;
        pathDisplay.title = abs;
      } else {
        pathDisplay.hidden = true;
        pathDisplay.value = "";
      }
    }
  }

  function updatePickActions() {
    const btnAccept = $("btn-accept");
    const btnKeep = $("btn-keep");
    // Non-live section only: Stage / same-pick Publish. Live card is read-only.
    if (btnAccept) {
      if (pickIsCandidate) {
        btnAccept.hidden = false;
        const f = currentResult && currentResult.pick;
        const prev = resolveThisWeek();
        const sameAsPrev =
          f &&
          prev &&
          (prev.id === f.id ||
            (prev.relPath && f.relPath && prev.relPath === f.relPath) ||
            (prev.filename && f.filename && prev.filename === f.filename));
        const hasYt = !!(sameAsPrev && prev && prev.youtubeId);
        btnAccept.textContent = hasYt ? "Publish this week" : "Stage next week";
        if (btnKeep) btnKeep.hidden = true;
      } else {
        btnAccept.hidden = true;
        // Re-publish lives on This week's pick tab / YouTube promote — not on Non-live empty.
        if (btnKeep) btnKeep.hidden = true;
      }
    }
    updateRevealFinderButton();
    updatePublishPendingHint();
    updateStagedHint();
    updateYoutubeStageControls();
    updateDryRunButtonLabel();
    renderLiveWeekCard();
  }

  function absoluteMacPath(relPath) {
    const root = ARCHIVE_ROOT.endsWith("/")
      ? ARCHIVE_ROOT
      : ARCHIVE_ROOT + "/";
    const rel = String(relPath || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    return root + rel;
  }

  function copyTextFallback(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.width = "1px";
      ta.style.height = "1px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  async function copyPathToClipboard(abs) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(abs);
        return true;
      } catch (_) {
        /* fall through */
      }
    }
    return copyTextFallback(abs);
  }

  function showRevealPathUi(abs, copied) {
    const pathDisplay = $("reveal-path-display");
    if (pathDisplay) {
      pathDisplay.hidden = false;
      pathDisplay.value = abs;
      pathDisplay.title = abs;
      try {
        pathDisplay.focus();
        pathDisplay.select();
      } catch (_) {
        /* ignore */
      }
    }
    const toast = $("accept-toast");
    if (toast) {
      toast.hidden = false;
      toast.textContent = copied
        ? "Path copied — Finder → Go → Go to Folder (⇧⌘G), then paste:\n" + abs
        : "Copy may have failed — select & copy this path (⇧⌘G in Finder):\n" + abs;
      // Keep visible longer so Safari users can read/select the path from toast
      clearTimeout(showRevealPathUi._hideToast);
      showRevealPathUi._hideToast = setTimeout(() => {
        toast.hidden = true;
      }, 12000);
    }
    // Always offer a selectable prompt so clipboard failures are never silent
    try {
      window.prompt(
        copied
          ? "Path copied to clipboard. If paste fails, copy from here — then Finder → Go → Go to Folder (⇧⌘G):"
          : "Clipboard unavailable. Select All / Copy this path — then Finder → Go → Go to Folder (⇧⌘G):",
        abs
      );
    } catch (_) {
      /* ignore */
    }
  }

  async function revealInFinder() {
    const rel = getRevealRelPath();
    if (!rel) {
      const toast = $("accept-toast");
      if (toast) {
        toast.hidden = false;
        toast.textContent = "No file path available yet — dry-run or load this week first.";
        setTimeout(() => {
          toast.hidden = true;
        }, 4000);
      }
      return;
    }
    const abs = absoluteMacPath(rel);
    const copied = await copyPathToClipboard(abs);
    showRevealPathUi(abs, copied);
  }

  function parsePTPayload(data) {
    return {
      email: String(data && data.email || "").trim().toLowerCase(),
      updatedAt: (data && data.updatedAt) || null,
    };
  }

  async function loadPTSummary() {
    let fileParsed = { email: "", updatedAt: null };
    try {
      const res = await fetch("data/pt.json", { cache: "no-store" });
      if (res.ok) fileParsed = parsePTPayload(await res.json());
    } catch (_) {
      /* optional */
    }

    let localParsed = null;
    try {
      const raw = localStorage.getItem(PT_KEY);
      if (raw) localParsed = parsePTPayload(JSON.parse(raw));
    } catch (_) {
      localParsed = null;
    }

    if (localParsed && localParsed.updatedAt) {
      const localTs = Date.parse(localParsed.updatedAt);
      const fileTs = fileParsed.updatedAt ? Date.parse(fileParsed.updatedAt) : 0;
      if (Number.isFinite(localTs) && localTs > (Number.isFinite(fileTs) ? fileTs : 0)) {
        ptSummary = localParsed;
        return ptSummary;
      }
    }
    ptSummary = fileParsed;
    return ptSummary;
  }

  function savePTSummary() {
    const input = $("pt-email-input");
    const email = String(input.value || "").trim().toLowerCase();
    if (!email || !input.checkValidity()) {
      alert("Enter a valid PT summary email address.");
      return;
    }
    const payload = {
      email,
      updatedAt: new Date().toISOString(),
    };
    ptSummary = payload;
    localStorage.setItem(PT_KEY, JSON.stringify(payload));
    localStorage.setItem(PT_PENDING_KEY, "1");
    renderPTUI();
    const toast = $("pt-toast");
    toast.hidden = false;
    toast.textContent = "PT email saved — Publish pending. Grok Bot will sync.";
    $("pt-publish-hint").hidden = false;
    setTimeout(() => {
      toast.hidden = true;
    }, 3500);
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
    if (!el) return;
    el.hidden = false;
    el.classList.add("active");

    // Admin tabs: rule = Rule; pick = This week (member experience)
    if (name === "rule" || name === "pick" || name === "member") {
      const tabName = name === "member" ? "pick" : name;
      for (const tab of document.querySelectorAll(".tab")) {
        const on = tab.dataset.view === tabName;
        tab.classList.toggle("active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
      }
    }
  }

  /** Body auth classes + hidden attrs — guest chrome must never leak over landing. */
  function syncAuthBodyClass() {
    const body = document.body;
    if (!body) return;
    const signedIn = !!authUser;
    const isAdmin = !!(authUser && authUser.role === "admin");
    body.classList.toggle("is-guest", !signedIn);
    body.classList.toggle("is-signed-in", signedIn);
    body.classList.toggle("is-admin", isAdmin);
  }

  function forceGuestChrome() {
    syncAuthBodyClass();
    const tabs = $("admin-tabs");
    const slot = $("user-slot");
    if (tabs) tabs.hidden = true;
    if (slot) slot.hidden = true;
    // Admin views must not stay reachable alongside the sign-in card
    for (const id of ["view-rule", "view-pick"]) {
      const el = $(id);
      if (!el) continue;
      el.hidden = true;
      el.classList.remove("active");
    }
  }

  function renderUserSlot() {
    const slot = $("user-slot");
    if (!slot) return;
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
    // Belt-and-suspenders: body.is-guest + [hidden] — never leave admin chrome over landing
    forceGuestChrome();
    $("brand-sub").textContent = "Thursday workout";

    const tw = resolveThisWeek();
    $("locked-title").textContent = tw
      ? `This week: ${tw.filename || "workout"} (sign in to unlock)`
      : "Workout locked until you sign in.";

    const Auth = window.EddysHellAuth;
    const configured = Auth.isConfigured();
    const local = Auth.isLocalhost();
    const inApp = Auth.isInAppBrowser && Auth.isInAppBrowser();

    $("auth-not-configured").hidden = configured;

    const mirrorBanner = $("host-mirror-banner");
    if (mirrorBanner) {
      const onPages = Auth.isGithubPages && Auth.isGithubPages();
      // Never show "prefer stable" banner on beta — beta is first-class.
      const onBeta = Auth.isBetaHost && Auth.isBetaHost();
      mirrorBanner.hidden = !onPages || onBeta;
    }

    const betaBadge = $("beta-badge");
    if (betaBadge) {
      const onBeta = Auth.isBetaHost && Auth.isBetaHost();
      betaBadge.hidden = !onBeta;
      if (onBeta) {
        document.title = "Eddy's Hell · BETA";
        const sub = $("brand-sub");
        if (sub && !/beta/i.test(sub.textContent || "")) {
          sub.textContent = "Thursday workout · beta";
        }
      }
    }

    const inAppEl = $("auth-inapp");
    if (inAppEl) {
      if (inApp) {
        inAppEl.hidden = false;
        const isIOS =
          /iPad|iPhone|iPod/i.test(navigator.userAgent || "") ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        const browser = isIOS ? "Safari" : "Chrome";
        const title = inAppEl.querySelector("strong");
        if (title) title.textContent = "Open in " + browser;
        const msg = $("auth-inapp-msg");
        if (msg) {
          msg.textContent =
            (Auth.openInBrowserMessage && Auth.openInBrowserMessage()) ||
            ("Google sign-in does not work inside WhatsApp, Instagram, or Facebook. Open this page in " +
              browser +
              ", then sign in.");
        }
        const urlInput = $("auth-inapp-url");
        if (urlInput) {
          urlInput.value =
            (Auth.publicAppUrl && Auth.publicAppUrl()) || location.href.split("#")[0];
        }
        const copied = $("auth-inapp-copied");
        if (copied) copied.hidden = true;
      } else {
        inAppEl.hidden = true;
      }
    }

    // Hide Google button in in-app browsers — popup/redirect will fail.
    $("btn-google").hidden = !configured || inApp;
    $("mock-signin").hidden = !(!configured && local);

    const deniedEl = $("auth-denied");
    const banner =
      (Auth.getAuthBanner && Auth.getAuthBanner()) ||
      (Auth.getBlockMessage && Auth.getBlockMessage()
        ? { kind: "denied", title: "Not on the member list", message: Auth.getBlockMessage() }
        : null);
    if (banner && banner.message && !inApp) {
      deniedEl.hidden = false;
      const titleEl = $("auth-denied-title");
      if (titleEl) {
        titleEl.textContent =
          banner.title ||
          (banner.kind === "denied" ? "Not on the member list" : "Sign-in issue");
      }
      $("auth-denied-msg").textContent = banner.message;
    } else {
      deniedEl.hidden = true;
    }
  }

  function renderMemberView(opts) {
    const asAdmin = !!(opts && opts.asAdmin);
    showView("member");
    if (asAdmin) {
      $("admin-tabs").hidden = false;
      $("brand-sub").textContent = "Thursday workout admin";
    } else {
      $("admin-tabs").hidden = true;
      $("brand-sub").textContent = "This week’s workout";
    }

    const tw = resolveThisWeek();
    const liveBadge = $("member-live-badge");
    if (liveBadge) {
      liveBadge.hidden = !asAdmin;
      liveBadge.textContent = "LIVE";
    }
    const stagedNote = $("member-staged-note");
    if (stagedNote) {
      const staged = resolveStagedNext();
      if (asAdmin && staged) {
        stagedNote.hidden = false;
        stagedNote.textContent =
          "Next week staged on Rule tab: " +
          (staged.filename || staged.pickId) +
          " (not shown here until YouTube promote).";
      } else {
        stagedNote.hidden = true;
        stagedNote.textContent = "";
      }
    }
    if (!tw) {
      $("member-empty").hidden = false;
      $("member-pick").hidden = true;
      const roster = $("shared-checkins");
      if (roster) roster.hidden = true;
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
    renderYoutubeForMember(tw);

    renderMemberCheckin(tw);
    renderSharedCheckins(tw);
    // Pull latest check-ins (Firestore when available) without blocking UI
    window.EddysHellAuth.refreshCheckinsForPick(tw.id).then(() => {
      if (authUser) {
        renderMemberCheckin(tw);
        renderSharedCheckins(tw);
      }
    });
    window.EddysHellAuth.watchCheckinsForPick(tw.id);
  }

  function syncHintText() {
    const mode = window.EddysHellAuth.getCheckinSyncMode();
    if (mode === "cloud") {
      return "Synced across devices.";
    }
    if (mode === "local-error") {
      return "Saved on this device. Cloud sync isn’t available yet — Santiago can enable Firestore.";
    }
    return "Saved on this device.";
  }


  const DIFFICULTY_LABELS = { easy: "Easy", okay: "Okay", hard: "Hard" };

  function selectedCheckinDifficulty() {
    const el = document.querySelector('input[name="checkin-difficulty"]:checked');
    return el ? el.value : "";
  }

  function setCheckinDifficultyUI(value, { locked } = {}) {
    const seg = $("checkin-difficulty");
    const radios = document.querySelectorAll('input[name="checkin-difficulty"]');
    for (const r of radios) {
      r.checked = Boolean(value) && r.value === value;
      r.disabled = Boolean(locked);
    }
    if (seg) seg.dataset.locked = locked ? "1" : "0";
  }

  function syncCheckinButtonEnabled() {
    const btn = $("btn-checkin");
    if (!btn || btn.hidden) return;
    const has = Boolean(selectedCheckinDifficulty());
    btn.disabled = !has;
    btn.classList.toggle("checking", false);
  }

  function difficultyBadgeHtml(diff) {
    const key = String(diff || "").toLowerCase();
    const label = DIFFICULTY_LABELS[key];
    if (!label) return "";
    return ` <span class="difficulty-badge ${escapeHtml(key)}">${escapeHtml(label)}</span>`;
  }

  function renderMemberCheckin(tw) {
    if (!tw || !authUser) return;
    const mine = window.EddysHellAuth.myCheckin(tw.id, authUser.email);
    const btn = $("btn-checkin");
    const syncHint = $("checkin-sync-hint");
    const help = $("checkin-help");
    const needDiff = $("checkin-need-diff");
    if (needDiff) needDiff.hidden = true;
    if (mine) {
      btn.hidden = true;
      btn.disabled = true;
      btn.textContent = "Check in — I finished";
      btn.classList.remove("checking");
      setCheckinDifficultyUI(mine.difficulty || "", { locked: true });
      $("checkin-done").hidden = false;
      const when = mine.at ? "· " + formatWhen(mine.at) : "";
      const diffLabel = DIFFICULTY_LABELS[String(mine.difficulty || "").toLowerCase()];
      $("checkin-done-at").textContent = diffLabel
        ? `· ${diffLabel} ${when}`.trim()
        : when;
      $("checkin-toast").hidden = true;
      if (help) help.hidden = true;
    } else {
      btn.hidden = false;
      btn.textContent = "Check in — I finished";
      btn.classList.remove("checking");
      setCheckinDifficultyUI(selectedCheckinDifficulty(), { locked: false });
      syncCheckinButtonEnabled();
      $("checkin-done").hidden = true;
      if (help) help.hidden = false;
    }
    if (syncHint) {
      syncHint.hidden = false;
      syncHint.textContent = syncHintText();
    }
  }

  function renderAdminShell(preferredView) {
    $("admin-tabs").hidden = false;
    $("brand-sub").textContent = "Thursday workout admin";
    const view = preferredView || "rule";
    if (view === "pick" || view === "member") {
      // This week’s pick tab = same experience as friends (check-in + roster)
      renderMemberView({ asAdmin: true });
      return;
    }
    showView("rule");
    // Live card = thisWeek; Non-live empty until Dry-run (or keep current candidate).
    ensurePickViewFromPublished();
  }

  function syncMembersDraftFromAuth() {
    const m = window.EddysHellAuth.getMembers();
    membersDraft = [...(m.emails || [])];
  }

  function renderMembersUI() {
    const list = $("members-list");
    const countEl = $("members-count");
    const n = membersDraft.length;
    countEl.textContent =
      n === 1 ? "1 member allowed" : `${n} members allowed`;
    list.innerHTML = "";
    if (!n) {
      const li = document.createElement("li");
      li.className = "hint";
      li.textContent = "No members yet — only admins can use the app.";
      list.appendChild(li);
    } else {
      for (const email of membersDraft) {
        const li = document.createElement("li");
        li.className = "members-item";
        const span = document.createElement("span");
        span.className = "members-email";
        span.textContent = email;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn ghost btn-sm";
        btn.textContent = "Remove";
        btn.addEventListener("click", () => {
          membersDraft = membersDraft.filter((e) => e !== email);
          renderMembersUI();
        });
        li.appendChild(span);
        li.appendChild(btn);
        list.appendChild(li);
      }
    }
    const pending = localStorage.getItem(MEMBERS_PENDING_KEY) === "1";
    $("members-publish-hint").hidden = !pending;
  }

  function addMemberFromInput() {
    const input = $("member-email-input");
    const email = window.EddysHellAuth.normalizeEmail(input.value);
    if (!email || !email.includes("@")) {
      alert("Enter a valid email address.");
      return;
    }
    if (membersDraft.includes(email)) {
      input.value = "";
      return;
    }
    membersDraft = [...membersDraft, email];
    input.value = "";
    renderMembersUI();
  }

  function saveMembersList() {
    const payload = window.EddysHellAuth.saveMembers(membersDraft);
    membersDraft = [...payload.emails];
    localStorage.setItem(MEMBERS_PENDING_KEY, "1");
    renderMembersUI();
    const toast = $("members-toast");
    toast.hidden = false;
    toast.textContent = "Members saved — Publish pending. Grok Bot will sync.";
    $("members-publish-hint").hidden = false;
    setTimeout(() => {
      toast.hidden = true;
    }, 3500);
  }

  function renderPTUI() {
    $("pt-email-input").value = ptSummary.email || "";
    const pending = localStorage.getItem(PT_PENDING_KEY) === "1";
    $("pt-publish-hint").hidden = !pending;
  }

  /**
   * Paint Sign-in landing BEFORE Auth.init finishes.
   * Root cause of blank beta: all .view start hidden; boot awaited Firebase
   * module load + authStateReady before onAuthChange → applyRoleUI. Slow/hung
   * auth left header-only forever. Guests must always see Sign in + week hint.
   */
  function paintGuestShellEarly() {
    try {
      showView("landing");
      forceGuestChrome();
      const sub = $("brand-sub");
      if (sub) sub.textContent = "Thursday workout";
      const Auth = window.EddysHellAuth;
      const onBeta = Auth && Auth.isBetaHost && Auth.isBetaHost();
      const betaBadge = $("beta-badge");
      if (betaBadge) {
        betaBadge.hidden = !onBeta;
        if (onBeta) {
          document.title = "Eddy's Hell · BETA";
          if (sub && !/beta/i.test(sub.textContent || "")) {
            sub.textContent = "Thursday workout · beta";
          }
        }
      }
      const tw = resolveThisWeek();
      const locked = $("locked-title");
      if (locked) {
        locked.textContent = tw
          ? `This week: ${tw.filename || "workout"} (sign in to unlock)`
          : "Workout locked until you sign in.";
      }
      // Optimistic Sign in — do not flash "Auth not configured" while Firebase loads.
      const notCfg = $("auth-not-configured");
      if (notCfg) notCfg.hidden = true;
      const inApp = Auth && Auth.isInAppBrowser && Auth.isInAppBrowser();
      const btn = $("btn-google");
      if (btn) {
        btn.hidden = !!inApp;
        btn.disabled = false;
        btn.textContent = "Sign in with Google";
      }
      const mock = $("mock-signin");
      if (mock) mock.hidden = true;
      const inAppEl = $("auth-inapp");
      if (inAppEl) inAppEl.hidden = !inApp;
    } catch (err) {
      console.error("paintGuestShellEarly:", err);
      try {
        showView("landing");
      } catch (_) { /* last resort */ }
    }
  }

  function safeApplyRoleUI() {
    try {
      applyRoleUI();
    } catch (err) {
      console.error("applyRoleUI failed — falling back to Sign in:", err);
      authUser = null;
      try {
        paintGuestShellEarly();
        // Prefer full landing if Auth APIs are up
        if (window.EddysHellAuth && window.EddysHellAuth.isConfigured) {
          renderLanding();
        }
      } catch (err2) {
        console.error(err2);
      }
    }
  }

  function applyRoleUI() {
    syncAuthBodyClass();
    renderUserSlot();
    if (!authUser) {
      // renderLanding → forceGuestChrome (body.is-guest + hidden attrs)
      renderLanding();
      return;
    }
    window.EddysHellAuth.clearBlockMessage();
    if (authUser.role === "admin") {
      syncMembersDraftFromAuth();
      renderMembersUI();
      renderPTUI();
      renderAdminShell("rule");
      // Assert landing is not left visible alongside admin chrome
      const landing = $("view-landing");
      if (landing) landing.hidden = true;
      return;
    }
    // Members: tabs stay hidden via body:not(.is-admin)
    const tabs = $("admin-tabs");
    if (tabs) tabs.hidden = true;
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
    const autoEl = $("auto-pick");
    return {
      version: (state.rule && state.rule.version) || RULE_VERSION,
      folderTypes: [...(state.rule.folderTypes || [])],
      minHR: Number($("min-hr").value) || 0,
      requireHR: $("require-hr").checked,
      autoPick: autoEl ? !!autoEl.checked : true,
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
    const autoEl = $("auto-pick");
    if (autoEl) autoEl.checked = state.rule.autoPick !== false;
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
    // Reveal row is driven by getRevealRelPath() (staged or dry-run), not pick-result alone.
    updateRevealFinderButton();
  }

  function renderPickResult(result) {
    const f = result.pick;
    const titleEl = $("pick-preview-title");
    if (titleEl) {
      titleEl.textContent = result._fromStaged
        ? "Staged candidate"
        : "Dry-run candidate";
    }
    $("pick-type").textContent = f.folderType || "—";
    $("pick-filename").textContent = f.filename || "—";
    $("pick-hr").textContent = f.hr != null ? String(f.hr) : "missing";
    $("pick-tags").textContent =
      f.rawTags && f.rawTags.length ? f.rawTags.join(", ") : "—";
    $("pick-path").textContent = f.relPath || "—";
    $("pick-size").textContent = formatBytes(f.sizeBytes);
    $("pick-mtime").textContent = formatMtime(f.mtime);
    $("pick-count").textContent = String(
      (result.matches && result.matches.length) || result.matchCount || 1
    );
    $("pick-why").textContent = result.why;
    showPickPanels({ empty: false, result: true, error: false });
    $("accept-toast").hidden = true;
    updatePickActions();
    updateRevealFinderButton();
    updateDryRunButtonLabel();
    renderYoutubeAdminControls();
  }

  function renderPickError(msg) {
    $("pick-error-msg").textContent = msg;
    showPickPanels({ empty: false, result: false, error: true });
  }

  function renderSharedCheckins(tw) {
    const box = $("shared-checkins");
    if (!box) return;
    if (!tw) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    paintSharedCheckinsList(tw);
  }

  function paintSharedCheckinsList(tw) {
    if (!tw) return;
    const list = window.EddysHellAuth.checkinsForPick(tw.id);
    const countEl = $("checkins-count");
    if (countEl) countEl.textContent = String(list.length);
    const sync = $("shared-checkins-sync");
    if (sync) {
      const mode = window.EddysHellAuth.getCheckinSyncMode();
      if (mode === "cloud") {
        sync.textContent = "Live list — emails + timestamps (synced across devices).";
      } else if (mode === "local-error") {
        sync.textContent =
          "Showing this device’s check-ins. Enable Firestore in Firebase to sync across devices.";
      } else {
        sync.textContent =
          "Emails and timestamps from everyone who tapped Check in (this device until cloud sync is on).";
      }
    }
    const ul = $("checkins-list");
    if (!ul) return;
    ul.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "hint";
      li.textContent =
        "Nobody has checked in yet — tap Check in after the workout.";
      ul.appendChild(li);
      return;
    }
    for (const c of list) {
      const li = document.createElement("li");
      const notes = !c.difficulty && c.notes ? ` — ${c.notes}` : "";
      li.innerHTML = `<strong>${escapeHtml(c.displayName || c.email)}</strong>${difficultyBadgeHtml(c.difficulty)}
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

  function scrollCandidatePreviewIntoView() {
    const el =
      (!$("pick-result").hidden && $("pick-result")) ||
      (!$("pick-error").hidden && $("pick-error")) ||
      (!$("pick-empty").hidden && $("pick-empty")) ||
      $("pick-result") ||
      $("pick-empty");
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function runDryRun() {
    const rule = readRuleFromForm();
    state.rule = rule;
    const result = pick(catalog.files, rule, state.usedHistory);
    currentResult = result.ok ? result : null;
    pickIsCandidate = !!(result.ok && result.pick);
    // Stay on Admin Rule — candidate preview lives here (friends never see it)
    showView("rule");
    if (!result.ok) {
      pickIsCandidate = false;
      renderPickError(result.error);
      updatePickActions();
      scrollCandidatePreviewIntoView();
      return;
    }
    renderPickResult(result);
    scrollCandidatePreviewIntoView();
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
    pickIsCandidate = !!(result.ok && result.pick);
    if (!result.ok) {
      pickIsCandidate = false;
      renderPickError(result.error);
      updatePickActions();
      return;
    }
    renderPickResult(result);
  }

  async function acceptPick() {
    if (!currentResult || !currentResult.pick) return;
    const f = currentResult.pick;
    const now = new Date().toISOString();
    // Keep existing YouTube id if re-accepting the same published pick/file
    const prev = resolveThisWeek();
    const sameAsPrev =
      prev &&
      (prev.id === f.id ||
        (prev.relPath && f.relPath && prev.relPath === f.relPath) ||
        (prev.filename && f.filename && prev.filename === f.filename));
    const keepYt =
      sameAsPrev && prev.youtubeId
        ? {
            youtubeId: prev.youtubeId,
            youtubeUrl:
              prev.youtubeUrl ||
              ("https://www.youtube.com/watch?v=" + prev.youtubeId),
          }
        : { youtubeId: null, youtubeUrl: null };

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
      youtubeId: keepYt.youtubeId,
      youtubeUrl: keepYt.youtubeUrl,
      archiveRoot: ARCHIVE_ROOT,
    };

    // No youtubeId → STAGE only (config/nextWeek). Never touch live thisWeek.
    if (!keepYt.youtubeId) {
      const btnAccept = $("btn-accept");
      if (btnAccept) {
        btnAccept.disabled = true;
        btnAccept.textContent = "Staging…";
      }
      try {
        await stagePayloadToCloud(payload);
        // Record for rotation, but do NOT overwrite lastPick / thisWeekFile
        // (those feed resolveThisWeek fallbacks and would look like a live change).
        state.usedHistory = [
          ...(state.usedHistory || []),
          { id: f.id, pickedAt: now },
        ];
        saveState();
        pickIsCandidate = true;
        showStagedToast();
      } catch (err) {
        console.warn("stageNextWeek failed:", err);
        showAcceptToast(
          "Stage failed: " + ((err && err.message) || String(err)),
          { error: true, ms: 6000 }
        );
      } finally {
        if (btnAccept) {
          btnAccept.disabled = false;
          btnAccept.textContent = "Stage next week";
        }
      }
      renderHistory();
      updateMatchBadge();
      updatePickActions();
      updateStagedHint();
      // Re-paint live This week card so staging never looks like it replaced live.
      const twLive = resolveThisWeek();
      renderSharedCheckins(twLive);
      renderYoutubeAdminControls();
      const memberView = $("view-member");
      if (memberView && !memberView.hidden && authUser) {
        renderMemberView({ asAdmin: authUser.role === "admin" });
      }
      return;
    }

    // Has youtubeId → publish LIVE thisWeek (same-pick re-publish or already-uploaded).
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
      youtubeId: keepYt.youtubeId,
      youtubeUrl: keepYt.youtubeUrl,
    };
    state.usedHistory = [
      ...(state.usedHistory || []),
      { id: f.id, pickedAt: now },
    ];
    saveState();

    thisWeekFile = { ...payload, _source: "local" };
    pickIsCandidate = false;

    const btnAccept = $("btn-accept");
    if (btnAccept) {
      btnAccept.disabled = true;
      btnAccept.textContent = "Publishing…";
    }
    const toast = $("accept-toast");
    try {
      await publishPayloadToCloud(payload);
      if (toast) {
        toast.hidden = false;
        toast.textContent = "Published — friends will see this.";
      }
      setPublishStatus("");
      persistStagedLocal(null);
    } catch (err) {
      console.warn("publishThisWeek failed:", err);
      if (isYoutubeRequiredError(err)) {
        thisWeekFile = prev
          ? {
              pickId: prev.id || prev.pickId,
              id: prev.id || prev.pickId,
              filename: prev.filename,
              folderType: prev.folderType,
              hr: prev.hr,
              relPath: prev.relPath,
              sizeBytes: prev.sizeBytes,
              mtime: prev.mtime,
              rawTags: prev.rawTags || [],
              pickedAt: prev.pickedAt,
              why: prev.why,
              matchCount: prev.matchCount,
              youtubeId: prev.youtubeId || null,
              youtubeUrl: prev.youtubeUrl || null,
              archiveRoot: prev.archiveRoot || ARCHIVE_ROOT,
              _source: prev.source || "local",
            }
          : thisWeekFile;
        showYtRequiredToast();
      } else {
        try {
          localStorage.setItem(PENDING_PUBLISH_KEY, "1");
        } catch (_) { /* ok */ }
        if (toast) {
          toast.hidden = false;
          toast.textContent = "Saved locally — cloud publish failed.";
        }
        setPublishStatus(
          "Publish failed: " + ((err && err.message) || String(err)),
          { error: true, sticky: true }
        );
      }
    } finally {
      if (btnAccept) {
        btnAccept.disabled = false;
        btnAccept.textContent = "Publish this week";
      }
    }

    renderHistory();
    updateMatchBadge();
    updatePickActions();
    setTimeout(() => {
      if (toast) toast.hidden = true;
    }, 4000);
    renderSharedCheckins(resolveThisWeek());
    renderYoutubeAdminControls();
  }

  /** Re-publish whatever resolveThisWeek() currently shows (admin Publish button). */
  async function keepThisWeek() {
    pickIsCandidate = false;
    const tw = resolveThisWeek();
    if (!tw) {
      ensurePickViewFromPublished();
      updatePickActions();
      return;
    }
    if (!tw.youtubeId) {
      showYtRequiredToast();
      ensurePickViewFromPublished();
      updatePickActions();
      return;
    }
    // Sync lastPick to what's on screen so local + cloud match
    state.lastPick = {
      id: tw.id,
      filename: tw.filename,
      folderType: tw.folderType,
      hr: tw.hr,
      relPath: tw.relPath,
      sizeBytes: tw.sizeBytes,
      mtime: tw.mtime,
      rawTags: tw.rawTags || [],
      pickedAt: tw.pickedAt || new Date().toISOString(),
      why: tw.why,
      matchCount: tw.matchCount,
      youtubeId: tw.youtubeId || null,
      youtubeUrl: tw.youtubeUrl || null,
    };
    saveState();
    currentResult = null;
    ensurePickViewFromPublished();

    const payload = payloadFromThisWeek(tw);
    const btnKeep = $("btn-keep");
    if (btnKeep) {
      btnKeep.disabled = true;
      btnKeep.textContent = "Publishing…";
    }
    const toast = $("accept-toast");
    try {
      await publishPayloadToCloud(payload);
      toast.hidden = false;
      toast.textContent = "Published — friends will see this.";
      setPublishStatus("");
    } catch (err) {
      console.warn("re-publish this week failed:", err);
      if (isYoutubeRequiredError(err)) {
        showYtRequiredToast();
      } else {
        try {
          localStorage.setItem(PENDING_PUBLISH_KEY, "1");
        } catch (_) { /* ok */ }
        toast.hidden = false;
        toast.textContent = "Saved locally — cloud publish failed.";
        setPublishStatus(
          "Publish failed: " + ((err && err.message) || String(err)),
          { error: true, sticky: true }
        );
      }
    } finally {
      if (btnKeep) {
        btnKeep.disabled = false;
        btnKeep.textContent = "Publish this week";
      }
    }
    setTimeout(() => {
      toast.hidden = true;
    }, 4000);
    updatePickActions();
    renderSharedCheckins(resolveThisWeek());
    renderYoutubeAdminControls();
  }

  function ensurePickViewFromPublished() {
    // Live Candidate pick = thisWeek with youtubeId only (read-only). Never dry-run / No matches.
    renderLiveWeekCard();
    if (currentResult && pickIsCandidate) {
      renderPickResult(currentResult);
      updateDryRunButtonLabel();
      updateStagedHint();
      return;
    }
    // Hydrate Non-live from staged nextWeek so Pick again / Reveal / Stage stay visible.
    const staged = resolveStagedNext();
    if (staged) {
      const id = staged.pickId || staged.id;
      const f =
        (catalog && catalog.files && catalog.files.find((x) => x.id === id)) || {
          id,
          filename: staged.filename,
          folderType: staged.folderType,
          hr: staged.hr,
          relPath: staged.relPath,
          sizeBytes: staged.sizeBytes,
          mtime: staged.mtime,
          rawTags: staged.rawTags || [],
        };
      currentResult = {
        ok: true,
        pick: f,
        matches: Array(staged.matchCount || 1).fill(f),
        why: staged.why || "Staged next week (not live)",
        _fromStaged: true,
      };
      pickIsCandidate = true;
      renderPickResult(currentResult);
      updateDryRunButtonLabel();
      updateStagedHint();
      return;
    }
    // Do NOT paint live thisWeek into Non-live (Candidate pick LIVE owns that).
    pickIsCandidate = false;
    currentResult = null;
    showPickPanels({ empty: true, result: false, error: false });
    updatePickActions();
    updateDryRunButtonLabel();
    updateStagedHint();
  }

  function restoreLastPickIfAny() {
    pickIsCandidate = false;
    if (!state.lastPick) {
      // Fall through to published this-week.json when lastPick is missing
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
        return;
      }
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
    for (const id of ["min-hr", "require-hr", "auto-pick", "rotate", "rotate-weeks", "tag-contains"]) {
      $(id).addEventListener("input", updateMatchBadge);
      $(id).addEventListener("change", updateMatchBadge);
    }
    for (const el of document.querySelectorAll('input[name="recency"]')) {
      el.addEventListener("change", updateMatchBadge);
    }
  }

  function wireAuthButtons() {
    const copyBtn = $("btn-copy-url");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const urlInput = $("auth-inapp-url");
        const url =
          (urlInput && urlInput.value) ||
          (window.EddysHellAuth.publicAppUrl &&
            window.EddysHellAuth.publicAppUrl()) ||
          location.href.split("#")[0];
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
          } else if (urlInput) {
            urlInput.focus();
            urlInput.select();
            document.execCommand("copy");
          }
          const copied = $("auth-inapp-copied");
          if (copied) {
            copied.hidden = false;
            setTimeout(() => {
              copied.hidden = true;
            }, 2500);
          }
        } catch (_) {
          if (urlInput) {
            urlInput.focus();
            urlInput.select();
          }
          alert("Copy this link and paste it into Safari:\n" + url);
        }
      });
    }

    $("btn-google").addEventListener("click", async () => {
      try {
        const result = await window.EddysHellAuth.signInWithGoogle();
        // Redirect navigates away; popup resolves via onAuthStateChanged.
        if (result && result.method === "redirect") return;
      } catch (err) {
        // cancelled-popup-request / popup-closed are non-fatal (redirect retry).
        if (
          window.EddysHellAuth.isBenignPopupError &&
          window.EddysHellAuth.isBenignPopupError(err)
        ) {
          return;
        }
        const Auth = window.EddysHellAuth;
        let msg =
          (Auth.friendlyAuthError && Auth.friendlyAuthError(err)) ||
          err.message ||
          String(err);
        // In-app / argument-error: prefer the on-page banner over a raw alert.
        if (
          err.code === "auth/in-app-browser" ||
          err.code === "auth/argument-error" ||
          /argument-error/i.test(String(err.message || ""))
        ) {
          if (Auth.isInAppBrowser && Auth.isInAppBrowser()) {
            renderLanding();
            const inAppEl = $("auth-inapp");
            if (inAppEl) {
              inAppEl.hidden = false;
              inAppEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
            return;
          }
        }
        alert(msg);
      }
    });
    $("btn-mock-admin").addEventListener("click", () => {
      window.EddysHellAuth.mockSignIn("admin");
    });
    $("btn-mock-member").addEventListener("click", () => {
      window.EddysHellAuth.mockSignIn("member");
    });
    $("btn-signout").addEventListener("click", async () => {
      // Optimistic guest chrome — do not wait for Firebase round-trip
      authUser = null;
      applyRoleUI();
      try {
        await window.EddysHellAuth.signOut();
      } catch (err) {
        console.warn("signOut:", err);
        authUser = window.EddysHellAuth.getUser();
        applyRoleUI();
      }
    });
    const diffRadios = document.querySelectorAll('input[name="checkin-difficulty"]');
    for (const r of diffRadios) {
      r.addEventListener("change", () => {
        const need = $("checkin-need-diff");
        if (need) need.hidden = true;
        syncCheckinButtonEnabled();
      });
    }
    $("btn-checkin").addEventListener("click", async () => {
      const tw = resolveThisWeek();
      if (!tw || !authUser) return;
      const difficulty = selectedCheckinDifficulty();
      if (!difficulty) {
        const need = $("checkin-need-diff");
        if (need) {
          need.hidden = false;
          setTimeout(() => {
            need.hidden = true;
          }, 2800);
        }
        syncCheckinButtonEnabled();
        return;
      }
      const confirmed = window.confirm(
        "Mark yourself as checked in for this week?"
      );
      if (!confirmed) return;
      const btn = $("btn-checkin");
      btn.disabled = true;
      btn.classList.add("checking");
      btn.textContent = "Checking in…";
      try {
        await window.EddysHellAuth.upsertCheckin({
          email: authUser.email,
          displayName: authUser.displayName,
          pickId: tw.id,
          difficulty,
          notes: "",
        });
        $("checkin-toast").hidden = false;
        setTimeout(() => {
          $("checkin-toast").hidden = true;
        }, 2500);
        renderMemberCheckin(tw);
        paintSharedCheckinsList(tw);
      } catch (err) {
        alert("Check-in failed: " + (err.message || err));
        btn.classList.remove("checking");
        btn.textContent = "Check in — I finished";
        syncCheckinButtonEnabled();
      }
    });
  }

  // ——— Boot ———

  async function boot() {
    loadState();
    await loadPTSummary();

    let repoDefault = null;
    try {
      const dr = await fetch("data/default-rule.json", { cache: "no-store" });
      if (dr.ok) repoDefault = await dr.json();
    } catch (_) { /* ok */ }

    const desiredVersion = RULE_VERSION;
    const hadStorage = !!localStorage.getItem(STORAGE_KEY);
    const storedVersion = state.rule && state.rule.version;
    // Always replace rule from default-rule.json when stored version !== RULE_VERSION
    // (keep usedHistory / lastPick). Same-version still lets admin overrides win.
    const versionMismatch = Number(storedVersion) !== Number(desiredVersion);

    if (!hadStorage || versionMismatch) {
      try {
        const seedRes = await fetch("data/state.json", { cache: "no-store" });
        if (seedRes.ok) {
          const seed = await seedRes.json();
          if (!hadStorage) {
            if (Array.isArray(seed.usedHistory)) state.usedHistory = seed.usedHistory;
            if (seed.lastPick) state.lastPick = seed.lastPick;
          }
          if (!repoDefault && seed.rule) repoDefault = seed.rule;
        }
      } catch (_) { /* optional */ }
      // Prefer live default-rule.json; fall back to state.json rule / defaultRule()
      state.rule = {
        ...defaultRule(),
        ...(repoDefault || {}),
        version: RULE_VERSION,
      };
      saveState();
    } else if (repoDefault) {
      // Same version: fill missing keys from defaults, keep admin overrides
      state.rule = { ...defaultRule(), ...repoDefault, ...state.rule };
    }

    // Parallel Hosting JSON — don't serialize this-week + catalog on phone networks
    const twFetch = fetch("data/this-week.json", { cache: "no-store" })
      .then(async (twRes) => {
        if (twRes.ok) {
          thisWeekFile = await twRes.json();
          if (thisWeekFile) thisWeekFile._source = "file";
        }
      })
      .catch(() => {
        thisWeekFile = null;
      });
    const catalogFetch = fetch("data/catalog.json").then(async (res) => {
      if (!res.ok) throw new Error("Failed to load catalog.json");
      catalog = await res.json();
    });
    await Promise.all([twFetch, catalogFetch]);

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
        if (tab.dataset.view === "rule") {
          syncMembersDraftFromAuth();
          renderMembersUI();
          renderPTUI();
          // Keep dry-run candidate, else restore published/last pick (Reveal needs pick-result)
          ensurePickViewFromPublished();
        }
        if (tab.dataset.view === "pick") {
          // Same This week experience as friends: workout + check-in + shared roster
          renderMemberView({ asAdmin: true });
        }
      });
    }

    $("btn-save").addEventListener("click", async () => {
      state.rule = readRuleFromForm();
      saveState();
      // Keep pending key as local backup for Mac Wednesday routine / Hosting JSON
      try {
        localStorage.setItem(
          RULE_PENDING_KEY,
          JSON.stringify({
            rule: state.rule,
            defaultRule: {
              version: state.rule.version || RULE_VERSION,
              folderTypes: state.rule.folderTypes,
              minHR: state.rule.minHR,
              requireHR: state.rule.requireHR,
              autoPick: state.rule.autoPick !== false,
              recency: state.rule.recency,
              rotate: state.rule.rotate,
              rotateWeeks: state.rule.rotateWeeks,
              tagContains: state.rule.tagContains || "",
            },
            updatedAt: new Date().toISOString(),
          })
        );
      } catch (_) { /* ok */ }
      const toast = $("save-toast");
      const btn = $("btn-save");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Publishing…";
      }
      try {
        if (
          window.EddysHellAuth &&
          window.EddysHellAuth.publishRule &&
          window.EddysHellAuth.isFirestoreReady &&
          window.EddysHellAuth.isFirestoreReady()
        ) {
          await window.EddysHellAuth.publishRule(state.rule);
          try {
            localStorage.removeItem(RULE_PENDING_KEY);
          } catch (_) { /* ok */ }
          toast.hidden = false;
          toast.textContent = "Rule published.";
        } else {
          toast.hidden = false;
          toast.textContent =
            "Rule saved locally (cloud not ready). Auto-pick " +
            (state.rule.autoPick !== false ? "ON" : "OFF") +
            ".";
        }
      } catch (err) {
        console.warn("publishRule failed:", err);
        toast.hidden = false;
        toast.textContent =
          "Rule saved locally — publish failed: " +
          ((err && err.message) || String(err));
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Save rule";
        }
      }
      setTimeout(() => {
        toast.hidden = true;
      }, 3500);
    });

    $("btn-dryrun").addEventListener("click", runDryRunOrAgain);
    $("btn-accept").addEventListener("click", acceptPick);
    const btnStageYt = $("btn-stage-youtube");
    if (btnStageYt) btnStageYt.addEventListener("click", saveYoutubeToStaged);
    const btnSwapLive = $("btn-swap-live");
    if (btnSwapLive) btnSwapLive.addEventListener("click", swapStagedToLiveNow);
    const ytInput = $("yt-url-input");
    if (ytInput) {
      ytInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          saveYoutubeToStaged();
        }
      });
    }
    const btnKeep = $("btn-keep");
    if (btnKeep) btnKeep.addEventListener("click", keepThisWeek);
    const btnReveal = $("btn-reveal-finder");
    if (btnReveal) btnReveal.addEventListener("click", revealInFinder);
    const gotoRule = $("btn-goto-rule");
    if (gotoRule) gotoRule.addEventListener("click", () => showView("rule"));
    const errRule = $("btn-error-rule");
    if (errRule) errRule.addEventListener("click", () => showView("rule"));

    $("btn-member-add").addEventListener("click", addMemberFromInput);
    $("member-email-input").addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        addMemberFromInput();
      }
    });
    $("btn-members-save").addEventListener("click", saveMembersList);
    $("btn-pt-save").addEventListener("click", savePTSummary);

    // Paint Sign in immediately — never leave all views hidden while Firebase loads.
    paintGuestShellEarly();

    const AUTH_INIT_MS = 12000;
    try {
      await Promise.race([
        window.EddysHellAuth.init(),
        new Promise((_, reject) => {
          setTimeout(() => {
            const err = new Error("Auth init timed out — showing Sign in");
            err.code = "auth-init-timeout";
            reject(err);
          }, AUTH_INIT_MS);
        }),
      ]);
    } catch (err) {
      console.warn("Auth.init:", err);
      // Keep guest shell visible; user can still tap Sign in once modules load.
      paintGuestShellEarly();
    }
    syncMembersDraftFromAuth();
    renderMembersUI();
    renderPTUI();
    // Firestore is live SoT for this-week + rule (Hosting JSON = bootstrap)
    try {
      await loadCloudConfig();
    } catch (err) {
      console.warn("loadCloudConfig:", err);
    }
    // Restore staged next-week from localStorage (does not affect live thisWeek).
    const localStaged = loadStagedLocal();
    if (localStaged) {
      nextWeekFile = { ...localStaged, _source: "local" };
      updateStagedHint();
    }

    if (window.EddysHellAuth.watchThisWeek) {
      window.EddysHellAuth.watchThisWeek((cloud) => {
        if (applyCloudThisWeek(cloud)) {
          ensurePickViewFromPublished();
          renderYoutubeAdminControls();
          const tw = resolveThisWeek();
          if (tw && authUser) {
            renderSharedCheckins(tw);
            const memberView = $("view-member");
            if (memberView && !memberView.hidden) {
              renderMemberView({ asAdmin: authUser.role === "admin" });
            }
          }
        }
      });
    }
    window.EddysHellAuth.onAuthChange((user) => {
      authUser = user;
      safeApplyRoleUI();
      if (user) {
        loadCloudConfig().catch((err) => console.warn(err));
      }
    });
    window.EddysHellAuth.onCheckinsChange(() => {
      const tw = resolveThisWeek();
      if (!tw || !authUser) return;
      const memberView = $("view-member");
      const onMember = memberView && !memberView.hidden;
      if (onMember) {
        renderMemberCheckin(tw);
        paintSharedCheckinsList(tw);
      }
    });

    window.EddysHell = {
      pick,
      matchCount,
      defaultRule,
      catalog,
      getState: () => state,
      /** Wednesday routine: true = auto dry-run/accept; false = keep this week.
       *  Live thisWeek publish still requires youtubeId (see canPublishThisWeek).
       *  Candidates without video → stageNextWeek / Stage next week button. */
      isAutoPickEnabled: () => {
        const r = (state && state.rule) || {};
        return r.autoPick !== false;
      },
      /** Bot/admin: true only when the pick already has youtubeId — required to publish live thisWeek. */
      canPublishThisWeek: (tw) => {
        const pick = tw || resolveThisWeek();
        return !!(pick && pick.youtubeId);
      },
      /** Staged next-week candidate (not live). */
      getStagedNextWeek: () => resolveStagedNext(),
      /**
       * Wednesday/bot after compress+YouTube upload: promote staged → live thisWeek
       * with youtubeId. Leaves live alone if no staged doc or no id.
       */
      promoteAfterYoutubeUpload: async (youtubeId, youtubeUrl) => {
        const Auth = window.EddysHellAuth;
        if (!Auth || !Auth.promoteStagedToLive) {
          throw new Error("Auth promoteStagedToLive API missing");
        }
        const live = await Auth.promoteStagedToLive(youtubeId, youtubeUrl);
        thisWeekFile = { ...live, _source: "cloud" };
        persistStagedLocal(null);
        ensurePickViewFromPublished();
        renderYoutubeAdminControls();
        updatePickActions();
        return live;
      },
      /** Admin: attach YouTube to staged next week only. Never publishes. */
      stageYoutubeOnly: saveYoutubeToStaged,
      /** Admin: promote staged next week (must already have youtubeId) to live. */
      swapLiveNow: swapStagedToLiveNow,
      YT_REQUIRED_TOAST,
      STAGED_TOAST,
      resolveThisWeek,
      parseYoutubeId,
      ARCHIVE_ROOT,
    };
  }

  boot().catch((err) => {
    console.error(err);
    const meta = $("catalog-meta");
    if (meta) meta.textContent = "Failed to load: " + (err && err.message ? err.message : String(err));
    try {
      paintGuestShellEarly();
    } catch (_) {
      try {
        showView("landing");
      } catch (__){ /* ignore */ }
    }
  });
})();
