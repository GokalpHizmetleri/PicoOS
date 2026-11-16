/*
 * PicoOS - "Explore GitHub": a live App Store that runs entirely in the browser.
 *
 * 1. Searches GitHub (api.github.com/search/repositories) for repositories.
 * 2. Checks every result for a web app that can run on a Pico 2 W:
 *      - file list from jsDelivr's free API (no GitHub rate limit),
 *      - finds index.html in the repo root, docs/, public/, dist/, www/, ... or on gh-pages,
 *      - reads the start page from raw.githubusercontent.com and rejects apps that need a
 *        build step (TypeScript/JSX/Vue entry, Jekyll/template syntax) or miss their
 *        own scripts/styles,
 *      - keeps only browser files and checks the size against the Pico's flash.
 * 3. Installs by downloading each file from raw.githubusercontent.com and uploading it to PicoOS.
 *
 * The Pico itself never talks to GitHub - all heavy lifting happens here.
 */
(() => {
  "use strict";
  const D = window.PicoOSDash;
  const { S, $, esc, icon, fmtBytes, diskCost, slug, ls, toast } = D;

  const PRESETS = [
    { id: "popular", label: "Popular", q: "language:HTML stars:>200" },
    { id: "games", label: "Games", q: "topic:html5-game" },
    { id: "browser-games", label: "Browser games", q: "topic:browser-game" },
    { id: "js-games", label: "JavaScript games", q: "topic:javascript-game" },
    { id: "vanilla", label: "Vanilla JS", q: "topic:vanilla-javascript stars:>20" },
    { id: "projects", label: "Mini projects", q: "topic:javascript-projects stars:>5" },
    { id: "creative", label: "Creative coding", q: "topic:creative-coding" },
    { id: "webgl", label: "Canvas & WebGL", q: "topic:webgl language:JavaScript stars:>30" },
    { id: "tools", label: "Tools", q: "topic:tool language:HTML" },
    { id: "pwa", label: "PWA", q: "topic:pwa language:HTML" },
    { id: "picoos", label: "PicoOS apps", q: "topic:picoos-app" },
  ];
  const BASE_Q = " fork:false archived:false size:<60000";
  const MAX_SIZE = 2 * 1024 * 1024;   // larger apps can't fit next to PicoOS anyway
  const MAX_FILES = 150;
  const CONCURRENCY = 6;
  const ROOTS = ["", "docs", "public", "dist", "build", "www", "site", "app", "web", "html", "src", "demo", "example", "client", "static"];
  const WEB_EXT = /\.(html?|css|m?js|json|svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|txt|wasm|mp3|wav|ogg|m4a|mp4|webm|webmanifest|csv|xml|glsl|frag|vert|obj|gltf|glb|bin|ttf)$/i;
  const SKIP_PATH = /(^|\/)(\.[^/]+|node_modules|__tests__|tests?|spec|cypress|coverage|\.github)(\/|$)/i;
  const SKIP_NAME = /^(package(-lock)?\.json|bower\.json|composer\.json|tsconfig.*\.json|jsconfig\.json|yarn\.lock|.*\.config\.(js|mjs|cjs)|gulpfile\.js|gruntfile\.js|webpack\..*|rollup\..*|license.*|licence.*|readme.*|changelog.*|contributing.*|.*\.min\.js\.map)$/i;
  const WEB_LANGS = new Set(["HTML", "JavaScript", "CSS", null, undefined, "SCSS", "Less", "GLSL", "WebAssembly"]);

  const E = {
    preset: "popular",
    query: "",
    sort: "stars",
    page: 0,
    items: [],
    total: 0,
    seen: new Set(),
    results: new Map(),   // full_name -> analysis
    loading: false,
    error: "",
    autoPages: 0,
    onlyOk: true,
    installing: {},
    gen: 0,
  };

  // ---------------------------------------------------------------- utils
  const ghHeaders = () => {
    const h = { Accept: "application/vnd.github+json" };
    const t = ls.get("ghToken", "");
    if (t) h.Authorization = "Bearer " + t;
    return h;
  };
  const rawUrl = (full, branch, path) => `https://raw.githubusercontent.com/${full}/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const fmtStars = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n || 0));
  const ago = (iso) => {
    const d = (Date.now() - Date.parse(iso)) / 86400e3;
    if (d < 1) return "today";
    if (d < 31) return `${Math.floor(d)}d ago`;
    if (d < 365) return `${Math.floor(d / 30)}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
  };

  // small persistent cache of analysis results (per repo + last push)
  const CACHE_KEY = "ghcache";
  const cache = (() => {
    let mem = ls.get(CACHE_KEY, {}) || {};
    return {
      get: (k) => mem[k],
      set: (k, v) => {
        mem[k] = { ...v, t: Date.now() };
        const keys = Object.keys(mem);
        if (keys.length > 250) keys.sort((a, b) => mem[a].t - mem[b].t).slice(0, keys.length - 250).forEach((x) => delete mem[x]);
        try { ls.set(CACHE_KEY, mem); } catch { mem = {}; }
      },
    };
  })();

  // ------------------------------------------------------------- search
  function buildQuery() {
    if (E.query) return E.query + BASE_Q;
    const p = PRESETS.find((x) => x.id === E.preset) || PRESETS[0];
    return p.q + BASE_Q;
  }

  async function fetchPage() {
    const gen = E.gen;
    E.loading = true;
    E.error = "";
    render();
    const page = E.page + 1;
    const q = buildQuery();
    const sessKey = `ghsearch:${q}:${E.sort}:${page}`;
    let data = null;
    try { data = JSON.parse(sessionStorage.getItem(sessKey) || "null"); } catch { /* ignore */ }
    if (!data || Date.now() - data.t > 15 * 60e3) {
      try {
        const r = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=${E.sort}&order=desc&per_page=30&page=${page}`, { headers: ghHeaders() });
        if (r.status === 403 || r.status === 429) {
          const reset = +r.headers.get("x-ratelimit-reset");
          const wait = reset ? Math.max(1, Math.round(reset - Date.now() / 1000)) : 60;
          throw new Error(`GitHub search limit reached. Try again in ${wait}s, or add a free GitHub token in Settings → App Store for more searches.`);
        }
        if (r.status === 422) throw new Error("GitHub couldn't run this search. Try different words.");
        if (!r.ok) throw new Error(`GitHub search failed (HTTP ${r.status}).`);
        const j = await r.json();
        data = { t: Date.now(), total: j.total_count, items: (j.items || []).map(slim) };
        try { sessionStorage.setItem(sessKey, JSON.stringify(data)); } catch { /* full */ }
      } catch (e) {
        if (gen !== E.gen) return;
        E.loading = false;
        E.error = e.message.includes("Failed to fetch") ? "Can't reach GitHub. The App Store needs internet access in this browser." : e.message;
        render();
        return;
      }
    }
    if (gen !== E.gen) return;
    E.page = page;
    E.total = data.total;
    const fresh = data.items.filter((it) => !E.seen.has(it.full_name));
    fresh.forEach((it) => { E.seen.add(it.full_name); E.items.push(it); });
    E.loading = false;
    render();
    await Promise.all(pool(fresh, CONCURRENCY, async (it) => {
      const res = await analyze(it);
      if (gen !== E.gen) return;
      E.results.set(it.full_name, res);
      scheduleRender();
    }));
    if (gen !== E.gen) return;
    // keep going automatically if few runnable apps were found
    const okCount = E.items.filter((it) => (E.results.get(it.full_name) || {}).ok).length;
    if (E.onlyOk && okCount < 12 && hasMore() && E.autoPages < 3) {
      E.autoPages++;
      fetchPage();
    }
  }

  const slim = (it) => ({
    full_name: it.full_name, name: it.name, owner: it.owner.login, avatar: it.owner.avatar_url,
    description: it.description || "", stars: it.stargazers_count, language: it.language,
    default_branch: it.default_branch, has_pages: it.has_pages, pushed_at: it.pushed_at,
    license: (it.license && it.license.spdx_id !== "NOASSERTION" && it.license.spdx_id) || "",
    html_url: it.html_url, homepage: it.homepage || "", topics: it.topics || [], size: it.size,
  });

  const hasMore = () => E.items.length < Math.min(E.total, 1000) && E.page < 34;

  function pool(items, n, fn) {
    const queue = items.slice();
    const workers = [];
    for (let i = 0; i < Math.min(n, queue.length); i++) {
      workers.push((async () => { while (queue.length) await fn(queue.shift()); })());
    }
    return workers;
  }

  // ------------------------------------------------------------ analysis
  async function listFiles(full, branch) {
    const r = await fetch(`https://data.jsdelivr.com/v1/packages/gh/${full}@${encodeURIComponent(branch)}?structure=flat`);
    if (r.status === 404) return null;
    if (r.status === 403) throw new Error("Repository is too large");
    if (!r.ok) throw new Error(`File list unavailable (${r.status})`);
    const j = await r.json();
    return (j.files || []).map((f) => ({ path: f.name.replace(/^\//, ""), size: f.size }));
  }

  function pickFiles(all, root, extra) {
    const prefix = root ? root + "/" : "";
    const out = [];
    for (const f of all) {
      if (!f.path.startsWith(prefix)) continue;
      const rel = f.path.slice(prefix.length);
      const name = rel.split("/").pop();
      if (!WEB_EXT.test(rel) && !(extra && extra.includes(rel))) continue;
      if (SKIP_PATH.test(rel) || SKIP_NAME.test(name)) continue;
      if (!root && /^(docs|examples?|test|spec)\//i.test(rel) && !/^docs\//i.test(prefix)) continue;
      out.push({ path: rel, size: f.size });
    }
    return out;
  }

  const TAG_REF = /<(?:script|img|source|audio|video|iframe|embed)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']|<link\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi;
  const REMOTE_SCRIPT = /<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\/(?!www\.google-analytics|www\.googletagmanager)[^"']+["']|<link\b[^>]*rel\s*=\s*["']?stylesheet[^>]*href\s*=\s*["'](?:https?:)?\/\/(?!fonts\.googleapis)[^"']+/i;
  const NEEDS_BUILD = /<script\b[^>]*\bsrc\s*=\s*["'][^"']+\.(?:tsx?|jsx|vue|svelte|coffee)["']|src\s*=\s*["']\/src\/(?:main|index)\.|%PUBLIC_URL%|<%[=-]?|\{\{\s*(?:site|page|content)\b|\{%\s*(?:include|block|extends|if|for)\b|^---\s*\n[\s\S]*?\n---/i;

  function resolveRef(ref, entryDir, basePrefix) {
    let p = ref.split("#")[0].split("?")[0];
    if (!p || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(p)) return null;  // external, data:, mailto:...
    if (basePrefix && p.toLowerCase().startsWith(basePrefix.toLowerCase())) p = p.slice(basePrefix.length);
    else if (p.startsWith("/")) p = p.slice(1);
    else p = entryDir + p;
    const parts = [];
    for (const seg of p.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg && seg !== ".") parts.push(seg);
    }
    try { return decodeURIComponent(parts.join("/")); } catch { return parts.join("/"); }
  }

  async function evaluateRoot(repo, branch, all, root, manifest) {
    const entry = (manifest && manifest.entry) || "index.html";
    const prefix = root ? root + "/" : "";
    if (!all.some((f) => f.path === prefix + entry)) return null;
    const extra = manifest && manifest.backend ? [manifest.backend] : null;
    const files = pickFiles(all, root, extra);
    const size = files.reduce((n, f) => n + f.size, 0);
    if (files.length > MAX_FILES) return { ok: false, reason: `Too many files (${files.length})` };
    if (size > MAX_SIZE) return { ok: false, reason: `Too big for a Pico (${fmtBytes(size)})` };
    const r = await fetch(rawUrl(repo.full_name, branch, prefix + entry));
    if (!r.ok) return { ok: false, reason: "Start page could not be downloaded" };
    const html = await r.text();
    if (NEEDS_BUILD.test(html)) return { ok: false, reason: "Needs a build step (source code, not a ready web app)" };
    if (!/<(html|body|script|canvas|div|head)\b/i.test(html)) return { ok: false, reason: "index.html isn't a web page" };
    // Sites made for GitHub Pages often use /<repo>/ as base path.
    const bp = `/${repo.name}/`;
    const refs = [];
    let m;
    TAG_REF.lastIndex = 0;
    while ((m = TAG_REF.exec(html))) refs.push(m[1] || m[2]);
    const basePrefix = refs.some((x) => x.toLowerCase().startsWith(bp.toLowerCase())) ? bp : "";
    const have = new Set(files.map((f) => f.path));
    const entryDir = entry.includes("/") ? entry.slice(0, entry.lastIndexOf("/") + 1) : "";
    const missing = [];
    for (const ref of refs) {
      const p = resolveRef(ref, entryDir, basePrefix);
      if (p == null || have.has(p) || have.has(p.replace(/\/$/, "") + "/index.html")) continue;
      if (/\.(m?js|css)$/i.test(p)) missing.push(p);
    }
    if (missing.length) return { ok: false, reason: `Missing files: ${missing.slice(0, 2).join(", ")}${missing.length > 2 ? "…" : ""}` };
    const iconFile = (manifest && manifest.icon && have.has(manifest.icon) && manifest.icon) ||
      ["favicon.svg", "favicon.png", "icon.svg", "icon.png", "logo.svg", "logo.png", "apple-touch-icon.png", "img/icon.png", "images/icon.png", "assets/icon.png", "assets/favicon.png", "assets/logo.svg", "icons/icon-192.png", "icons/icon-192x192.png"].find((x) => have.has(x)) || "";
    return {
      ok: true, branch, root, entry, files, size, basePrefix,
      internet: REMOTE_SCRIPT.test(html),
      icon: iconFile,
      manifest: manifest || null,
    };
  }

  async function analyze(repo) {
    const key = `${repo.full_name}@${repo.pushed_at}`;
    const hit = cache.get(key);
    if (hit) return hit;
    let res;
    try {
      res = await analyzeUncached(repo);
    } catch (e) {
      res = { ok: false, reason: e.message || "Check failed", transient: true };
    }
    if (!res.transient) cache.set(key, res);
    return res;
  }

  async function analyzeUncached(repo) {
    let branches = [repo.default_branch];
    if (repo.has_pages && repo.default_branch !== "gh-pages") branches.push("gh-pages");
    if (!WEB_LANGS.has(repo.language)) {
      // e.g. TypeScript projects: only a ready-built GitHub Pages branch can run on the Pico.
      if (!repo.has_pages) return { ok: false, reason: `Not a web app (${repo.language})` };
      branches = ["gh-pages"];
    }
    let lastFail = null;
    for (const branch of branches) {
      const all = await listFiles(repo.full_name, branch);
      if (!all) continue;
      let manifest = null;
      if (all.some((f) => f.path === "picoos.json")) {
        try { manifest = await (await fetch(rawUrl(repo.full_name, branch, "picoos.json"))).json(); } catch { manifest = null; }
      }
      const roots = manifest && manifest.root != null ? [String(manifest.root).replace(/^\/+|\/+$/g, "")] : ROOTS;
      for (const root of roots) {
        const res = await evaluateRoot(repo, branch, all, root, manifest);
        if (!res) continue;
        if (res.ok) return res;
        lastFail = lastFail || res;
      }
    }
    return lastFail || { ok: false, reason: "No index.html found" };
  }

  // ------------------------------------------------------------- render
  let renderTimer = 0;
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => { renderTimer = 0; render(); }, 120);
  }

  function chips() {
    $("#storeCats").innerHTML = PRESETS.map((p) => `<button class="chip ${!E.query && p.id === E.preset ? "active" : ""}" data-preset="${p.id}">${esc(p.label)}</button>`).join("") +
      (E.query ? `<button class="chip active" data-clear="1">“${esc(E.query)}” ✕</button>` : "");
  }

  function appIdFor(repo) {
    let id = slug(repo.name);
    const clash = S.apps.find((a) => a.id === id && (!a.repo || a.repo.toLowerCase() !== repo.full_name.toLowerCase()));
    if (clash) id = slug(`${repo.name}-${repo.owner}`);
    return id;
  }

  function render() {
    if (S.storeTab !== "explore") return;
    if (!E.items.length && !E.loading && !E.error && E.page === 0) { fetchPage(); return; }
    chips();
    const grid = $("#storeGrid");
    const total = S.status ? S.status.system.storage.total : 0;
    const checked = E.items.filter((it) => E.results.has(it.full_name));
    const ok = checked.filter((it) => E.results.get(it.full_name).ok);
    const shown = E.items.filter((it) => {
      const r = E.results.get(it.full_name);
      return !E.onlyOk || !r || r.ok;
    });
    const pending = E.items.length - checked.length;
    $("#storeFree").innerHTML = E.error ? `<div class="notice">${esc(E.error)}</div>` :
      `<b>${ok.length}</b> runnable app${ok.length === 1 ? "" : "s"} found in ${checked.length} checked repositories` +
      (pending ? ` · checking ${pending}…` : "") +
      ` · ${E.total.toLocaleString("en")} matches on GitHub · <b>${fmtBytes(S.free)}</b> free on your Pico`;
    if (!shown.length) {
      grid.innerHTML = E.loading || pending ? Array(6).fill('<div class="skeleton"></div>').join("") :
        `<div class="store-msg" style="grid-column:1/-1"><p>${E.error ? "" : "No runnable apps on this page yet."}</p>${hasMore() ? "" : '<p class="muted">Try another category or search term.</p>'}</div>`;
    } else {
      grid.innerHTML = shown.map((it) => card(it, total)).join("") + (E.loading ? '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>' : "");
    }
    $("#storeMore").hidden = !(hasMore() && !E.loading && !E.error);
  }

  function card(it, total) {
    const r = E.results.get(it.full_name);
    const id = appIdFor(it);
    const inst = S.apps.find((a) => a.id === id || (a.repo && a.repo.toLowerCase() === it.full_name.toLowerCase() && a.source === "github"));
    const iconUrl = r && r.ok && r.icon ? rawUrl(it.full_name, r.branch, (r.root ? r.root + "/" : "") + r.icon) : `${it.avatar}${it.avatar.includes("?") ? "&" : "?"}s=96`;
    const name = (r && r.manifest && r.manifest.name) || it.name;
    const desc = (r && r.manifest && r.manifest.description) || it.description || "No description.";
    let tags = `<span class="tag gh">${icon("github").replace("<svg", '<svg width="11" height="11"')} ★ ${fmtStars(it.stars)}</span>`;
    if (it.license) tags += `<span class="tag">${esc(it.license)}</span>`;
    let btn = "";
    let cls = "";
    if (!r) {
      cls = "checking";
      tags = `<span class="tag checking-tag"><i class="spin"></i>Checking…</span>` + tags;
    } else if (!r.ok) {
      cls = "bad";
      tags += `<span class="reason">${esc(r.reason)}</span>`;
    } else {
      const cost = r.files.reduce((n, f) => n + diskCost(f.size), 0);
      const fits = cost <= S.free + (inst ? inst.size : 0);
      tags = `<span class="tag ${fits ? "ok" : "bad"}">${fmtBytes(r.size)}</span>` + tags;
      if (r.internet) tags += '<span class="tag warn" title="Loads libraries from a CDN">Needs internet</span>';
      tags += `<span class="tag" title="Last update">${ago(it.pushed_at)}</span>`;
      const busy = E.installing[it.full_name];
      if (busy) btn = `<div class="mini-progress"><i style="width:${Math.round(busy * 100)}%"></i></div>`;
      else if (inst && inst.version === it.pushed_at) btn = `<button class="btn glass sm" data-exopen="${esc(inst.id)}">Open</button>`;
      else if (!fits) btn = `<button class="btn glass sm" disabled>${total && cost > total ? "Too big" : "No space"}</button>`;
      else btn = `<button class="btn primary sm" data-exinstall="${esc(it.full_name)}">${inst ? "Update" : "Install"}</button>`;
    }
    return `<article class="store-card ${cls}">
      <div class="store-top">${D.appIconHTML({ id: it.full_name, name, icon: "" }, iconUrl)}
        <div style="min-width:0"><div class="store-title">${esc(name)}</div>
        <div class="store-by"><a class="store-link" href="${esc(it.html_url)}" target="_blank" rel="noopener">${esc(it.full_name)}</a>${r && r.ok && (r.root || r.branch !== it.default_branch) ? ` <span class="muted">· ${esc([r.branch !== it.default_branch ? r.branch : "", r.root].filter(Boolean).join(":"))}</span>` : ""}</div></div></div>
      <p class="store-desc">${esc(desc)}</p>
      <div class="store-foot"><div class="tags">${tags}</div><div style="min-width:84px;display:flex;justify-content:flex-end">${btn}</div></div>
    </article>`;
  }

  // ------------------------------------------------------------ install
  async function install(fullName) {
    const it = E.items.find((x) => x.full_name === fullName);
    const r = E.results.get(fullName);
    if (!it || !r || !r.ok) return;
    const id = appIdFor(it);
    const man = r.manifest || {};
    const prefix = r.root ? r.root + "/" : "";
    E.installing[fullName] = 0.02;
    render();
    const meta = {
      id,
      name: (man.name || it.name).slice(0, 40),
      version: it.pushed_at,
      description: (man.description || it.description || "").slice(0, 300),
      author: it.owner,
      icon: r.icon || "",
      category: man.category || "GitHub",
      entry: r.entry,
      backend: man.backend || "",
      spa: !!man.spa,
      source: "github",
      repo: it.full_name,
      homepage: it.html_url,
      license: it.license,
      internet: r.internet,
      base_prefix: r.basePrefix,
    };
    const files = r.files.map((f) => ({
      path: f.path, size: f.size,
      get: async () => {
        const res = await fetch(rawUrl(it.full_name, r.branch, prefix + f.path), { cache: "no-store" });
        if (!res.ok) throw new Error(`Download failed: ${f.path} (${res.status})`);
        return res.blob();
      },
    }));
    try {
      const app = await D.installPackage(meta, files, (p) => { E.installing[fullName] = Math.max(0.03, p); scheduleRender(); });
      toast(`${app.name} installed from GitHub on port ${app.port}`);
    } catch (e) {
      toast(`${it.name}: ${e.message}`, "error", 7000);
    }
    delete E.installing[fullName];
    await D.refresh();
    render();
  }

  // ------------------------------------------------------------- events
  function reset() {
    E.gen++;
    E.page = 0; E.items = []; E.total = 0; E.seen = new Set(); E.error = ""; E.autoPages = 0; E.loading = false;
  }

  document.getElementById("storeCats").addEventListener("click", (e) => {
    if (S.storeTab !== "explore") return;
    const c = e.target.closest(".chip");
    if (!c) return;
    if (c.dataset.clear) { E.query = ""; $("#storeSearch").value = ""; }
    else { E.preset = c.dataset.preset; E.query = ""; $("#storeSearch").value = ""; }
    reset();
    fetchPage();
  });
  document.getElementById("storeGrid").addEventListener("click", (e) => {
    if (S.storeTab !== "explore") return;
    const i = e.target.closest("[data-exinstall]");
    if (i) { install(i.dataset.exinstall); return; }
    const o = e.target.closest("[data-exopen]");
    if (o) {
      const a = S.apps.find((x) => x.id === o.dataset.exopen);
      if (a) window.open(D.appUrl(a), "_blank", "noopener");
    }
  });
  document.getElementById("exMore").addEventListener("click", () => { E.autoPages = 0; fetchPage(); });
  document.getElementById("exOnlyOk").addEventListener("change", (e) => { E.onlyOk = e.target.checked; render(); });
  document.getElementById("exSort").addEventListener("change", (e) => { E.sort = e.target.value; reset(); fetchPage(); });

  window.PicoOSExplore = {
    render,
    search(q) { E.query = q; reset(); fetchPage(); },
    // exposed for tests
    _analyze: analyze,
    _state: E,
  };
})();
