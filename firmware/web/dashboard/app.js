/* PicoOS dashboard - vanilla JS, no dependencies (works offline). */
(() => {
  "use strict";

  // ------------------------------------------------------------------ icons
  const P = {
    wifi: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r=".8" fill="currentColor"/>',
    store: '<path d="M4 7h16l-1.2 11.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 7Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
    upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 18v0a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    pin: '<path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
    disk: '<ellipse cx="12" cy="5.5" rx="8" ry="2.5"/><path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13"/><path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    more: '<circle cx="12" cy="5.5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="18.5" r="1.4" fill="currentColor"/>',
    home: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    power: '<path d="M12 3v8"/><path d="M6.3 7.2a8 8 0 1 0 11.4 0"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10.5 13.5"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7 7.5 20h9l1-13"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>',
    pause: '<rect x="7" y="5.5" width="3.2" height="13" rx="1"/><rect x="13.8" y="5.5" width="3.2" height="13" rx="1"/>',
    play: '<path d="M8 5.5v13l10-6.5-10-6.5Z"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[n] || ""}</svg>`;
  const paintIcons = (root = document) => root.querySelectorAll(".ico[data-icon]").forEach((el) => {
    if (!el.firstChild) el.innerHTML = icon(el.dataset.icon);
  });

  // ---------------------------------------------------------------- helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtBytes = (b) => {
    if (b == null || isNaN(b)) return "–";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB";
    return (b / 1048576).toFixed(2) + " MB";
  };
  const fmtUptime = (s) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m ${s % 60}s`;
  };
  const BLOCK = 4096;
  const diskCost = (size) => (Math.ceil(size / BLOCK) + 1) * BLOCK;
  const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "my-app";
  const ls = {
    get(k, d) { try { const v = localStorage.getItem("picoos." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("picoos." + k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  const PALETTE = [["#6366f1", "#8b5cf6"], ["#0ea5e9", "#22d3ee"], ["#f43f5e", "#fb923c"], ["#10b981", "#84cc16"], ["#f59e0b", "#ef4444"], ["#8b5cf6", "#ec4899"], ["#14b8a6", "#3b82f6"], ["#64748b", "#334155"]];
  const colorsFor = (id, color) => {
    if (color && /^#[0-9a-f]{3,8}$/i.test(color)) return [color, color + "cc"];
    let h = 0; for (const c of id || "x") h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  };
  const isEmoji = (s) => !!s && !/\./.test(s) && /\p{Extended_Pictographic}/u.test(s);

  async function api(path, opts = {}) {
    const o = { ...opts };
    if (o.json !== undefined) {
      o.body = JSON.stringify(o.json);
      o.headers = { "Content-Type": "application/json", ...(o.headers || {}) };
      delete o.json;
    }
    const r = await fetch(path, o);
    let data = null;
    try { data = await r.json(); } catch { /* empty */ }
    if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
    return data;
  }

  function toast(msg, type = "ok", ms = 3800) {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.innerHTML = `<span class="ico">${icon(type === "error" ? "alert" : "check")}</span><span>${esc(msg)}</span>`;
    $("#toasts").appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, ms);
  }

  // ------------------------------------------------------------------ state
  const S = {
    status: null,
    apps: [],
    free: 0,
    clock: null, // { unix, offset, at }
    catalog: null,
    community: null,
    storeTab: "all",
    storeCat: "All",
    installing: {},
  };

  // ------------------------------------------------------------------ modals
  function openModal(id) {
    const m = $("#" + id);
    m.hidden = false;
    document.body.style.overflow = "hidden";
    const f = m.querySelector("input, button:not([data-close])");
    if (f && window.matchMedia("(hover: hover)").matches) setTimeout(() => f.focus(), 50);
  }
  function closeModal(m) {
    m.hidden = true;
    if (!$$(".modal").some((x) => !x.hidden)) document.body.style.overflow = "";
  }
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-close]");
    if (c) closeModal(c.closest(".modal"));
    if (e.target.classList.contains("modal")) closeModal(e.target);
    const o = e.target.closest("[data-open]");
    if (o) ({ store: openStore, upload: openUpload })[o.dataset.open]?.();
    if (!e.target.closest("#ctxMenu") && !e.target.closest(".app-more")) $("#ctxMenu").hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#ctxMenu").hidden) { $("#ctxMenu").hidden = true; return; }
    const open = $$(".modal").filter((m) => !m.hidden).pop();
    if (open) closeModal(open);
  });

  // ------------------------------------------------------------------ status
  let failures = 0;
  async function refresh() {
    try {
      const st = await api("/api/status");
      failures = 0;
      $("#offline").hidden = true;
      S.status = st;
      S.apps = st.apps || [];
      S.free = Math.max(0, (st.system.storage.free || 0) - 64 * 1024);
      S.clock = { unix: st.time.unix, offset: st.time.offset, at: performance.now() };
      renderWidgets();
      renderApps();
    } catch (e) {
      if (++failures >= 2) $("#offline").hidden = false;
    }
  }

  function renderWidgets() {
    const st = S.status;
    const { system: sys, wifi, device, time } = st;
    document.title = `${device.name} · PicoOS`;
    $("#deviceName").textContent = `${device.name} · ${device.hostname}.local`;
    $("#netName").textContent = wifi.connected ? wifi.ssid || "Connected" : "Offline";
    const wall = st.settings.wallpaper || "aurora";
    document.body.dataset.wallpaper = wall;

    // storage ring
    const s = sys.storage;
    const total = s.total || 1;
    const appsB = s.apps || 0;
    const sysB = Math.max(0, s.used - appsB);
    const C = 2 * Math.PI * 50;
    const aLen = (appsB / total) * C, sLen = (sysB / total) * C;
    $("#ringSys").style.strokeDasharray = `${sLen + aLen} ${C}`;
    $("#ringApps").style.strokeDasharray = `${aLen} ${C}`;
    $("#storagePct").textContent = Math.round((s.used / total) * 100) + "%";
    $("#stApps").textContent = fmtBytes(appsB);
    $("#stSys").textContent = fmtBytes(sysB);
    $("#stFree").textContent = fmtBytes(s.free);
    $("#storageTotal").innerHTML = `<b>${fmtBytes(s.free)}</b> free of ${fmtBytes(s.total)} flash`;

    // system
    $("#sysTemp").textContent = sys.temperature == null ? "–" : sys.temperature.toFixed(1) + " °C";
    $("#sysUptime").textContent = fmtUptime(sys.uptime);
    $("#sysIp").textContent = wifi.ip || location.hostname;
    $("#sysRssi").textContent = wifi.rssi == null ? "–" : `${wifi.rssi} dBm`;
    const mem = sys.memory;
    $("#memText").textContent = `${fmtBytes(mem.used)} / ${fmtBytes(mem.total)}`;
    $("#memBar").style.width = Math.min(100, (mem.used / mem.total) * 100) + "%";
    $("#sysFoot").textContent = `PicoOS ${sys.version} · MicroPython ${sys.micropython} · ${Math.round(sys.cpu_freq / 1e6)} MHz`;

    // location / tz line
    const loc = [time.city, time.country].filter(Boolean).join(", ");
    $("#clockLoc").textContent = time.mode === "manual" ? "Manual time zone" : loc || "Location unknown";
    const off = time.offset / 3600;
    const offStr = "UTC" + (off >= 0 ? "+" : "−") + Math.abs(off).toString().replace(".5", ":30").replace(".75", ":45");
    $("#clockTz").textContent = `${time.tz} · ${offStr}` + (time.synced ? "" : " · not synced yet");
    $("#syncDot").classList.toggle("ok", !!time.synced);
  }

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function tick() {
    if (!S.clock) return;
    const now = S.clock.unix + S.clock.offset + (performance.now() - S.clock.at) / 1000;
    const d = new Date(Math.floor(now) * 1000);
    let h = d.getUTCHours();
    const m = d.getUTCMinutes(), s = d.getUTCSeconds();
    const h12 = ls.get("clock12", false);
    let suffix = "";
    if (h12) { suffix = h >= 12 ? " PM" : " AM"; h = h % 12 || 12; }
    $("#clockHM").textContent = `${h12 ? h : String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    $("#clockS").textContent = String(s).padStart(2, "0") + suffix;
    $("#clockDate").textContent = `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  // ------------------------------------------------------------------ apps
  function appIconHTML(app, srcUrl) {
    const [c1, c2] = colorsFor(app.id, app.color);
    let inner;
    if (srcUrl) inner = `<img src="${esc(srcUrl)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc((app.name || "?")[0].toUpperCase())}'))">`;
    else if (isEmoji(app.icon)) inner = esc(app.icon);
    else inner = esc((app.name || app.id || "?")[0].toUpperCase());
    return `<div class="app-icon" style="--c1:${c1};--c2:${c2}">${inner}</div>`;
  }
  const appUrl = (a) => `${location.protocol}//${location.hostname}:${a.port}/`;

  function renderApps() {
    const grid = $("#appGrid");
    $("#appCount").textContent = S.apps.length;
    $("#appsEmpty").hidden = S.apps.length > 0;
    grid.innerHTML = S.apps.map((a) => `
      <a class="app-tile ${a.enabled === false ? "disabled" : ""}" href="${a.enabled === false ? "#" : appUrl(a)}" target="_blank" rel="noopener" data-id="${esc(a.id)}">
        <button class="btn ghost app-more" data-more="${esc(a.id)}" aria-label="More options for ${esc(a.name)}"><span class="ico">${icon("more")}</span></button>
        ${appIconHTML(a, a.has_icon_file ? `/api/apps/${encodeURIComponent(a.id)}/icon?v=${encodeURIComponent(a.version)}` : null)}
        <div class="app-name">${esc(a.name)}</div>
        <div class="app-meta"><span class="dot ${a.running ? "ok" : ""}"></span>${a.enabled === false ? "Stopped" : ":" + a.port}</div>
      </a>`).join("");
  }

  $("#appGrid").addEventListener("click", (e) => {
    const more = e.target.closest("[data-more]");
    if (more) {
      e.preventDefault(); e.stopPropagation();
      showMenu(more.dataset.more, more.getBoundingClientRect());
      return;
    }
    const tile = e.target.closest(".app-tile");
    if (tile && tile.classList.contains("disabled")) { e.preventDefault(); showDetails(tile.dataset.id); }
  });
  $("#appGrid").addEventListener("contextmenu", (e) => {
    const tile = e.target.closest(".app-tile");
    if (!tile) return;
    e.preventDefault();
    showMenu(tile.dataset.id, { left: e.clientX, bottom: e.clientY, right: e.clientX });
  });

  function showMenu(id, rect) {
    const a = S.apps.find((x) => x.id === id);
    if (!a) return;
    const m = $("#ctxMenu");
    m.innerHTML = `
      <button data-act="open"><span class="ico">${icon("external")}</span>Open</button>
      <button data-act="path"><span class="ico">${icon("grid")}</span>Open inside dashboard port</button>
      <button data-act="info"><span class="ico">${icon("info")}</span>Details</button>
      <button data-act="toggle"><span class="ico">${icon(a.enabled === false ? "play" : "pause")}</span>${a.enabled === false ? "Start" : "Stop"}</button>
      <hr><button data-act="remove" class="danger"><span class="ico">${icon("trash")}</span>Uninstall</button>`;
    m.hidden = false;
    const w = m.offsetWidth, h = m.offsetHeight;
    let x = Math.min(rect.right - w, window.innerWidth - w - 8); x = Math.max(8, x);
    let y = rect.bottom + 6; if (y + h > window.innerHeight - 8) y = Math.max(8, (rect.top ?? rect.bottom) - h - 6);
    m.style.left = x + "px"; m.style.top = y + "px";
    m.onclick = (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      m.hidden = true;
      appAction(a, b.dataset.act);
    };
  }

  async function appAction(a, act) {
    if (act === "open") window.open(appUrl(a), "_blank", "noopener");
    else if (act === "path") window.open(`/apps/${encodeURIComponent(a.id)}/`, "_blank", "noopener");
    else if (act === "info") showDetails(a.id);
    else if (act === "toggle") {
      try {
        await api(`/api/apps/${encodeURIComponent(a.id)}/enable`, { method: "POST", json: { enabled: a.enabled === false } });
        toast(`${a.name} ${a.enabled === false ? "started" : "stopped"}`);
      } catch (e) { toast(e.message, "error"); }
      refresh();
    } else if (act === "remove") {
      if (!confirm(`Uninstall "${a.name}"? Its files and saved data will be deleted.`)) return;
      try {
        await api(`/api/apps/${encodeURIComponent(a.id)}`, { method: "DELETE" });
        toast(`${a.name} uninstalled`);
      } catch (e) { toast(e.message, "error"); }
      closeModal($("#detailModal"));
      refresh();
    }
  }

  function showDetails(id) {
    const a = S.apps.find((x) => x.id === id);
    if (!a) return;
    const src = { store: "PicoOS App Store", picoos: "PicoOS App Store", github: "Open source on GitHub", community: "Community (GitHub)", upload: "Uploaded by you" }[a.source] || a.source;
    $("#detailBody").innerHTML = `
      <div class="sheet-head"><div class="detail-top">${appIconHTML(a, a.has_icon_file ? `/api/apps/${encodeURIComponent(a.id)}/icon` : null)}
        <div><h2>${esc(a.name)}</h2><div class="muted">v${esc(a.version)}${a.author ? " · " + esc(a.author) : ""}</div></div></div>
        <button class="btn ghost icon-only" data-close aria-label="Close"><span class="ico">${icon("x")}</span></button></div>
      ${a.description ? `<p>${esc(a.description)}</p>` : ""}
      <dl class="kv">
        <dt>Address</dt><dd><a href="${appUrl(a)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(appUrl(a))}</a></dd>
        <dt>Status</dt><dd>${a.enabled === false ? "Stopped" : a.running ? "Running" : "Not running"}</dd>
        <dt>Size</dt><dd>${fmtBytes(a.size)}</dd>
        <dt>Source</dt><dd>${esc(src)}${a.repo ? ` · <a href="https://github.com/${esc(a.repo)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(a.repo)}</a>` : ""}</dd>
        <dt>Category</dt><dd>${esc(a.category || "–")}</dd>
        ${a.license ? `<dt>License</dt><dd>${esc(a.license)}</dd>` : ""}
        ${a.source === "github" || a.source === "community" ? `<dt>Version</dt><dd>commit ${esc(a.version)}</dd>` : ""}
        ${a.backend ? `<dt>Backend</dt><dd>${esc(a.backend)} (MicroPython)</dd>` : ""}
      </dl>
      <div class="detail-actions">
        <button class="btn primary" data-act="open" ${a.enabled === false ? "disabled" : ""}><span class="ico">${icon("external")}</span>Open</button>
        <button class="btn glass" data-act="toggle"><span class="ico">${icon(a.enabled === false ? "play" : "pause")}</span>${a.enabled === false ? "Start" : "Stop"}</button>
        <button class="btn danger-ghost" data-act="remove"><span class="ico">${icon("trash")}</span>Uninstall</button>
      </div>`;
    $("#detailBody").onclick = (e) => {
      const b = e.target.closest("[data-act]");
      if (b) { appAction(a, b.dataset.act); if (b.dataset.act === "toggle") closeModal($("#detailModal")); }
    };
    openModal("detailModal");
  }

  // ------------------------------------------------------------ installing
  /**
   * Install a package on the Pico.
   * meta: { id, name, version, description, icon, ... }
   * files: [{ path, size, get: async () => Blob }]
   */
  async function installPackage(meta, files, onProgress = () => {}) {
    const size = files.reduce((n, f) => n + (f.size || 0), 0);
    await api("/api/apps/install/begin", { method: "POST", json: { ...meta, size, files: files.length } });
    let done = 0;
    try {
      for (const f of files) {
        onProgress(done / size, `Downloading ${f.path}`);
        const blob = await f.get();
        onProgress(done / size, `Uploading ${f.path}`);
        await api(`/api/apps/install/file?id=${encodeURIComponent(meta.id)}&path=${encodeURIComponent(f.path)}`, { method: "PUT", body: blob });
        done += f.size || blob.size;
        onProgress(Math.min(1, done / (size || 1)), `Installed ${f.path}`);
      }
      onProgress(1, "Finishing…");
      const r = await api("/api/apps/install/commit", { method: "POST", json: { id: meta.id } });
      return r.app;
    } catch (e) {
      api("/api/apps/install/abort", { method: "POST", json: { id: meta.id } }).catch(() => {});
      throw e;
    }
  }

  // --------------------------------------------------------------- store
  const settings = () => (S.status && S.status.settings) || {};
  const rawBase = (repo, branch) => `https://raw.githubusercontent.com/${repo}/${branch}`;
  const WEB_EXT = /\.(html?|css|m?js|json|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|txt|wasm|mp3|wav|ogg|webmanifest|csv|xml|gz|py|md)$/i;

  // The catalog lists PicoOS apps (store/apps/ in the store repo) and open-source
  // apps that live in their own GitHub repos (pinned to a commit, see tools/update_store.py).
  async function loadCatalog(force) {
    const { store_repo: repo = "GokalpHizmetleri/PicoOS", store_branch: branch = "main" } = settings();
    const key = `catalog2:${repo}@${branch}`;
    const cached = ls.get(key);
    if (!force && cached && Date.now() - cached.t < 10 * 60e3) return cached.d;
    const r = await fetch(`${rawBase(repo, branch)}/store/catalog.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`Catalog not found (${r.status}) in ${repo}@${branch}`);
    const cat = await r.json();
    const apps = (cat.apps || []).map((a) => {
      const base = a.base || `${rawBase(repo, branch)}/${a.path}/`;
      return {
        ...a,
        source: a.source === "github" ? "github" : "picoos",
        repo: a.repo || repo,
        homepage: a.homepage || `https://github.com/${repo}/tree/${branch}/${a.path}`,
        base,
        iconUrl: a.icon && a.icon.includes(".") ? base + a.icon : null,
      };
    });
    const d = { apps, updated: cat.updated };
    ls.set(key, { t: Date.now(), d });
    return d;
  }
  const fmtStars = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));

  async function loadCommunity(force) {
    const cached = ls.get("community");
    if (!force && cached && Date.now() - cached.t < 30 * 60e3) return cached.d;
    const r = await fetch("https://api.github.com/search/repositories?q=topic:picoos-app&sort=updated&order=desc&per_page=24", { headers: { Accept: "application/vnd.github+json" } });
    if (r.status === 403) throw new Error("GitHub rate limit reached, try again later");
    if (!r.ok) throw new Error(`GitHub search failed (${r.status})`);
    const res = await r.json();
    const out = [];
    await Promise.all((res.items || []).slice(0, 20).map(async (repo) => {
      try {
        const branch = repo.default_branch;
        const base = rawBase(repo.full_name, branch);
        let man = {};
        const mr = await fetch(`${base}/picoos.json`);
        if (mr.ok) man = await mr.json();
        const root = (man.root || "").replace(/^\/+|\/+$/g, "");
        const tr = await fetch(`https://api.github.com/repos/${repo.full_name}/git/trees/${branch}?recursive=1`);
        if (!tr.ok) return;
        const tree = await tr.json();
        const prefix = root ? root + "/" : "";
        const files = (tree.tree || [])
          .filter((t) => t.type === "blob" && t.path.startsWith(prefix))
          .map((t) => ({ path: t.path.slice(prefix.length), size: t.size, full: t.path }))
          .filter((f) => WEB_EXT.test(f.path) && !/(^|\/)\./.test(f.path) && !/^(README|LICENSE|CHANGELOG)/i.test(f.path) && f.path !== "picoos.json");
        const entry = man.entry || "index.html";
        if (!files.some((f) => f.path === entry)) return;
        const size = files.reduce((n, f) => n + f.size, 0);
        if (size > 1.5 * 1048576) return; // way too big for a Pico
        out.push({
          id: slug(man.id || repo.name),
          name: man.name || repo.name,
          version: man.version || (repo.pushed_at || "").slice(0, 10),
          description: man.description || repo.description || "",
          author: man.author || repo.owner.login,
          category: man.category || "Community",
          icon: man.icon || "",
          color: man.color || "",
          entry, backend: man.backend || "", spa: !!man.spa,
          size, files: files.map(({ path, size }) => ({ path, size })),
          stars: repo.stargazers_count,
          repo: repo.full_name, homepage: repo.html_url,
          source: "community",
          iconUrl: man.icon && man.icon.includes(".") ? `${base}/${prefix}${man.icon}` : null,
          base: base + "/" + prefix,
        });
      } catch { /* skip broken repos */ }
    }));
    out.sort((a, b) => b.stars - a.stars);
    const d = { apps: out };
    ls.set("community", { t: Date.now(), d });
    return d;
  }

  async function openStore() {
    openModal("storeModal");
    await renderStore();
  }

  async function renderStore(force) {
    const grid = $("#storeGrid"), msg = $("#storeMsg");
    msg.hidden = true;
    const tab = S.storeTab;
    $$("#storeTabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    const raw = tab === "community" ? S.community : S.catalog;
    if (!raw || force) {
      grid.innerHTML = Array(6).fill('<div class="skeleton"></div>').join("");
      $("#storeCats").innerHTML = "";
      try {
        if (tab === "community") S.community = await loadCommunity(force);
        else S.catalog = await loadCatalog(force);
      } catch (e) {
        grid.innerHTML = "";
        msg.hidden = false;
        msg.innerHTML = `<div class="ico big">${icon("alert")}</div><p>${esc(e.message)}</p><p class="muted">The App Store needs your browser to have internet access (GitHub).</p><button class="btn glass" id="storeRetry">${icon("refresh").replace("<svg", '<svg width="16" height="16"')} Retry</button>`;
        $("#storeRetry").onclick = () => renderStore(true);
        return;
      }
      return renderStore();
    }
    const data = raw;
    const list = tab === "github" ? raw.apps.filter((a) => a.source === "github")
      : tab === "picoos" ? raw.apps.filter((a) => a.source === "picoos") : raw.apps;
    const cats = ["All", ...new Set(list.map((a) => a.category || "Other"))];
    if (!cats.includes(S.storeCat)) S.storeCat = "All";
    $("#storeCats").innerHTML = cats.map((c) => `<button class="chip ${c === S.storeCat ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    const total = S.status ? S.status.system.storage.total : 0;
    $("#storeFree").innerHTML = `${list.length} apps · <b>${fmtBytes(S.free)}</b> free on your Pico` + (tab !== "community" && data.updated ? ` · catalog updated ${esc(new Date(data.updated).toLocaleDateString())}` : "") + (tab === "community" ? ` · public GitHub repos tagged <code>picoos-app</code>` : "");
    const q = $("#storeSearch").value.trim().toLowerCase();
    const shown = list.filter((a) => (S.storeCat === "All" || (a.category || "Other") === S.storeCat) && (!q || `${a.name} ${a.description} ${a.author}`.toLowerCase().includes(q)));
    if (!shown.length) {
      grid.innerHTML = "";
      msg.hidden = false;
      msg.innerHTML = tab === "community" && !list.length
        ? `<p>No community apps found yet.</p><p class="muted">Publish yours: add the <code>picoos-app</code> topic to a public GitHub repo with an index.html.</p>`
        : `<p>No apps match your search.</p>`;
      return;
    }
    grid.innerHTML = shown.map((a) => {
      const inst = S.apps.find((x) => x.id === a.id);
      const cost = (a.files || []).reduce((n, f) => n + diskCost(f.size), 0) || a.size;
      const reclaim = inst ? inst.size : 0;
      const fits = cost <= S.free + reclaim;
      const tooBig = total && cost > total;
      const busy = S.installing[a.id];
      let btn;
      if (busy) btn = `<div class="mini-progress"><i style="width:${Math.round(busy * 100)}%"></i></div>`;
      else if (inst && inst.version === a.version) btn = `<button class="btn glass sm" data-openapp="${esc(a.id)}">Open</button>`;
      else if (!fits) btn = `<button class="btn glass sm" disabled>${tooBig ? "Too big" : "No space"}</button>`;
      else btn = `<button class="btn primary sm" data-install="${esc(a.id)}">${inst ? "Update" : "Install"}</button>`;
      const gh = a.source === "github" || a.source === "community";
      const by = a.source === "picoos" ? `PicoOS · v${esc(a.version)}`
        : `<a href="${esc(a.homepage || "https://github.com/" + a.repo)}" target="_blank" rel="noopener" class="store-link">${esc(a.repo)}</a>`;
      return `<article class="store-card">
        <div class="store-top">${appIconHTML(a, a.iconUrl)}
          <div style="min-width:0"><div class="store-title">${esc(a.name)}</div><div class="store-by">${by}</div></div></div>
        <p class="store-desc">${esc(a.description)}</p>
        <div class="store-foot">
          <div class="tags"><span class="tag ${fits ? "ok" : "bad"}" title="Download size">${fmtBytes(a.size)}</span>${gh ? `<span class="tag gh" title="Open source on GitHub">${icon("github").replace("<svg", '<svg width="11" height="11"')} ★ ${fmtStars(a.stars || 0)}</span>` : '<span class="tag pico">Made for PicoOS</span>'}${a.license ? `<span class="tag">${esc(a.license)}</span>` : ""}${a.internet ? '<span class="tag warn" title="Loads content from the internet when used">Needs internet</span>' : ""}${a.backend ? '<span class="tag">Python backend</span>' : ""}${inst ? `<span class="tag">${inst.version === a.version ? "Installed" : "Update available"}</span>` : ""}</div>
          <div style="min-width:84px;display:flex;justify-content:flex-end">${btn}</div>
        </div></article>`;
    }).join("");
  }

  $("#storeTabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    S.storeTab = t.dataset.tab; S.storeCat = "All";
    renderStore();
  });
  $("#storeCats").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    S.storeCat = c.dataset.cat;
    renderStore();
  });
  $("#storeSearch").addEventListener("input", () => renderStore());
  $("#storeGrid").addEventListener("click", async (e) => {
    const o = e.target.closest("[data-openapp]");
    if (o) { const a = S.apps.find((x) => x.id === o.dataset.openapp); if (a) window.open(appUrl(a), "_blank", "noopener"); return; }
    const b = e.target.closest("[data-install]");
    if (!b) return;
    const list = (S.storeTab === "community" ? S.community : S.catalog).apps;
    const a = list.find((x) => x.id === b.dataset.install);
    if (!a) return;
    S.installing[a.id] = 0.01;
    renderStore();
    const urlFor = (p) => a.base + p.split("/").map(encodeURIComponent).join("/");
    const files = (a.files || []).map((f) => ({
      path: f.path, size: f.size,
      get: async () => {
        const r = await fetch(urlFor(f.src || f.path), { cache: "no-store" });
        if (!r.ok) throw new Error(`Download failed: ${f.path} (${r.status})`);
        return r.blob();
      },
    }));
    try {
      const meta = { id: a.id, name: a.name, version: a.version, description: a.description, author: a.author, icon: a.icon, color: a.color, category: a.category, entry: a.entry, backend: a.backend, spa: a.spa, source: a.source, repo: a.repo, homepage: a.homepage, license: a.license, internet: !!a.internet };
      const app = await installPackage(meta, files, (p) => { S.installing[a.id] = Math.max(0.03, p); renderStore(); });
      toast(`${a.name} installed on port ${app.port}`);
    } catch (err) {
      toast(`${a.name}: ${err.message}`, "error", 6000);
    }
    delete S.installing[a.id];
    await refresh();
    renderStore();
  });

  // --------------------------------------------------------------- upload
  const EMOJIS = ["🚀", "🧩", "🎮", "📝", "🎨", "📊", "⏱️", "🌦️", "💡", "🔧", "🎵", "📷"];
  const U = { files: [], icon: "🧩" };

  function openUpload() {
    resetUpload();
    openModal("uploadModal");
  }
  function resetUpload() {
    U.files = []; U.icon = "🧩";
    $("#uploadFiles").hidden = true;
    $("#uploadForm").hidden = true;
    $("#dropZone").hidden = false;
    $("#upProgress").hidden = true;
    $("#upName").value = ""; $("#upId").value = ""; $("#upDesc").value = "";
    $("#upId").dataset.touched = "";
  }

  async function readEntry(entry, prefix = "") {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      return [{ path: prefix + entry.name, file }];
    }
    const reader = entry.createReader();
    let all = [], batch;
    do {
      batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      all = all.concat(batch);
    } while (batch.length);
    const out = [];
    for (const e of all) out.push(...(await readEntry(e, prefix + entry.name + "/")));
    return out;
  }

  // Minimal ZIP reader (stored + deflate) using the browser's DecompressionStream.
  async function unzip(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const dv = new DataView(buf.buffer);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Not a valid .zip file");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Corrupt .zip directory");
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commLen;
      if (name.endsWith("/")) continue;
      const lNameLen = dv.getUint16(local + 26, true), lExtra = dv.getUint16(local + 28, true);
      const start = local + 30 + lNameLen + lExtra;
      const data = buf.subarray(start, start + csize);
      let blob;
      if (method === 0) blob = new Blob([data]);
      else if (method === 8) {
        if (!("DecompressionStream" in window)) throw new Error("This browser cannot unpack .zip files - upload the files instead");
        blob = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
      } else throw new Error(`Unsupported compression in ${name}`);
      out.push({ path: name, file: new File([blob], name.split("/").pop()) });
    }
    return out;
  }

  function normalizeFiles(list) {
    // drop hidden / system files, strip a common top-level folder
    list = list.filter((f) => !f.path.split("/").some((s) => s.startsWith(".") || s === "__MACOSX") && !/(^|\/)(Thumbs\.db|desktop\.ini)$/i.test(f.path));
    const tops = new Set(list.map((f) => (f.path.includes("/") ? f.path.split("/")[0] : "")));
    if (tops.size === 1 && !tops.has("")) {
      const t = [...tops][0] + "/";
      list = list.map((f) => ({ ...f, path: f.path.slice(t.length) }));
    }
    return list;
  }

  async function acceptFiles(raw) {
    try {
      let list = [];
      for (const r of raw) {
        if (/\.zip$/i.test(r.path) && raw.length === 1) list.push(...(await unzip(r.file)));
        else list.push(r);
      }
      list = normalizeFiles(list);
      if (!list.some((f) => /\.html?$/i.test(f.path))) throw new Error("Your app needs at least one .html file");
      U.files = list;
      showUploadForm();
    } catch (e) { toast(e.message, "error"); }
  }

  function showUploadForm() {
    $("#dropZone").hidden = true;
    const box = $("#uploadFiles");
    box.hidden = false;
    box.innerHTML = U.files.map((f) => `<div><span>${esc(f.path)}</span><span>${fmtBytes(f.file.size)}</span></div>`).join("");
    const htmls = U.files.filter((f) => /\.html?$/i.test(f.path)).map((f) => f.path).sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.length - b.length));
    $("#upEntry").innerHTML = htmls.map((h) => `<option>${esc(h)}</option>`).join("");
    // guess a name from <title> of the entry page
    const entry = U.files.find((f) => f.path === htmls[0]);
    entry.file.text().then((t) => {
      const m = t.match(/<title>([^<]{1,40})<\/title>/i);
      const name = (m ? m[1] : htmls[0].replace(/\.html?$/i, "").replace(/[-_]/g, " ")).trim();
      if (!$("#upName").value) { $("#upName").value = name === "index" ? "My App" : name; syncId(); }
    });
    $("#upIcons").innerHTML = EMOJIS.map((e) => `<button type="button" class="${e === U.icon ? "active" : ""}" data-emoji="${e}">${e}</button>`).join("");
    $("#uploadForm").hidden = false;
    updateFit();
  }
  function syncId() { if (!$("#upId").dataset.touched) $("#upId").value = slug($("#upName").value); updateFit(); }
  function updateFit() {
    const cost = U.files.reduce((n, f) => n + diskCost(f.file.size), 0);
    const size = U.files.reduce((n, f) => n + f.file.size, 0);
    const existing = S.apps.find((a) => a.id === $("#upId").value);
    const free = S.free + (existing ? existing.size : 0);
    const ok = cost <= free;
    const el = $("#upFit");
    el.className = "fit" + (ok ? "" : " bad");
    el.textContent = `${U.files.length} file${U.files.length > 1 ? "s" : ""}, ${fmtBytes(size)} (≈${fmtBytes(cost)} on flash) · ${fmtBytes(free)} free` + (ok ? " — fits" : " — not enough space") + (existing ? ` · replaces installed "${existing.name}"` : "");
    $("#upSubmit").disabled = !ok;
  }

  $("#upName").addEventListener("input", syncId);
  $("#upId").addEventListener("input", () => { $("#upId").dataset.touched = "1"; updateFit(); });
  $("#upIcons").addEventListener("click", (e) => {
    const b = e.target.closest("[data-emoji]");
    if (!b) return;
    U.icon = b.dataset.emoji;
    $$("#upIcons button").forEach((x) => x.classList.toggle("active", x === b));
  });
  $("#upReset").addEventListener("click", resetUpload);
  $("#pickFiles").addEventListener("click", () => $("#fileInput").click());
  $("#pickFolder").addEventListener("click", () => $("#folderInput").click());
  $("#fileInput").addEventListener("change", (e) => { acceptFiles(Array.from(e.target.files).map((f) => ({ path: f.name, file: f }))); e.target.value = ""; });
  $("#folderInput").addEventListener("change", (e) => { acceptFiles(Array.from(e.target.files).map((f) => ({ path: f.webkitRelativePath || f.name, file: f }))); e.target.value = ""; });
  const dz = $("#dropZone");
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove("over")));
  dz.addEventListener("drop", async (e) => {
    e.preventDefault();
    const items = Array.from(e.dataTransfer.items || []);
    let raw = [];
    if (items.length && items[0].webkitGetAsEntry) {
      for (const it of items) { const en = it.webkitGetAsEntry(); if (en) raw.push(...(await readEntry(en))); }
    } else raw = Array.from(e.dataTransfer.files).map((f) => ({ path: f.name, file: f }));
    acceptFiles(raw);
  });

  $("#uploadForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#upId").value.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(id)) { toast("App ID may only contain a-z, 0-9, - and _", "error"); return; }
    const existing = S.apps.find((a) => a.id === id);
    if (existing && !confirm(`"${existing.name}" is already installed with this ID. Replace it?`)) return;
    const prog = $("#upProgress");
    prog.hidden = false;
    $("#upSubmit").disabled = true;
    const meta = { id, name: $("#upName").value.trim() || id, description: $("#upDesc").value.trim(), icon: U.icon, entry: $("#upEntry").value, version: "1.0.0", source: "upload", category: "My apps", author: "You" };
    const iconFile = U.files.find((f) => /^(icon|favicon)\.(svg|png)$/i.test(f.path));
    if (iconFile) meta.icon = iconFile.path;
    const pyBackend = U.files.find((f) => f.path === "backend.py");
    if (pyBackend) meta.backend = "backend.py";
    try {
      const app = await installPackage(meta, U.files.map((f) => ({ path: f.path, size: f.file.size, get: async () => f.file })), (p, label) => {
        prog.querySelector("i").style.width = Math.round(p * 100) + "%";
        prog.querySelector("span").textContent = `${Math.round(p * 100)}% · ${label}`;
      });
      toast(`${app.name} installed on port ${app.port}`);
      closeModal($("#uploadModal"));
      refresh();
    } catch (err) {
      toast(err.message, "error", 6000);
      prog.hidden = true;
      $("#upSubmit").disabled = false;
    }
  });

  // -------------------------------------------------------------- settings
  const WALLS = { aurora: ["#4f46e5", "#06b6d4", "#c026d3"], ocean: ["#0369a1", "#14b8a6", "#1d4ed8"], sunset: ["#e11d48", "#f59e0b", "#7c3aed"], forest: ["#15803d", "#65a30d", "#0f766e"], midnight: ["#1e293b", "#312e81", "#0f172a"], candy: ["#ec4899", "#8b5cf6", "#22d3ee"] };
  let pickedWall = null;

  async function openSettings(pane) {
    const s = settings();
    const g = $("#formGeneral");
    g.device_name.value = s.device_name || "";
    g.hostname.value = s.hostname || "pico";
    pickedWall = s.wallpaper || "aurora";
    $("#wallPick").innerHTML = Object.entries(WALLS).map(([k, c]) => `<button type="button" title="${k}" data-wall="${k}" class="${k === pickedWall ? "active" : ""}" style="background:linear-gradient(135deg,${c[0]},${c[1]} 55%,${c[2]})"></button>`).join("");
    $("#clock12").checked = ls.get("clock12", false);
    // time
    const t = $("#formTime");
    t.dataset.mode = s.tz_mode || "auto";
    $$("#tzMode button").forEach((b) => b.classList.toggle("active", b.dataset.mode === t.dataset.mode));
    const opts = [];
    for (let m = -720; m <= 840; m += 15) {
      const h = Math.floor(Math.abs(m) / 60), mm = Math.abs(m) % 60;
      opts.push(`<option value="${m}">UTC${m < 0 ? "−" : "+"}${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}</option>`);
    }
    $("#tzOffset").innerHTML = opts.join("");
    $("#tzOffset").value = String(s.tz_offset || 0);
    t.tz_name.value = s.tz_name && s.tz_name !== "UTC" ? s.tz_name : "";
    const tm = S.status.time;
    $("#tzAutoInfo").innerHTML = tm.located || tm.mode === "manual"
      ? `Detected <b>${esc([tm.city, tm.country].filter(Boolean).join(", ") || "unknown")}</b> · ${esc(S.status.time.tz)}<br>Time source: ${esc(tm.source || "–")} · ${tm.synced ? "synchronized" : "not synchronized yet"}`
      : "Location not detected yet. PicoOS asks ip-api.com for the time zone of your internet connection.";
    // store
    const st = $("#formStore");
    st.store_repo.value = s.store_repo || "";
    st.store_branch.value = s.store_branch || "main";
    // network
    const w = S.status.wifi;
    $("#netInfo").innerHTML = `<dt>Network</dt><dd>${esc(w.ssid || "–")}</dd><dt>IP address</dt><dd>${esc(w.ip || "–")}</dd><dt>Signal</dt><dd>${w.rssi == null ? "–" : w.rssi + " dBm"}</dd><dt>MAC</dt><dd>${esc(w.mac || "–")}</dd><dt>Address</dt><dd>http://${esc(S.status.device.hostname)}.local</dd>`;
    // about
    const sys = S.status.system;
    $("#aboutInfo").innerHTML = `<dt>PicoOS</dt><dd>${esc(sys.version)}</dd><dt>MicroPython</dt><dd>${esc(sys.micropython)}</dd><dt>Board</dt><dd>${esc(sys.board)}</dd><dt>CPU</dt><dd>${Math.round(sys.cpu_freq / 1e6)} MHz</dd><dt>Flash</dt><dd>${fmtBytes(sys.storage.total)} user storage</dd><dt>Project</dt><dd><a style="color:var(--accent)" href="https://github.com/${esc(s.store_repo || "GokalpHizmetleri/PicoOS")}" target="_blank" rel="noopener">github.com/${esc(s.store_repo || "GokalpHizmetleri/PicoOS")}</a></dd>`;
    switchPane(pane || "general");
    openModal("settingsModal");
  }
  function switchPane(name) {
    $$("#setTabs button").forEach((b) => b.classList.toggle("active", b.dataset.pane === name));
    $$(".panes .pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === name));
    if (name === "system") loadLogs();
  }
  async function loadLogs() {
    try { const r = await api("/api/logs"); $("#logs").textContent = r.lines.join("\n") || "No log entries"; $("#logs").scrollTop = 1e9; } catch (e) { $("#logs").textContent = e.message; }
  }
  $("#setTabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) switchPane(b.dataset.pane); });
  $("#wallPick").addEventListener("click", (e) => {
    const b = e.target.closest("[data-wall]");
    if (!b) return;
    pickedWall = b.dataset.wall;
    document.body.dataset.wallpaper = pickedWall;
    $$("#wallPick button").forEach((x) => x.classList.toggle("active", x === b));
  });
  async function saveSettings(data, msg = "Settings saved") {
    try {
      const r = await api("/api/settings", { method: "POST", json: data });
      S.status.settings = r.settings;
      toast(r.rebooting ? "Saved — PicoOS is restarting with the new hostname" : msg);
      if (r.rebooting) setTimeout(() => { location.href = `http://${r.settings.hostname}.local/`; }, 9000);
      refresh();
      return r;
    } catch (e) { toast(e.message, "error"); }
  }
  $("#formGeneral").addEventListener("submit", (e) => {
    e.preventDefault();
    ls.set("clock12", $("#clock12").checked);
    const f = e.target;
    saveSettings({ device_name: f.device_name.value.trim() || "PicoOS", hostname: f.hostname.value.trim().toLowerCase(), wallpaper: pickedWall });
  });
  $("#tzMode").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $("#formTime").dataset.mode = b.dataset.mode;
    $$("#tzMode button").forEach((x) => x.classList.toggle("active", x === b));
  });
  $("#formTime").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const mode = f.dataset.mode;
    const data = { tz_mode: mode };
    if (mode === "manual") { data.tz_offset = parseInt($("#tzOffset").value, 10); data.tz_name = f.tz_name.value.trim() || $("#tzOffset").selectedOptions[0].textContent; }
    saveSettings(data, "Time zone saved");
  });
  $("#btnSyncTime").addEventListener("click", async () => {
    try { await api("/api/time/sync", { method: "POST" }); toast("Time synchronized"); refresh(); } catch (e) { toast(e.message, "error"); }
  });
  $("#formStore").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    await saveSettings({ store_repo: f.store_repo.value.trim() || "GokalpHizmetleri/PicoOS", store_branch: f.store_branch.value.trim() || "main" }, "App Store source saved");
    S.catalog = null;
  });
  $("#btnScan").addEventListener("click", async () => {
    const sel = $("#wifiSsid");
    sel.innerHTML = "<option>Scanning…</option>";
    try {
      const r = await api("/api/wifi/scan");
      sel.innerHTML = r.networks.map((n) => `<option value="${esc(n.ssid)}">${esc(n.ssid)} (${n.rssi} dBm${n.secure ? ", secured" : ", open"})</option>`).join("") || "<option value=''>No networks found</option>";
    } catch (e) { sel.innerHTML = "<option value=''>Scan failed</option>"; toast(e.message, "error"); }
  });
  $("#formWifi").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ssid = $("#wifiSsid").value;
    if (!ssid) { toast("Scan and choose a network first", "error"); return; }
    if (!confirm(`Switch PicoOS to "${ssid}"? It will restart. If it can't connect, the PicoOS-Setup network appears again.`)) return;
    try { await api("/api/wifi", { method: "POST", json: { ssid, password: $("#wifiPass").value } }); toast("Restarting on the new network…"); } catch (er) { toast(er.message, "error"); }
  });
  $("#btnForget").addEventListener("click", async () => {
    if (!confirm("Forget the Wi-Fi network? PicoOS restarts into setup mode and opens the PicoOS-Setup access point.")) return;
    try { await api("/api/wifi/forget", { method: "POST" }); toast("Restarting into setup mode…"); } catch (e) { toast(e.message, "error"); }
  });
  $("#btnReboot").addEventListener("click", async () => {
    if (!confirm("Restart PicoOS now?")) return;
    try { await api("/api/system/reboot", { method: "POST" }); toast("Restarting… the page reconnects automatically"); } catch (e) { toast(e.message, "error"); }
  });

  // ------------------------------------------------------------------ boot
  $("#btnStore").addEventListener("click", openStore);
  $("#btnUpload").addEventListener("click", openUpload);
  $("#btnSettings").addEventListener("click", () => S.status && openSettings());
  $("#btnRefresh").addEventListener("click", () => { refresh(); toast("Refreshed"); });
  $("#netPill").addEventListener("click", () => S.status && openSettings("network"));
  paintIcons();
  refresh().then(() => {
    const h = location.hash.slice(1);
    if (h === "store") openStore();
    else if (h === "upload") openUpload();
    else if (h.startsWith("settings")) openSettings(h.split(":")[1]);
  });
  setInterval(refresh, 10000);
  setInterval(tick, 250);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();
