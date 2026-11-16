#!/usr/bin/env node
/*
 * Regenerate the screenshots in docs/images/ using the desktop simulator.
 *
 *   node tools/screenshots.js
 *
 * Needs Node.js + Playwright (with Chromium). GitHub requests from the App
 * Store are answered from the local repository, so no network is needed.
 */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "images");
const DASH = 18200;
const SETUP = 18300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startSim(port, extra) {
  const fsDir = fs.mkdtempSync(path.join(os.tmpdir(), "picoos-shot-"));
  const p = spawn("python3", [path.join(ROOT, "tools", "simulator.py"), "--fs", fsDir, "--port", String(port), ...extra], { cwd: ROOT, stdio: "ignore" });
  return { p, fsDir };
}

async function waitUp(url) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.status) return; } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error("simulator did not start: " + url);
}

async function install(base, id) {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "store", "catalog.json"), "utf8"));
  const a = cat.apps.find((x) => x.id === id);
  const meta = { ...a, repo: a.repo || "GokalpHizmetleri/PicoOS", size: a.size, files: a.files.length };
  await fetch(base + "/api/apps/install/begin", { method: "POST", body: JSON.stringify(meta) });
  for (const f of a.files) {
    let body;
    if (a.source === "github") {
      const r = await fetch(a.base + (f.src || f.path).split("/").map(encodeURIComponent).join("/"));
      body = Buffer.from(await r.arrayBuffer());
    } else body = fs.readFileSync(path.join(ROOT, a.path, f.path));
    await fetch(`${base}/api/apps/install/file?id=${id}&path=${encodeURIComponent(f.path)}`, { method: "PUT", body });
  }
  await fetch(base + "/api/apps/install/commit", { method: "POST", body: JSON.stringify({ id }) });
}

async function serveGithubLocally(context) {
  await context.route("https://raw.githubusercontent.com/**", async (route) => {
    const u = new URL(route.request().url());
    const seg = u.pathname.split("/");
    if (`${seg[1]}/${seg[2]}`.toLowerCase() !== "gokalphizmetleri/picoos") return route.continue(); // real upstream repos
    const parts = seg.slice(4); // /owner/repo/branch/...
    const file = path.join(ROOT, ...parts);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "not found" });
    const type = file.endsWith(".json") ? "application/json" : file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".html") ? "text/html" : "application/octet-stream";
    route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { "content-type": type, "access-control-allow-origin": "*" } });
  });
  await context.route("https://api.github.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const dash = startSim(DASH, ["--reset"]);
  const setup = startSim(SETUP, ["--setup"]);
  const base = `http://localhost:${DASH}`;
  const browser = await chromium.launch();
  try {
    await waitUp(base + "/api/status");
    await waitUp(`http://localhost:${SETUP}/api/setup/state`);
    for (const id of ["notes", "2048", "fluid-simulation", "todo", "sudoku", "weather", "pico-control", "system-monitor", "qr-generator", "pixel-paint", "javascript-pong", "focus-timer"]) await install(base, id);
    await fetch(base + "/api/settings", { method: "POST", body: JSON.stringify({ device_name: "Living Room Pico" }) });

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
    await serveGithubLocally(ctx);
    const page = await ctx.newPage();
    const shot = async (name, opts = {}) => { await sleep(opts.wait || 700); await page.screenshot({ path: path.join(OUT, name), ...opts.shot }); console.log("  ", name); };

    // freeze wallpaper animation for crisp shots
    const freeze = () => page.addStyleTag({ content: ".wallpaper i{animation:none!important}" });

    await page.goto(base + "/");
    await freeze();
    await page.waitForSelector(".app-tile");
    await shot("dashboard.png", { wait: 1500 });

    await page.click("#btnStore");
    await page.waitForSelector(".store-card");
    await page.click('#storeTabs [data-tab="github"]');
    await page.waitForSelector(".store-card");
    await shot("app-store.png", { wait: 2500 });
    await page.keyboard.press("Escape");

    await page.click("#btnUpload");
    await shot("upload.png");
    await page.keyboard.press("Escape");

    await page.click("#btnSettings");
    await page.click('[data-pane="time"]');
    await shot("settings.png");
    await page.keyboard.press("Escape");

    // context menu on a tile
    await page.hover('.app-tile[data-id="notes"]');
    await page.click('[data-more="notes"]');
    await shot("app-menu.png", { wait: 400, shot: { clip: { x: 340, y: 60, width: 1100, height: 520 } } });
    await page.keyboard.press("Escape");

    // apps themselves
    const appPage = await ctx.newPage();
    await appPage.setViewportSize({ width: 1200, height: 760 });
    const apps = await (await fetch(base + "/api/apps")).json();
    const port = (id) => apps.apps.find((a) => a.id === id).port;
    await appPage.goto(`http://localhost:${port("system-monitor")}/`);
    await sleep(7000);
    await appPage.screenshot({ path: path.join(OUT, "app-system-monitor.png") }); console.log("   app-system-monitor.png");
    await appPage.goto(`http://localhost:${port("pico-control")}/`);
    await sleep(5000);
    await appPage.screenshot({ path: path.join(OUT, "app-pico-control.png") }); console.log("   app-pico-control.png");
    await appPage.goto(`http://localhost:${port("notes")}/`);
    await sleep(1200);
    await appPage.screenshot({ path: path.join(OUT, "app-notes.png") }); console.log("   app-notes.png");

    // mobile
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "dark" });
    await serveGithubLocally(mctx);
    const m = await mctx.newPage();
    await m.goto(base + "/");
    await m.addStyleTag({ content: ".wallpaper i{animation:none!important}" });
    await m.waitForSelector(".app-tile");
    await sleep(1500);
    await m.screenshot({ path: path.join(OUT, "mobile-dashboard.png") }); console.log("   mobile-dashboard.png");

    // setup portal (phone)
    const s = await mctx.newPage();
    await s.goto(`http://localhost:${SETUP}/`);
    await s.waitForSelector(".net");
    await s.click('.net[data-ssid="HomeNetwork"]');
    await s.fill("#password", "correct horse battery");
    await sleep(500);
    await s.screenshot({ path: path.join(OUT, "setup-portal.png") }); console.log("   setup-portal.png");
    await s.click("#connect");
    await s.waitForSelector("#stepOk:not([hidden])", { timeout: 15000 });
    await sleep(400);
    await s.screenshot({ path: path.join(OUT, "setup-success.png") }); console.log("   setup-success.png");
  } finally {
    await browser.close();
    dash.p.kill(); setup.p.kill();
    fs.rmSync(dash.fsDir, { recursive: true, force: true });
    fs.rmSync(setup.fsDir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
// After running, convert the PNGs (see below). The committed images are converted to WebP (quality 88) to keep the repository small:
//   python3 -c "from PIL import Image;import glob,os;[ (Image.open(p).convert('RGB').save(p[:-4]+'.webp',quality=88,method=6),os.remove(p)) for p in glob.glob('docs/images/*.png')]"
